#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CostcoReceiptsStack } from '../lib/costco-receipts-stack';
import { NextFrontendStack } from '../lib/next-frontend-stack';
import { DevReceiptProcessingStack } from '../lib/dev-receipt-processing-stack';
import { ReceiptProcessingStack } from '../lib/receipt-processing-stack';
import { FrontendStack } from '../lib/frontend-stack';

const app = new cdk.App();

// CDK context values come through as real booleans from cdk.context.json but
// as strings ("true") from a `-c flag=true` CLI override — normalize both.
function contextFlag(name: string): boolean {
  const value = app.node.tryGetContext(name);
  return value === true || value === 'true';
}

// Get configuration from context or environment variables
const mainTableName = app.node.tryGetContext('mainTableName') || process.env.DYNAMODB_TABLE_MAIN;

// Validate required table name
if (!mainTableName) {
  throw new Error(`
    Missing required DynamoDB table name. Please provide it via:
    1. CDK context: cdk deploy -c mainTableName=MyTable
    2. Environment variable: DYNAMODB_TABLE_MAIN=MyTable cdk deploy
    3. cdk.context.json file
  `);
}

new CostcoReceiptsStack(app, 'CostcoReceiptsStack', {
  // Required: DynamoDB table name from external stack
  mainTableName,

  // Optional: Auth0 configuration (can also be set in cdk.context.json)
  auth0Domain: app.node.tryGetContext('auth0Domain'),
  auth0Audience: app.node.tryGetContext('auth0Audience'),

  // Optional: S3 API URLs (can also be set in cdk.context.json)
  s3UploadApiUrl: app.node.tryGetContext('s3UploadApiUrl'),
  s3DownloadApiUrl: app.node.tryGetContext('s3DownloadApiUrl'),

  // Optional: Deploy frontend resources (default: true)
  deployFrontend: app.node.tryGetContext('deployFrontend') !== false,

  // Optional: deploy the receipt-image bucket + OCR processor Lambda
  // (default: false — code-complete but not cut over yet, see
  // docs/redesign-plan.md Phase 2).
  deployReceiptProcessing: contextFlag('deployReceiptProcessing'),
  receiptBucketName: app.node.tryGetContext('receiptBucketName'),
  receiptBucketAllowedOrigins: app.node.tryGetContext('receiptBucketAllowedOrigins'),
  internalApiUrl: app.node.tryGetContext('internalApiUrl'),
  internalApiKey: app.node.tryGetContext('internalApiKey'),

  // Optional: wire the bucket's S3 event notification to the processor
  // Lambda (default: false). Deliberately separate from
  // deployReceiptProcessing — dev should deploy the real Lambda without
  // this, so test uploads don't also trigger it automatically. Only prod
  // should set this true.
  attachReceiptProcessorTrigger: contextFlag('attachReceiptProcessorTrigger'),

  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
    region: 'us-east-1',
  },
  description: 'Costco Receipt Management System - Serverless API with CDK (External DynamoDB)',
});

// The new .NET/Angular/MySQL stack's frontend. Deliberately its own stack —
// see next-frontend-stack.ts's doc comment. Only touched by name
// (`cdk deploy NextFrontendStack`), never by a bare `cdk deploy`, so it's
// safe to always instantiate here without a feature flag.
const nextFrontendDomainName = app.node.tryGetContext('nextFrontendDomainName');
const nextFrontendAdditionalDomainNames = app.node.tryGetContext('nextFrontendAdditionalDomainNames');
const nextFrontendApiOriginDomainName = app.node.tryGetContext('nextFrontendApiOriginDomainName');

if (nextFrontendDomainName && nextFrontendApiOriginDomainName) {
  new NextFrontendStack(app, 'NextFrontendStack', {
    domainName: nextFrontendDomainName,
    additionalDomainNames: nextFrontendAdditionalDomainNames,
    apiOriginDomainName: nextFrontendApiOriginDomainName,
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
      region: 'us-east-1',
    },
    description: 'Costco Receipt Management System - next-gen frontend (Angular/CloudFront over the Pi tunnel)',
  });
}

// Dev-environment receipt-image bucket + OCR processor Lambda. Its own
// stack, not a full "dev CostcoReceiptsStack" — see
// dev-receipt-processing-stack.ts's doc comment. Only touched by name
// (`cdk deploy DevReceiptProcessingStack`), same as NextFrontendStack.
const devReceiptBucketName = app.node.tryGetContext('devReceiptBucketName');
const devInternalApiUrl = app.node.tryGetContext('devInternalApiUrl');
const devInternalApiKey = app.node.tryGetContext('devInternalApiKey');

