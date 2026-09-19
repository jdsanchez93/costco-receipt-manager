import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { addReceiptProcessing } from './receipt-processing';

/**
 * The dev-environment counterpart to CostcoReceiptsStack's receipt-image
 * bucket + OCR processor Lambda — and nothing else. Deliberately its own
 * minimal stack rather than a "Dev-CostcoReceiptsStack" instantiation of
 * the full stack: CostcoReceiptsStack also carries the old .NET Lambda
 * API, API Gateway, and CloudFront/frontend-bucket, all of which dev
 * doesn't need (dev's API runs locally via `dotnet watch run`, dev's
 * frontend via `ng serve`) and which are being retired for prod anyway
 * once the Pi cutover completes — standing up a parallel dev copy of
 * soon-to-be-dead infrastructure isn't worth it. Same shape as
 * NextFrontendStack: its own stack, only ever touched by name
 * (`cdk deploy DevReceiptProcessingStack`), never by a bare `cdk deploy`.
 */
export interface DevReceiptProcessingStackProps extends cdk.StackProps {
  receiptBucketName: string;
  receiptBucketAllowedOrigins: string[];
  internalApiUrl: string;
  internalApiKey: string;
  attachTrigger: boolean;
  // See addReceiptProcessing's doc comment — true only for the one-time
  // bootstrap deploy before the real dev-costco-receipt-images bucket has
  // been `cdk import`ed into this stack.
  adoptExisting?: boolean;
}

export class DevReceiptProcessingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DevReceiptProcessingStackProps) {
    super(scope, id, props);

    const { receiptBucket, receiptProcessorFunction } = addReceiptProcessing(this, {
      receiptBucketName: props.receiptBucketName,
      receiptBucketAllowedOrigins: props.receiptBucketAllowedOrigins,
      internalApiUrl: props.internalApiUrl,
      internalApiKey: props.internalApiKey,
      attachTrigger: props.attachTrigger,
      adoptExisting: props.adoptExisting,
    });

    new cdk.CfnOutput(this, 'ReceiptBucketName', {
      value: receiptBucket.bucketName,
      description: 'Dev receipt-image bucket',
    });

    new cdk.CfnOutput(this, 'ReceiptProcessorFunctionName', {
      value: receiptProcessorFunction.functionName,
      description: 'Dev receipt-processor Lambda — manually invoke to sanity check',
    });
  }
}
