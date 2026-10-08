import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

/**
 * Frontend hosting for one stage: the S3 bucket holding the Angular build, the
 * CloudFront distribution in front of it, the ACM certificate, and the IAM role
 * GitHub Actions assumes to deploy. Only instantiated for prod — dev serves the
 * app from `ng serve` on localhost and needs none of this.
 *
 * `/api/*` is a CloudFront custom origin pointing at the Pi's Cloudflare Tunnel
 * hostname. CloudFront makes an ordinary HTTPS request to it, so Cloudflare's
 * Universal SSL validates with no extra trust configuration, the browser only
 * ever talks to one origin (so CORS doesn't arise), and the tunnel is never
 * addressed directly by a browser.
 *
 * Every resource here is disposable: the bucket holds build output, the
 * distribution and certificate are recreatable. That's deliberate — it's what
 * makes this stack safe to destroy and recreate under a different name, which
 * is exactly what the stack it replaced (NextFrontendStack) could not do.
 */
export interface FrontendStackProps extends cdk.StackProps {
  // 'prod' today. Drives physical resource names so they survive a stack
  // rename and don't collide between stages.
  stage: string;

  // Domain the stack's ACM certificate is issued for, e.g.
  // "costco.jd-sanchez.com". Always set: the certificate is created even
  // before this distribution claims the matching alias.
  certificateDomainName: string;
  certificateAlternativeNames?: string[];

  // CloudFront alternate domain names. Deliberately SEPARATE from the
  // certificate's domains, because CloudFront rejects an alternate domain name
  // that is already assigned to another distribution. During a cutover this
  // stack is therefore deployed twice: first with no aliases at all (the
  // certificate validates and the distribution builds while the old
  // distribution is still serving traffic), then again with the alias once the
  // old distribution has released it. Omitting this also omits the
  // certificate from the distribution, since CloudFront only accepts one
  // alongside at least one alias.
  aliases?: string[];

  // The Cloudflare Tunnel hostname fronting the Pi's API container, e.g.
  // "costco-api.jd-sanchez.dev".
  apiOriginDomainName: string;

  // "owner/repo" allowed to deploy, e.g. "jdsanchez93/costco-receipt-manager".
  // Together with githubOidcProviderArn this creates the role
  // .github/workflows/frontend.yml assumes; omit either and no role is made.
  githubRepo?: string;

  // ARN of the account's existing GitHub Actions OIDC provider. AWS permits
  // exactly one per URL per account, and it's a shared account-level resource
  // rather than something an app stack should own, so it's created once out of
  // band and referenced here. See api/deploy/README.md for the command.
  githubOidcProviderArn?: string;
}

export class FrontendStack extends cdk.Stack {
  public readonly frontendBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const aliases = props.aliases ?? [];

    this.frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `costco-receipts-${props.stage}-frontend-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true, // build artifacts, reproducible from a git ref
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
    });

    const oac = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      description: `OAC for the ${props.stage} frontend bucket`,
    });

    // Stack-managed, not imported by ARN — no more hand-created certificates
    // CDK doesn't know about. Route 53 for jd-sanchez.com lives in a different
    // AWS account than this stack deploys into, so CDK can't write the DNS
    // validation records itself; CertificateValidation.fromDns() with no
    // hostedZone means `cdk deploy` blocks until the validation CNAMEs exist.
    // In practice ACM's validation record name for a given domain is stable, so
    // if a previous certificate for the same domain left its CNAME in Route 53,
    // this validates immediately. Don't delete those records during a cutover.
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.certificateDomainName,
      subjectAlternativeNames: props.certificateAlternativeNames,
      validation: acm.CertificateValidation.fromDns(),
    });

    const apiOrigin = new origins.HttpOrigin(props.apiOriginDomainName, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      // See the `aliases` prop comment: CloudFront only accepts a certificate
      // together with at least one alternate domain name, so during the
      // no-alias bootstrap deploy both are omitted and the distribution serves
      // on its default *.cloudfront.net name.
      ...(aliases.length > 0 ? { domainNames: aliases, certificate } : {}),
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
        // Angular client-side routing: unknown paths are app routes, not 404s.
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

    // GitHub Actions deploy role — OIDC, so no static access keys live in the
    // repo. (The Pi needs a long-lived IAM user because it isn't AWS compute;
    // Actions supports OIDC natively, so that reasoning doesn't carry here.)
    //
    // Trust is scoped to this repo AND its `production` environment, so only
    // the protected deploy job can assume it — a workflow on another branch,
    // or from a fork's pull request, cannot. That matters because this is a
    // public repository.
    if (props.githubRepo && props.githubOidcProviderArn) {
      const deployRole = new iam.Role(this, 'GithubDeployRole', {
        // Pinned rather than CDK-generated so the ARN survives a stack
        // recreation — .github/workflows/frontend.yml reads it from a GitHub
        // repository variable, which would otherwise silently go stale.
        roleName: `costco-receipts-${props.stage}-frontend-deploy`,
        description: 'Assumed by GitHub Actions to deploy the Angular build',
        maxSessionDuration: cdk.Duration.hours(1),
        assumedBy: new iam.WebIdentityPrincipal(props.githubOidcProviderArn, {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            // Exact match, not StringLike — no wildcard is needed, and a loose
            // pattern here is the classic way one of these roles ends up
            // assumable by a repository you don't control.
            'token.actions.githubusercontent.com:sub': `repo:${props.githubRepo}:environment:production`,
          },
        }),
      });

      // Covers Get/Put/Delete/List. DeleteObject is what `aws s3 sync --delete`
      // needs to prune superseded hashed bundles.
      this.frontendBucket.grantReadWrite(deployRole);

      deployRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ['cloudfront:CreateInvalidation'],
          resources: [
            `arn:aws:cloudfront::${this.account}:distribution/${this.distribution.distributionId}`,
          ],
        })
      );

      new cdk.CfnOutput(this, 'GithubDeployRoleArn', {
        value: deployRole.roleArn,
        description: 'Set as the AWS_DEPLOY_ROLE_ARN repository variable in GitHub',
      });
    }

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
      description: 'Set as the CLOUDFRONT_DISTRIBUTION_ID repository variable in GitHub',
    });

    new cdk.CfnOutput(this, 'CloudFrontDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'Point the Route 53 alias record at this',
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: this.frontendBucket.bucketName,
      description: 'Set as the FRONTEND_BUCKET repository variable in GitHub',
    });
  }
}
