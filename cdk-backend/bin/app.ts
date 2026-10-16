#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ReceiptProcessingStack } from '../lib/receipt-processing-stack';
import { FrontendStack } from '../lib/frontend-stack';

const app = new cdk.App();

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
// The retired Lambda/API-Gateway/DynamoDB architecture that used to live
// alongside these was removed after the 2026-10-05 cutover; see
// cdk-backend/RUNBOOK.md for what it was and how it was dismantled.
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
