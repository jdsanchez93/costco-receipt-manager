import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

/**
 * The new .NET/Angular/MySQL stack's frontend — entirely separate from
 * CostcoReceiptsStack (the old React/Lambda/DynamoDB stack) on purpose, per
 * docs/redesign-plan.md's "Path to cutover": this needs to be deployable and
 * testable under `next.jd-sanchez.com` with zero risk of touching the live
 * `costco.jd-sanchez.com` distribution, and its own eventual teardown should
 * be independent of the old stack's Lambda/API Gateway (which stays alive
 * until the Pi cutover retires it too — see the plan doc).
 *
 * `/api/*` is a CloudFront custom origin pointing at the Pi's Cloudflare
 * Tunnel hostname, not API Gateway — same shape as the old stack's `/api/*`
 * behavior, just a different kind of origin behind it.
 */
export interface NextFrontendStackProps extends cdk.StackProps {
  // e.g. "next.jd-sanchez.com" for now. costco.jd-sanchez.com is added as
  // a cert SAN (see additionalDomainNames) but deliberately NOT as a
  // CloudFront alias yet — CloudFront rejects an alternate domain name
  // that's already assigned to another distribution, and it's still
  // assigned to the live old distribution until the actual cutover step
  // in the plan doc (deregister there, add here, then flip DNS).
  domainName: string;

  // Extra SANs on the cert this stack creates — costco.jd-sanchez.com,
  // so the cert is already valid for the real domain before cutover ever
  // happens, with zero issuance wait in that critical path.
  additionalDomainNames?: string[];

  // The Cloudflare Tunnel hostname fronting the Pi's API container, e.g.
  // "costco-api.jd-sanchez.dev". CloudFront treats this like any other
  // HTTPS origin — hits Cloudflare's edge, routed into the tunnel.
  apiOriginDomainName: string;
}

export class NextFrontendStack extends cdk.Stack {
  public readonly frontendBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: NextFrontendStackProps) {
    super(scope, id, props);

    this.frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `${this.stackName.toLowerCase()}-frontend-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true, // build artifacts, reproducible — same as CostcoReceiptsStack's frontend bucket
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
    });

    const oac = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      description: 'OAC for the next-gen frontend bucket',
    });

    // Stack-managed, not imported by ARN — no more manually-created certs
    // CDK doesn't know about. Route 53 for jd-sanchez.com lives in a
    // different AWS account than this stack deploys into, so CDK can't
    // auto-write the DNS validation records the way it could with a
    // same-account hosted zone reference; CertificateValidation.fromDns()
    // with no hostedZone just means `cdk deploy` blocks until the
    // validation CNAMEs are added manually (same manual step as before,
    // just now the cert itself is a first-class stack resource).
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.domainName,
      subjectAlternativeNames: props.additionalDomainNames,
      validation: acm.CertificateValidation.fromDns(),
    });

    const apiOrigin = new origins.HttpOrigin(props.apiOriginDomainName, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      domainNames: [props.domainName],
      certificate,
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
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        // Angular router (client-side routing) — same pattern as the old
        // stack's SPA error handling.
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

    this.frontendBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [`${this.frontendBucket.bucketArn}/*`],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${this.distribution.distributionId}`,
          },
        },
      })
    );

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront Distribution ID',
      exportName: `${this.stackName}-CloudFrontDistributionId`,
    });

    new cdk.CfnOutput(this, 'CloudFrontDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront Distribution Domain Name — point next.jd-sanchez.com at this via Route 53',
      exportName: `${this.stackName}-CloudFrontDomainName`,
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: this.frontendBucket.bucketName,
      description: 'S3 Bucket for the Angular build',
      exportName: `${this.stackName}-FrontendBucketName`,
    });
  }
}
