import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface ReceiptProcessingProps {
  receiptBucketName: string;
  receiptBucketAllowedOrigins: string[];
  internalApiUrl: string;
  internalApiKey: string;
  // Deliberately separate from whether this function is deployed at all —
  // see attachReceiptProcessorTrigger's doc comment in
  // costco-receipts-stack.ts. Dev environments generally want the real
  // bucket + real deployed Lambda (to manually invoke and sanity check the
  // actual deployed artifact) WITHOUT every test upload also triggering it
  // automatically.
  attachTrigger: boolean;
  // True only for the one-time bootstrap deploy of a brand-new receipt-
  // processing stack whose bucket already exists as a real (pre-CDK) AWS
  // resource. References the existing bucket by name instead of creating
  // a stack-managed construct, so this deploy's diff contains only
  // genuinely new resources (Lambda, DLQ, IAM) — required because
  // `cdk import` refuses to run if the diff contains anything besides the
  // resource(s) being imported, even for a stack that doesn't exist yet.
  // Deploy once with this true, `cdk import` the bucket, then redeploy
  // with this false (or omitted) to get the full Retain-policied,
  // CORS-configured s3.Bucket construct. See docs/redesign-plan.md's
  // "Path to cutover" step 5 for how this played out for prod the first
  // time, before this flag existed.
  adoptExisting?: boolean;
}

export interface ReceiptProcessingResult {
  receiptBucket: s3.IBucket;
  receiptProcessorFunction: lambda.Function;
}

/**
 * The receipt-image bucket + OCR processor Lambda + DLQ, shared between
 * CostcoReceiptsStack (prod) and any per-environment receipt-processing
 * stack (e.g. a dev stack). A plain function, not a Construct subclass —
 * and takes `scope: cdk.Stack` rather than nesting children under an
 * intermediate construct — both deliberate. Extracting this into a nested
 * Construct would prefix every resource's logical ID with an extra path
 * segment, which CloudFormation would read as "delete the old resources,
 * create new ones" for the already-`cdk import`ed prod bucket — exactly
 * what this refactor must not do. Confirmed via a byte-identical `cdk
 * synth` diff against the pre-refactor CostcoReceiptsStack template before
 * trusting this for prod (see docs/redesign-plan.local.md).
 */
export function addReceiptProcessing(
  scope: cdk.Stack,
  props: ReceiptProcessingProps
): ReceiptProcessingResult {
  // Mirrors costco-receipt-parser/template.yaml's ReceiptImageBucket
  // exactly, since this construct is meant to be adopted via `cdk import`
  // against the real bucket, not created fresh. RETAIN is deliberate:
  // this bucket holds real user-uploaded receipt images.
  const receiptBucket: s3.IBucket = props.adoptExisting
    ? s3.Bucket.fromBucketName(scope, 'ReceiptImageBucket', props.receiptBucketName)
    : new s3.Bucket(scope, 'ReceiptImageBucket', {
      bucketName: props.receiptBucketName,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: props.receiptBucketAllowedOrigins,
          exposedHeaders: ['ETag', 'x-amz-meta-custom-header'],
          maxAge: 3000,
        },
      ],
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      }),
    });

  const dlq = new sqs.Queue(scope, 'ReceiptProcessingDLQ', {
    queueName: `${scope.stackName}-processing-dlq`,
    retentionPeriod: cdk.Duration.days(14),
  });

  const receiptProcessorFunction = new lambda.Function(scope, 'ReceiptProcessorFunction', {
    functionName: `${scope.stackName}-receipt-processor`,
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
    description: 'Runs Textract OCR on newly uploaded receipts and bridges results into MySQL via the internal API',
  });

  // Read access to uploaded images, and Textract, matching
  // ReceiptProcessorFunction's IAM policy in template.yaml (tightened to
  // the uploads/ prefix, since that's all it ever reads).
  receiptBucket.grantRead(receiptProcessorFunction, 'uploads/*');
  receiptProcessorFunction.addToRolePolicy(new iam.PolicyStatement({
    actions: ['textract:DetectDocumentText'],
    resources: ['*'],
  }));

  if (props.attachTrigger) {
    receiptBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(receiptProcessorFunction),
      { prefix: 'uploads/' }
    );
  }

  return { receiptBucket, receiptProcessorFunction };
}
