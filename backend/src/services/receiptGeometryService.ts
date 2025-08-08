import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDbClient, TABLES } from '../config/dynamodb';
import { ReceiptGeometry } from '../models/ReceiptGeometry';

export const getReceiptGeometry = async (receiptId: string): Promise<{
  subtotal?: {
    label?: ReceiptGeometry;
    value?: ReceiptGeometry;
  };
  tax?: {
    label?: ReceiptGeometry;
    value?: ReceiptGeometry;
  };
  total?: {
    label?: ReceiptGeometry;
    value?: ReceiptGeometry;
  };
}> => {
  try {
    const result = await dynamoDbClient.send(new QueryCommand({
      TableName: TABLES.RECEIPT_GEOMETRY,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `RECEIPT#${receiptId}`,
      },
    }));

    const geometryData: any = {};
    
    if (result.Items) {
      for (const item of result.Items as ReceiptGeometry[]) {
        const fieldName = item.field_name.toLowerCase();
        const fieldType = item.field_type;
        
        if (!geometryData[fieldName]) {
          geometryData[fieldName] = {};
        }
        
        geometryData[fieldName][fieldType] = item;
      }
    }

    return geometryData;
  } catch (error) {
    console.error('Error fetching receipt geometry:', error);
    return {};
  }
};