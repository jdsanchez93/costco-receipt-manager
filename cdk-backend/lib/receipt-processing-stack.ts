import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * The receipt-image OCR pipeline for one stage: the processor Lambda, its DLQ,
 * and the S3 event notification that triggers it. Instantiated once per stage
 * from bin/app.ts.
 *
 * The bucket itself is deliberately NOT a resource of this stack. It holds real
 * user-uploaded receipt images, predates all of this, and never changes shape —
 * so it's treated as pre-existing infrastructure referenced by name, exactly
 * the way the DynamoDB table always was ("must exist before deployment, not
 * created by this stack"). The payoff is that every resource in here is
 * disposable, which is what makes this stack safe to rename, recreate or
 * destroy without a `cdk import` dance — and `cdk import` is what previously
 * made that bucket's stack effectively unrenameable.
 *
 * The tradeoff: the bucket's own configuration (CORS, encryption,
 * public-access block) lives outside CDK. Current values and how to reapply
 * them are in cdk-backend/README.md. Note that `cdk import` had already left
 * drift on exactly those properties (dev's CORS stayed on the old SAM
 * localhost:3000 origin while CDK's declared state said 4200), so this is
 * less of a loss than it first appears.
 */
export interface ReceiptProcessingStackProps extends cdk.StackProps {
  // 'dev' | 'prod'. Drives physical resource names, so they're predictable and
  // independent of the stack name.
  stage: string;

  receiptBucketName: string;
  internalApiUrl: string;
  internalApiKey: string;

  // Whether to wire this stack's Lambda to the bucket's
  // ObjectCreated:uploads/ notification. Must stay false while any other
  // stack still owns that notification: two LambdaConfigurations on the same
  // bucket and prefix means every upload gets OCR'd twice, against a real
  // Textract bill and with two writes racing into MySQL.
  attachTrigger: boolean;
}

export class ReceiptProcessingStack extends cdk.Stack {
  public readonly receiptProcessorFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: ReceiptProcessingStackProps) {
    super(scope, id, props);

    const receiptBucket = s3.Bucket.fromBucketName(
      this,
      'ReceiptImageBucket',
      props.receiptBucketName
    );

    const dlq = new sqs.Queue(this, 'ReceiptProcessingDLQ', {
      queueName: `costco-receipts-${props.stage}-processing-dlq`,
      retentionPeriod: cdk.Duration.days(14),
    });

    this.receiptProcessorFunction = new lambda.Function(this, 'ReceiptProcessorFunction', {
      functionName: `costco-receipts-${props.stage}-receipt-processor`,
      runtime: lambda.Runtime.PYTHON_3_13,
      architecture: lambda.Architecture.X86_64,
      code: lambda.Code.fromAsset('receipt-processor', {
        bundling: {
          image: lambda.Runtime.PYTHON_3_13.bundlingImage,
          command: [
            'bash',
            '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output',
          ],
        },
      }),
      handler: 'app.lambda_handler',
      timeout: cdk.Duration.seconds(60),
      environment: {
        INTERNAL_API_URL: props.internalApiUrl,
        INTERNAL_API_KEY: props.internalApiKey,
      },
      deadLetterQueue: dlq,
      retryAttempts: 0,
      description:
        'Runs Textract OCR on newly uploaded receipts and bridges results into MySQL via the internal API',
    });

    // Scoped to uploads/* — that's the only prefix it ever reads. On an
    // imported bucket this grant lands on the Lambda's role rather than a
    // bucket policy, which is what we want: nothing here mutates the bucket.
    receiptBucket.grantRead(this.receiptProcessorFunction, 'uploads/*');

    this.receiptProcessorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['textract:DetectDocumentText'],
        resources: ['*'],
      })
    );

    if (props.attachTrigger) {
      receiptBucket.addEventNotification(
        s3.EventType.OBJECT_CREATED,
        new s3n.LambdaDestination(this.receiptProcessorFunction),
        { prefix: 'uploads/' }
      );
    }

    new cdk.CfnOutput(this, 'ReceiptProcessorFunctionName', {
      value: this.receiptProcessorFunction.functionName,
      description: 'Receipt-processor Lambda — invoke manually to sanity check',
    });

    new cdk.CfnOutput(this, 'ReceiptProcessingDLQUrl', {
      value: dlq.queueUrl,
      description: 'Failed OCR events land here — check it before deleting this stack',
    });
  }
}