if (devReceiptBucketName && devInternalApiUrl && devInternalApiKey) {
  new DevReceiptProcessingStack(app, 'DevReceiptProcessingStack', {
    receiptBucketName: devReceiptBucketName,
    receiptBucketAllowedOrigins: app.node.tryGetContext('devReceiptBucketAllowedOrigins')
      || ['http://localhost:4200'],
    internalApiUrl: devInternalApiUrl,
    internalApiKey: devInternalApiKey,
    // Default false — see costco-receipt-processor's script-prefix work
    // in docs/redesign-plan.md before ever setting this true: today the
    // local-invoke script's uploads share the same `uploads/` prefix the
    // trigger watches, so turning this on before that script is updated
    // means every local-invoke test run also double-fires the real
    // trigger against the tunnel.
    attachTrigger: contextFlag('devAttachReceiptProcessorTrigger'),
    // True only for the one-time bootstrap deploy before dev-costco-
    // receipt-images has been cdk import'ed into this stack — see
    // addReceiptProcessing's doc comment. Pass via `-c
    // devAdoptExistingBucket=true`, not cdk.context.json, since it's a
    // one-shot flag for a single deploy, not a durable setting.
    adoptExisting: contextFlag('devAdoptExistingBucket'),
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
      region: 'us-east-1',
    },
    description: 'Costco Receipt Management System - dev receipt processing',
  });
}

// ============================================================================
// The post-decommission stack layout — stage-parameterized.
//
// One class per logical concern, instantiated per stage, with everything
// stage-specific coming from a nested context block (`dev` / `prod`) rather
// than a flood of flat `devFoo`/`foo` key pairs:
//
//   Dev-CostcoReceipts-Processing    receipt OCR pipeline (dev)
//   Prod-CostcoReceipts-Processing   receipt OCR pipeline (prod)
//   Prod-CostcoReceipts-Frontend     S3 + CloudFront + deploy role (prod only;
//                                    dev serves the app from `ng serve`)
//
// These coexist with the three legacy stacks above ONLY during the cutover, so
// the new prod frontend can be stood up and verified while the old one is still
// serving traffic. Never run a bare `cdk deploy`/`cdk deploy --all` in that
// window — deploy by name. The legacy stacks and their lib/ files get deleted
// once their replacements are live; see cdk-backend/RUNBOOK.md.
// ============================================================================
const stage = app.node.tryGetContext('stage') || 'dev';
if (stage !== 'dev' && stage !== 'prod') {
  throw new Error(`Unknown stage "${stage}" — expected "dev" or "prod" (-c stage=prod).`);
}
const Stage = stage.charAt(0).toUpperCase() + stage.slice(1);

// An absent stage block means "this stage isn't configured here yet", which is
// a skip. A block that exists but is missing a required value is a real
// mistake, so that throws instead of synthesizing something half-formed.
const stageConfig = app.node.tryGetContext(stage);

function required<T>(value: T | undefined, path: string): T {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required context value "${stage}.${path}" in cdk.context.json.`);
  }
  return value;
}

if (stageConfig) {
  const stageEnv = {
    account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
    region: 'us-east-1',
  };

  new ReceiptProcessingStack(app, `${Stage}-CostcoReceipts-Processing`, {
    stage,
    receiptBucketName: required(stageConfig.receiptBucketName, 'receiptBucketName'),
    internalApiUrl: required(stageConfig.internalApiUrl, 'internalApiUrl'),
    internalApiKey: required(stageConfig.internalApiKey, 'internalApiKey'),
    // Opt-in, and deliberately so: while a legacy stack still owns the
    // bucket's uploads/ notification, turning this on double-processes every
    // upload. Flip it to true only after that stack is gone.
    attachTrigger: stageConfig.attachReceiptProcessorTrigger === true,
    env: stageEnv,
    description: `Costco Receipt Management System - ${stage} receipt OCR pipeline`,
  });

  if (stage === 'prod') {
    const frontend = stageConfig.frontend;
    if (frontend) {
      new FrontendStack(app, `${Stage}-CostcoReceipts-Frontend`, {
        stage,
        certificateDomainName: required(frontend.certificateDomainName, 'frontend.certificateDomainName'),
        certificateAlternativeNames: frontend.certificateAlternativeNames,
        // Left unset for the first deploy — see FrontendStack's `aliases` doc
        // comment for why the alias lands in a second deploy.
        aliases: frontend.aliases,
        apiOriginDomainName: required(frontend.apiOriginDomainName, 'frontend.apiOriginDomainName'),
        githubRepo: frontend.githubRepo,
        githubOidcProviderArn: frontend.githubOidcProviderArn,
        env: stageEnv,
        description: 'Costco Receipt Management System - prod frontend (Angular/CloudFront over the Pi tunnel)',
      });
    }
  }
}

app.synth();
