import { Request, Response } from 'express';
import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDbClient, TABLES } from '../config/dynamodb';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import axios from 'axios';
import { getS3UploadUrl } from '../services/s3UploadService';
import { getS3DownloadUrl } from '../services/s3DownloadService';
import * as SingleTableService from '../services/singleTableService';
import { UserReceipt, ReceiptItem, ReceiptMember } from '../models/SingleTableModels';

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

    // Verify the receipt belongs to the user using single table
    const userReceipts = await SingleTableService.getUserReceipts(userId);
    const receipt = userReceipts.find(r => r.receipt_id === receiptId);

    if (!receipt) {
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

    // Note: The S3 event notification lambda will handle all initial database population
    // including creating UserReceipt, ReceiptItems, ReceiptMembers, and ReceiptGeometry records

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

// DEPRECATED: This function is no longer used. 
// Upload flow now uses getUploadUrl + direct S3 upload + S3 event lambda processing
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

    // NOTE: The S3 event notification lambda now handles all initial database population
    // This function should be removed in favor of the getUploadUrl + S3 direct upload flow

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

    const userReceipts = await SingleTableService.getUserReceipts(userId);
    res.json(userReceipts);
  } catch (error) {
    console.error('Error fetching receipts:', error);
    res.status(500).json({ error: 'Failed to fetch receipts' });
  }
};

export const getReceiptItems = async (req: AuthRequest, res: Response) => {
  try {
    const { receiptId } = req.params;
    
    const items = await SingleTableService.getReceiptItems(receiptId);
    res.json(items);
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
    const userReceipts = await SingleTableService.getUserReceipts(userId);
    const receiptIds = userReceipts.map(receipt => receipt.receipt_id);

    // Get all items for these receipts
    const allItems: ReceiptItem[] = [];
    for (const receiptId of receiptIds) {
      const items = await SingleTableService.getReceiptItems(receiptId);
      allItems.push(...items);
    }

    res.json(allItems);
  } catch (error) {
    console.error('Error fetching all items:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
};

export const getReceiptGeometryData = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { receiptId } = req.params;
    if (!receiptId) {
      return res.status(400).json({ error: 'Receipt ID is required' });
    }

    // Verify the receipt belongs to the user using single table
    const userReceipts = await SingleTableService.getUserReceipts(userId);
    const receipt = userReceipts.find(r => r.receipt_id === receiptId);

    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    // Get geometry data using single table service
    const geometryData = await SingleTableService.getReceiptGeometry(receiptId);

    res.json(geometryData);
  } catch (error) {
    console.error('Error fetching receipt geometry:', error);
    res.status(500).json({ error: 'Failed to fetch receipt geometry' });
  }
};

export const validateReceiptSubtotal = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { receiptId } = req.params;
    const { isValid, comments } = req.body;

    if (typeof isValid !== 'boolean') {
      return res.status(400).json({ error: 'isValid must be a boolean' });
    }

    // Update the receipt validation status using single table service
    await SingleTableService.updateUserReceiptValidation(userId, receiptId, isValid, comments);

    res.json({ 
      message: 'Validation updated successfully',
      validationStatus: isValid ? 'confirmed' : 'disputed'
    });
  } catch (error) {
    console.error('Error updating validation:', error);
    res.status(500).json({ error: 'Failed to update validation' });
  }
};

// ==================== RECEIPT MEMBERS ====================

export const getReceiptMembers = async (req: AuthRequest, res: Response) => {
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
    const userReceipts = await SingleTableService.getUserReceipts(userId);
    const receipt = userReceipts.find(r => r.receipt_id === receiptId);

    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const members = await SingleTableService.getReceiptMembers(receiptId);
    res.json(members);
  } catch (error) {
    console.error('Error fetching receipt members:', error);
    res.status(500).json({ error: 'Failed to fetch receipt members' });
  }
};

