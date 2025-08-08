import { Request, Response } from 'express';
import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDbClient, TABLES } from '../config/dynamodb';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import axios from 'axios';
import { UserReceipt } from '../models/UserReceipt';
import { ReceiptItem } from '../models/ReceiptItem';
import { getS3UploadUrl } from '../services/s3UploadService';
import { getS3DownloadUrl } from '../services/s3DownloadService';

interface AuthRequest extends Request {
  auth?: {
    sub: string;
  };
  headers: {
    authorization?: string;
  } & Request['headers'];
}

export const getDownloadUrl = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { receiptId } = req.params;
    if (!receiptId) {
      return res.status(400).json({ error: 'Receipt ID is required' });
    }

    // Verify the receipt belongs to the user
    const result = await dynamoDbClient.send(new QueryCommand({
      TableName: TABLES.USER_RECEIPTS,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': `RECEIPT#${receiptId}`,
      },
    }));

    if (!result.Items || result.Items.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    // Extract token from authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Invalid authorization header' });
    }
    
    const token = authHeader.substring(7);

    // Get S3 download URL from your existing API Gateway
    const s3Response = await getS3DownloadUrl(receiptId, token);

    res.json({
      downloadUrl: s3Response.download_url,
      expiresIn: s3Response.expires_in,
    });
  } catch (error) {
    console.error('Error getting download URL:', error);
    res.status(500).json({ error: 'Failed to get download URL' });
  }
};

export const getUploadUrl = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Extract content type from request body (optional)
    const { contentType } = req.body;

    // Extract token from authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Invalid authorization header' });
    }
    
    const token = authHeader.substring(7);

    // Get S3 upload URL from your existing API Gateway
    const s3Response = await getS3UploadUrl(token, contentType);

    // Store receipt metadata in DynamoDB using the receipt_id from your API
    const userReceipt: UserReceipt = {
      PK: `USER#${userId}`,
      SK: `RECEIPT#${s3Response.receipt_id}`,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    await dynamoDbClient.send(new PutCommand({
      TableName: TABLES.USER_RECEIPTS,
      Item: userReceipt,
    }));

    res.json({
      receiptId: s3Response.receipt_id,
      uploadUrl: s3Response.upload_url,
      expiresIn: s3Response.expires_in,
    });
  } catch (error) {
    console.error('Error getting upload URL:', error);
    res.status(500).json({ error: 'Failed to get upload URL' });
  }
};

export const uploadReceipt = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const receiptId = uuidv4();
    const fileName = `${receiptId}-${req.file.originalname}`;
    
    // Process image (resize/optimize)
    const processedImage = await sharp(req.file.buffer)
      .resize(2000, null, { withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    // TODO: Upload to S3 and get URL
    const fileUrl = `https://your-s3-bucket.s3.amazonaws.com/receipts/${fileName}`;

    const userReceipt: UserReceipt = {
      PK: `USER#${userId}`,
      SK: `RECEIPT#${receiptId}`,
      status: 'pending',
      created_at: new Date().toISOString(),
      fileName,
      fileUrl,
    };

    await dynamoDbClient.send(new PutCommand({
      TableName: TABLES.USER_RECEIPTS,
      Item: userReceipt,
    }));

    res.json({ 
      message: 'Receipt uploaded successfully', 
      receiptId,
      status: 'pending'
    });
  } catch (error) {
    console.error('Error uploading receipt:', error);
    res.status(500).json({ error: 'Failed to upload receipt' });
  }
};

export const getUserReceipts = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const result = await dynamoDbClient.send(new QueryCommand({
      TableName: TABLES.USER_RECEIPTS,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
      },
    }));

    res.json(result.Items || []);
  } catch (error) {
    console.error('Error fetching receipts:', error);
    res.status(500).json({ error: 'Failed to fetch receipts' });
  }
};

export const getReceiptItems = async (req: AuthRequest, res: Response) => {
  try {
    const { receiptId } = req.params;
    
    const result = await dynamoDbClient.send(new QueryCommand({
      TableName: TABLES.ITEMS,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `RECEIPT#${receiptId}`,
      },
    }));

    res.json(result.Items || []);
  } catch (error) {
    console.error('Error fetching receipt items:', error);
    res.status(500).json({ error: 'Failed to fetch receipt items' });
  }
};

export const getAllItems = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // First get all user's receipts
    const receiptsResult = await dynamoDbClient.send(new QueryCommand({
      TableName: TABLES.USER_RECEIPTS,
      KeyConditionExpression: 'PK = :PK',
      ExpressionAttributeValues: {
        ':PK': `USER#${userId}`,
      },
    }));

    const receiptIds = receiptsResult.Items?.map(item => 
      item.SK.replace('RECEIPT#', '')
    ) || [];

    // Get all items for these receipts
    const allItems: ReceiptItem[] = [];
    for (const receiptId of receiptIds) {
      const itemsResult = await dynamoDbClient.send(new QueryCommand({
        TableName: TABLES.ITEMS,
        KeyConditionExpression: 'PK = :PK',
        ExpressionAttributeValues: {
          ':PK': `RECEIPT#${receiptId}`,
        },
      }));
      
      if (itemsResult.Items) {
        allItems.push(...(itemsResult.Items as ReceiptItem[]));
      }
    }

    res.json(allItems);
  } catch (error) {
    console.error('Error fetching all items:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
};