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
  MAIN: process.env.DYNAMODB_TABLE_MAIN || 'costco-receipt-parser-main',
};

export const GSI = {
  GSI1: 'GSI1', // For user-based queries
  GSI2: 'GSI2', // For receipt share lookups  
};