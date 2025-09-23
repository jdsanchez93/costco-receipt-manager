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

    // Lambda Layer for shared dependencies
    const sharedLayer = this.createSharedLayer();

    // Lambda Functions
    const functions = this.createLambdaFunctions(
      sharedLayer,
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
    this.api = this.createApiGateway(functions);

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

  private createSharedLayer(): lambda.LayerVersion {
    return new lambda.LayerVersion(this, 'SharedLayer', {
      layerVersionName: `${this.stackName}-shared-layer`,
      code: lambda.Code.fromAsset('lambda/layers/shared'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
      description: 'Shared dependencies for Costco Receipts Lambda functions',
    });
  }

  private createLambdaFunctions(
    sharedLayer: lambda.LayerVersion,
    mainTable: dynamodb.ITable,
    envVars: {
      auth0Domain: string;
      auth0Audience: string;
      s3UploadApiUrl: string;
      s3DownloadApiUrl: string;
      customDomainName?: string;
    }
  ) {
    const environment = {
      DYNAMODB_TABLE_MAIN: mainTable.tableName,
      AUTH0_DOMAIN: envVars.auth0Domain,
      AUTH0_AUDIENCE: envVars.auth0Audience,
      S3_UPLOAD_API_URL: envVars.s3UploadApiUrl,
      S3_DOWNLOAD_API_URL: envVars.s3DownloadApiUrl,
      CLOUDFRONT_DOMAIN: envVars.customDomainName || '',
    };

    const commonProps = {
      runtime: lambda.Runtime.NODEJS_18_X,
      layers: [sharedLayer],
      environment,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      logRetention: logs.RetentionDays.ONE_WEEK,
    };

    // Create functions
    const getUserReceiptsFunction = new lambda.Function(this, 'GetUserReceiptsFunction', {
      ...commonProps,
      functionName: `${this.stackName}-get-user-receipts`,
      code: lambda.Code.fromAsset('lambda/functions'),
      handler: 'get-user-receipts.handler',
      description: 'Get receipts for authenticated user',
    });

    const getReceiptItemsFunction = new lambda.Function(this, 'GetReceiptItemsFunction', {
      ...commonProps,
      functionName: `${this.stackName}-get-receipt-items`,
      code: lambda.Code.fromAsset('lambda/functions'),
      handler: 'get-receipt-items.handler',
      description: 'Get items for a specific receipt',
    });

    const updateItemAssignmentFunction = new lambda.Function(this, 'UpdateItemAssignmentFunction', {
      ...commonProps,
      functionName: `${this.stackName}-update-item-assignment`,
      code: lambda.Code.fromAsset('lambda/functions'),
      handler: 'update-item-assignment.handler',
      description: 'Update item assignments to members',
    });

    const getReceiptMembersFunction = new lambda.Function(this, 'GetReceiptMembersFunction', {
      ...commonProps,
      functionName: `${this.stackName}-get-receipt-members`,
      code: lambda.Code.fromAsset('lambda/functions'),
      handler: 'get-receipt-members.handler',
      description: 'Get members for a specific receipt',
    });

    const addReceiptMemberFunction = new lambda.Function(this, 'AddReceiptMemberFunction', {
      ...commonProps,
      functionName: `${this.stackName}-add-receipt-member`,
      code: lambda.Code.fromAsset('lambda/functions'),
      handler: 'add-receipt-member.handler',
      description: 'Add a member to a receipt',
    });

    const createReceiptShareFunction = new lambda.Function(this, 'CreateReceiptShareFunction', {
      ...commonProps,
      functionName: `${this.stackName}-create-receipt-share`,
      code: lambda.Code.fromAsset('lambda/functions'),
      handler: 'create-receipt-share.handler',
      description: 'Create a shareable link for a receipt',
    });

    const getReceiptSharesFunction = new lambda.Function(this, 'GetReceiptSharesFunction', {
      ...commonProps,
      functionName: `${this.stackName}-get-receipt-shares`,
      code: lambda.Code.fromAsset('lambda/functions'),
      handler: 'get-receipt-shares.handler',
      description: 'Get all share links for a receipt',
    });

    const getSharedReceiptFunction = new lambda.Function(this, 'GetSharedReceiptFunction', {
      ...commonProps,
      functionName: `${this.stackName}-get-shared-receipt`,
      code: lambda.Code.fromAsset('lambda/functions'),
      handler: 'get-shared-receipt.handler',
      description: 'Get shared receipt data (public access)',
    });

    const getUploadUrlFunction = new lambda.Function(this, 'GetUploadUrlFunction', {
      ...commonProps,
      functionName: `${this.stackName}-get-upload-url`,
      code: lambda.Code.fromAsset('lambda/functions'),
      handler: 'get-upload-url.handler',
      description: 'Get presigned URL for receipt upload',
    });

    const getDownloadUrlFunction = new lambda.Function(this, 'GetDownloadUrlFunction', {
      ...commonProps,
      functionName: `${this.stackName}-get-download-url`,
      code: lambda.Code.fromAsset('lambda/functions'),
      handler: 'get-download-url.handler',
      description: 'Get presigned URL for receipt download',
    });

    const validateReceiptFunction = new lambda.Function(this, 'ValidateReceiptFunction', {
      ...commonProps,
      functionName: `${this.stackName}-validate-receipt`,
      code: lambda.Code.fromAsset('lambda/functions'),
      handler: 'validate-receipt.handler',
      description: 'Validate receipt subtotal',
    });

    const updateMemberDetailsFunction = new lambda.Function(this, 'UpdateMemberDetailsFunction', {
      ...commonProps,
      functionName: `${this.stackName}-update-member-details`,
      code: lambda.Code.fromAsset('lambda/functions'),
      handler: 'update-member-details.handler',
      description: 'Update member details with JWT info',
    });

    const getReceiptGeometryFunction = new lambda.Function(this, 'GetReceiptGeometryFunction', {
      ...commonProps,
      functionName: `${this.stackName}-get-receipt-geometry`,
      code: lambda.Code.fromAsset('lambda/functions'),
      handler: 'get-receipt-geometry.handler',
      description: 'Get receipt geometry data',
    });

    // Grant DynamoDB permissions to all functions
    const functions = [
      getUserReceiptsFunction,
      getReceiptItemsFunction,
      updateItemAssignmentFunction,
      getReceiptMembersFunction,
      addReceiptMemberFunction,
      createReceiptShareFunction,
      getReceiptSharesFunction,
      getSharedReceiptFunction,
      getUploadUrlFunction,
      getDownloadUrlFunction,
      validateReceiptFunction,
      updateMemberDetailsFunction,
      getReceiptGeometryFunction,
    ];

    functions.forEach((fn) => {
      mainTable.grantReadWriteData(fn);
      
      // Also grant access to GSI if needed
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: [
          'dynamodb:Query',
          'dynamodb:Scan'
        ],
        resources: [
          `${mainTable.tableArn}/index/*`
        ],
      }));
    });

    return {
      getUserReceipts: getUserReceiptsFunction,
      getReceiptItems: getReceiptItemsFunction,
      updateItemAssignment: updateItemAssignmentFunction,
      getReceiptMembers: getReceiptMembersFunction,
      addReceiptMember: addReceiptMemberFunction,
      createReceiptShare: createReceiptShareFunction,
      getReceiptShares: getReceiptSharesFunction,
      getSharedReceipt: getSharedReceiptFunction,
      getUploadUrl: getUploadUrlFunction,
      getDownloadUrl: getDownloadUrlFunction,
      validateReceipt: validateReceiptFunction,
      updateMemberDetails: updateMemberDetailsFunction,
      getReceiptGeometry: getReceiptGeometryFunction,
    };
  }

  private createApiGateway(functions: any): apigateway.RestApi {
    const api = new apigateway.RestApi(this, 'CostcoReceiptsApi', {
      restApiName: `${this.stackName}-api`,
      description: 'Costco Receipt Management API',
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

    // API Routes
    // Note: Authentication is handled within Lambda functions using auth-utils
    const apiRoot = api.root.addResource('api');

    // Health check (no auth)
    const healthResource = api.root.addResource('health');
    healthResource.addMethod('GET', new apigateway.MockIntegration({
      integrationResponses: [{
        statusCode: '200',
        responseTemplates: {
          'application/json': JSON.stringify({
            status: 'ok',
            timestamp: '$context.requestTime'
          })
        }
      }],
      requestTemplates: {
        'application/json': '{"statusCode": 200}'
      }
    }), {
      methodResponses: [{ statusCode: '200' }]
    });

    // Receipts resource
    const receiptsResource = apiRoot.addResource('receipts');

    // User receipts (authenticated)
    const userReceiptsResource = receiptsResource.addResource('user-receipts');
    userReceiptsResource.addMethod('GET', new apigateway.LambdaIntegration(functions.getUserReceipts));

    // Upload URLs (authenticated)
    const getUploadUrlResource = receiptsResource.addResource('get-upload-url');
    getUploadUrlResource.addMethod('POST', new apigateway.LambdaIntegration(functions.getUploadUrl));

    // Download URLs (authenticated)
    const getDownloadUrlResource = receiptsResource.addResource('get-download-url');
    const receiptDownloadResource = getDownloadUrlResource.addResource('{receiptId}');
    receiptDownloadResource.addMethod('GET', new apigateway.LambdaIntegration(functions.getDownloadUrl));

    // Receipt-specific resources
    const receiptResource = receiptsResource.addResource('receipt');
    const receiptIdResource = receiptResource.addResource('{receiptId}');

    // Receipt items
    const itemsResource = receiptIdResource.addResource('items');
    itemsResource.addMethod('GET', new apigateway.LambdaIntegration(functions.getReceiptItems));

    // Receipt geometry
    const geometryResource = receiptIdResource.addResource('geometry');
    geometryResource.addMethod('GET', new apigateway.LambdaIntegration(functions.getReceiptGeometry));

    // Item assignment
    const itemResource = itemsResource.addResource('{itemId}');
    const assignmentResource = itemResource.addResource('assignment');
    assignmentResource.addMethod('PUT', new apigateway.LambdaIntegration(functions.updateItemAssignment));

    // Bulk assignments
    const assignmentsResource = itemsResource.addResource('assignments');
    const bulkAssignmentsResource = assignmentsResource.addResource('bulk');
    bulkAssignmentsResource.addMethod('PUT', new apigateway.LambdaIntegration(functions.updateItemAssignment));

    const allAssignmentsResource = assignmentsResource.addResource('all');
    allAssignmentsResource.addMethod('DELETE', new apigateway.LambdaIntegration(functions.updateItemAssignment));

    // Receipt members
    const membersResource = receiptIdResource.addResource('members');
    membersResource.addMethod('GET', new apigateway.LambdaIntegration(functions.getReceiptMembers));
    membersResource.addMethod('POST', new apigateway.LambdaIntegration(functions.addReceiptMember));

    // Update member details
    const updateDetailsResource = membersResource.addResource('update-details');
    updateDetailsResource.addMethod('PUT', new apigateway.LambdaIntegration(functions.updateMemberDetails));

    // Receipt sharing
    const shareResource = receiptIdResource.addResource('share');
    shareResource.addMethod('POST', new apigateway.LambdaIntegration(functions.createReceiptShare));

    const sharesResource = receiptIdResource.addResource('shares');
    sharesResource.addMethod('GET', new apigateway.LambdaIntegration(functions.getReceiptShares));

    // Receipt validation
    const validateResource = receiptsResource.addResource('validate');
    const validateReceiptResource = validateResource.addResource('{receiptId}');
    validateReceiptResource.addMethod('POST', new apigateway.LambdaIntegration(functions.validateReceipt));

    // Shared receipt (no auth required)
    const sharedResource = receiptsResource.addResource('shared');
    const sharedReceiptResource = sharedResource.addResource('{shareToken}');
    sharedReceiptResource.addMethod('GET', new apigateway.LambdaIntegration(functions.getSharedReceipt));

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
          origin: new origins.RestApiOrigin(this.api),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          compress: false,
        },
        '/health': {
          origin: new origins.RestApiOrigin(this.api),
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