import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import dotenv from 'dotenv';

dotenv.config();

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.NODE_ENV === 'development' && {
    profile: process.env.AWS_PROFILE || 'default',
  }),
});

export const dynamoDbClient = DynamoDBDocumentClient.from(client);

export const TABLES = {
  USER_RECEIPTS: process.env.DYNAMODB_TABLE_USER_RECEIPTS || 'costco-user-receipts',
  ITEMS: process.env.DYNAMODB_TABLE_ITEMS || 'costco-receipt-items',
};