#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CostcoReceiptsStack } from '../lib/costco-receipts-stack';
import { NextFrontendStack } from '../lib/next-frontend-stack';

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

app.synth();