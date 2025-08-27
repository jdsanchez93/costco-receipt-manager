#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CostcoReceiptsStack } from '../lib/costco-receipts-stack';

const app = new cdk.App();

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

  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
    region: 'us-east-1',
  },
  description: 'Costco Receipt Management System - Serverless API with CDK (External DynamoDB)',
});

app.synth();