export const addReceiptMember = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { receiptId } = req.params;
    const { displayName, email, userType } = req.body;

    if (!receiptId) {
      return res.status(400).json({ error: 'Receipt ID is required' });
    }

    if (!displayName) {
      return res.status(400).json({ error: 'Display name is required' });
    }

    if (!userType || !['authenticated', 'placeholder'].includes(userType)) {
      return res.status(400).json({ error: 'Valid user type is required (authenticated or placeholder)' });
    }

    // Verify the receipt belongs to the user
    const userReceipts = await SingleTableService.getUserReceipts(userId);
    const receipt = userReceipts.find(r => r.receipt_id === receiptId);

    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    let member: ReceiptMember;

    if (userType === 'authenticated') {
      if (!email) {
        return res.status(400).json({ error: 'Email is required for authenticated users' });
      }
      // For now, we'll use email as userId for authenticated users
      // In a real system, you'd lookup the user ID from your auth provider
      member = await SingleTableService.addAuthenticatedUserToReceipt(receiptId, email, displayName, email, userId);
    } else {
      member = await SingleTableService.addPlaceholderUserToReceipt(receiptId, displayName, userId);
    }

    res.status(201).json({
      message: 'Member added successfully',
      member
    });
  } catch (error) {
    console.error('Error adding receipt member:', error);
    res.status(500).json({ error: 'Failed to add receipt member' });
  }
};

// ==================== RECEIPT SHARES ====================

export const createReceiptShare = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { receiptId } = req.params;
    const { expiresInDays = 30 } = req.body;

    if (!receiptId) {
      return res.status(400).json({ error: 'Receipt ID is required' });
    }

    // Verify the receipt belongs to the user
    const userReceipts = await SingleTableService.getUserReceipts(userId);
    const receipt = userReceipts.find(r => r.receipt_id === receiptId);

    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const share = await SingleTableService.createReceiptShare(receiptId, userId, expiresInDays);

    res.status(201).json({
      message: 'Share link created successfully',
      shareToken: share.share_token,
      shareUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/shared-receipt/${share.share_token}`,
      expiresAt: new Date(share.expires_at * 1000).toISOString()
    });
  } catch (error) {
    console.error('Error creating receipt share:', error);
    res.status(500).json({ error: 'Failed to create receipt share' });
  }
};

export const getReceiptShares = async (req: AuthRequest, res: Response) => {
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
    const userReceipts = await SingleTableService.getUserReceipts(userId);
    const receipt = userReceipts.find(r => r.receipt_id === receiptId);

    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const shares = await SingleTableService.getActiveSharesForReceipt(receiptId);
    
    res.json(shares.map(share => ({
      ...share,
      shareUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/shared-receipt/${share.share_token}`,
      expiresAt: new Date(share.expires_at * 1000).toISOString()
    })));
  } catch (error) {
    console.error('Error fetching receipt shares:', error);
    res.status(500).json({ error: 'Failed to fetch receipt shares' });
  }
};

export const getSharedReceipt = async (req: Request, res: Response) => {
  try {
    const { shareToken } = req.params;

    if (!shareToken) {
      return res.status(400).json({ error: 'Share token is required' });
    }

    const share = await SingleTableService.getReceiptFromShareToken(shareToken);

    if (!share) {
      return res.status(404).json({ error: 'Invalid or expired share link' });
    }

    // Get receipt data
    const [items, members, geometry] = await Promise.all([
      SingleTableService.getReceiptItems(share.receipt_id),
      SingleTableService.getReceiptMembers(share.receipt_id),
      SingleTableService.getReceiptGeometry(share.receipt_id)
    ]);

    res.json({
      receiptId: share.receipt_id,
      items,
      members,
      geometry,
      shareInfo: {
        createdAt: share.created_at,
        expiresAt: new Date(share.expires_at * 1000).toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching shared receipt:', error);
    res.status(500).json({ error: 'Failed to fetch shared receipt' });
  }
};