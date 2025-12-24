import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface CostcoReceiptsStackProps extends cdk.StackProps {
  // Required DynamoDB table name from external stack
  mainTableName: string;
  
  // Optional Auth0 configuration
  auth0Domain?: string;
  auth0Audience?: string;
  
  // Optional S3 API URLs
  s3UploadApiUrl?: string;
  s3DownloadApiUrl?: string;
  
  // Optional to disable frontend resources
  deployFrontend?: boolean;
  
  // Optional custom domain configuration
  customDomainName?: string;
  // ARN of existing ACM certificate (must be in us-east-1)
  certificateArn?: string;
}

export class CostcoReceiptsStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly frontendBucket?: s3.Bucket;
  public readonly distribution?: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: CostcoReceiptsStackProps) {
    super(scope, id, props);

    // Validate required props
    if (!props.mainTableName) {
      throw new Error('mainTableName is a required prop');
    }

    // Environment variables from context or props
    const auth0Domain = props.auth0Domain || this.node.tryGetContext('auth0Domain') || 'your-tenant.auth0.com';
    const auth0Audience = props.auth0Audience || this.node.tryGetContext('auth0Audience') || 'https://your-api-identifier';
    const s3UploadApiUrl = props.s3UploadApiUrl || this.node.tryGetContext('s3UploadApiUrl') || '';
    const s3DownloadApiUrl = props.s3DownloadApiUrl || this.node.tryGetContext('s3DownloadApiUrl') || '';
    const deployFrontend = props.deployFrontend !== false; // Default to true
    const customDomainName = props.customDomainName || this.node.tryGetContext('customDomainName');
    const certificateArn = props.certificateArn || this.node.tryGetContext('certificateArn');

    // Import existing DynamoDB table
    const mainTable = dynamodb.Table.fromTableName(
      this,
      'ImportedMainTable',
      props.mainTableName
    );

    // Single .NET Lambda Function
    const apiFunction = this.createDotNetApiFunction(
      mainTable,
      {
        auth0Domain,
        auth0Audience,
        s3UploadApiUrl,
        s3DownloadApiUrl,
        customDomainName,
      }
    );

    // API Gateway
    this.api = this.createApiGateway(apiFunction);

    // Frontend resources (optional)
    if (deployFrontend) {
      // S3 Bucket for Frontend
      this.frontendBucket = this.createFrontendBucket();

      // CloudFront Distribution
      this.distribution = this.createCloudFrontDistribution(customDomainName, certificateArn);
    }

    // Outputs
    this.createOutputs(deployFrontend);
  }

  private createDotNetApiFunction(
    mainTable: dynamodb.ITable,
    envVars: {
      auth0Domain: string;
      auth0Audience: string;
      s3UploadApiUrl: string;
      s3DownloadApiUrl: string;
      customDomainName?: string;
    }
  ): lambda.Function {
    const environment: { [key: string]: string } = {
      DYNAMODB_TABLE_MAIN: mainTable.tableName,
      AUTH0_DOMAIN: envVars.auth0Domain,
      AUTH0_AUDIENCE: envVars.auth0Audience,
      S3_UPLOAD_API_URL: envVars.s3UploadApiUrl,
      S3_DOWNLOAD_API_URL: envVars.s3DownloadApiUrl,
      CLOUDFRONT_DOMAIN: envVars.customDomainName || '',
    };

    // Configure CORS allowed origins for production
    // .NET reads array configuration from environment variables using __ notation
    if (envVars.customDomainName) {
      // Set CORS to allow the custom domain where frontend is hosted
      environment['Cors__AllowedOrigins__0'] = `https://${envVars.customDomainName}`;
    }

    const logGroup = new logs.LogGroup(this, 'CostcoReceiptsApiFunctionLogGroup', {
      logGroupName: `/aws/lambda/${this.stackName}-api`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const apiFunction = new lambda.Function(this, 'CostcoReceiptsApiFunction', {
      functionName: `${this.stackName}-api`,
      runtime: lambda.Runtime.DOTNET_8,
      code: lambda.Code.fromAsset('src', {
        bundling: {
          image: lambda.Runtime.DOTNET_8.bundlingImage,
          command: [
            '/bin/sh',
            '-c',
            'cd /asset-input && dotnet restore CostcoReceipts.Api/CostcoReceipts.Api.csproj && dotnet publish CostcoReceipts.Api/CostcoReceipts.Api.csproj -c Release -o /asset-output --no-restore'
          ],
        },
      }),
      handler: 'CostcoReceipts.Api',
      environment,
      timeout: cdk.Duration.seconds(30),
      memorySize: 1024, // .NET typically needs more memory than Node.js
      logGroup,
      description: 'Costco Receipts API - .NET 8 ASP.NET Core Lambda',
    });

    // Grant DynamoDB permissions
    mainTable.grantReadWriteData(apiFunction);
    
    // Grant access to GSI indexes
    apiFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [
        `${mainTable.tableArn}/index/*`
      ],
    }));

    return apiFunction;
  }

  private createApiGateway(apiFunction: lambda.Function): apigateway.RestApi {
    // Changed logical ID to force recreation and remove stale Node.js routes
    const api = new apigateway.RestApi(this, 'CostcoReceiptsApiV2', {
      restApiName: `${this.stackName}-api`,
      description: 'Costco Receipt Management API (.NET)',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Amz-User-Agent',
        ],
      },
      binaryMediaTypes: ['image/*'],
    });

    // Single Lambda proxy integration for all routes
    const integration = new apigateway.LambdaIntegration(apiFunction, {
      proxy: true,
      allowTestInvoke: true,
    });

    // Proxy all requests to the single .NET Lambda function
    api.root.addProxy({
      defaultIntegration: integration,
      anyMethod: true,
    });

    return api;
  }

  private createFrontendBucket(): s3.Bucket {
    return new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `${this.stackName.toLowerCase()}-frontend-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true, // For development
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
    });
  }

  private createCloudFrontDistribution(customDomainName?: string, certificateArn?: string): cloudfront.Distribution {
    if (!this.frontendBucket) {
      throw new Error('Frontend bucket must be created before CloudFront distribution');
    }

    const oac = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      description: 'OAC for Costco Receipts Frontend',
    });

    // Import certificate if provided
    let certificate: acm.ICertificate | undefined;
    if (certificateArn) {
      certificate = acm.Certificate.fromCertificateArn(this, 'ImportedCertificate', certificateArn);
    }

    // Single API origin reused for all API behaviors
    const apiOrigin = new origins.RestApiOrigin(this.api);

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      domainNames: customDomainName ? [customDomainName] : undefined,
      certificate: certificate,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.frontendBucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          compress: false,
        },
        '/health': {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          compress: false,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(300),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(300),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
    });

    // Grant CloudFront access to S3 bucket
    this.frontendBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [`${this.frontendBucket.bucketArn}/*`],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
          },
        },
      })
    );

    return distribution;
  }

  private createOutputs(deployFrontend: boolean): void {
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.url,
      description: 'API Gateway URL',
      exportName: `${this.stackName}-ApiGatewayUrl`,
    });

    if (deployFrontend && this.distribution && this.frontendBucket) {
      new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
        value: this.distribution.distributionId,
        description: 'CloudFront Distribution ID',
        exportName: `${this.stackName}-CloudFrontDistributionId`,
      });

      new cdk.CfnOutput(this, 'CloudFrontDomainName', {
        value: this.distribution.distributionDomainName,
        description: 'CloudFront Distribution Domain Name',
        exportName: `${this.stackName}-CloudFrontDomainName`,
      });

      new cdk.CfnOutput(this, 'FrontendBucketName', {
        value: this.frontendBucket.bucketName,
        description: 'S3 Bucket for Frontend',
        exportName: `${this.stackName}-FrontendBucketName`,
      });
    }
  }
}