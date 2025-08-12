import { Request, Response } from 'express';
import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDbClient, TABLES } from '../config/dynamodb';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import axios from 'axios';
import { getS3UploadUrl } from '../services/s3UploadService';
import { getS3DownloadUrl } from '../services/s3DownloadService';
import * as SingleTableService from '../services/singleTableService';
import { ReceiptItem, ReceiptMember } from '../models/SingleTableModels';

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

    // Verify the user is a member of this receipt
    const receiptMembers = await SingleTableService.getUserReceipts(userId);
    const membership = receiptMembers.find(r => r.receipt_id === receiptId);

    if (!membership) {
      return res.status(404).json({ error: 'Receipt not found or access denied' });
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

    const receiptMembers = await SingleTableService.getUserReceipts(userId);
    res.json(receiptMembers);
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

    // First get all receipts where user is a member
    const receiptMembers = await SingleTableService.getUserReceipts(userId);
    const receiptIds = receiptMembers.map(member => member.receipt_id);

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

    // Verify the user is a member of this receipt
    const receiptMembers = await SingleTableService.getUserReceipts(userId);
    const membership = receiptMembers.find(r => r.receipt_id === receiptId);

    if (!membership) {
      return res.status(404).json({ error: 'Receipt not found or access denied' });
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

    // Verify the user is a member of this receipt
    const receiptMembers = await SingleTableService.getUserReceipts(userId);
    const membership = receiptMembers.find(r => r.receipt_id === receiptId);

    if (!membership) {
      return res.status(404).json({ error: 'Receipt not found or access denied' });
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

    // Verify the user is a member of this receipt
    const receiptMembers = await SingleTableService.getUserReceipts(userId);
    const membership = receiptMembers.find(r => r.receipt_id === receiptId);

    if (!membership) {
      return res.status(404).json({ error: 'Receipt not found or access denied' });
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

    // Verify the user is a member of this receipt
    const receiptMembers = await SingleTableService.getUserReceipts(userId);
    const membership = receiptMembers.find(r => r.receipt_id === receiptId);

    if (!membership) {
      return res.status(404).json({ error: 'Receipt not found or access denied' });
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

    // Verify the user is a member of this receipt
    const receiptMembers = await SingleTableService.getUserReceipts(userId);
    const membership = receiptMembers.find(r => r.receipt_id === receiptId);

    if (!membership) {
      return res.status(404).json({ error: 'Receipt not found or access denied' });
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

// ==================== ITEM ASSIGNMENTS ====================

export const updateItemAssignment = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { receiptId, itemId } = req.params;
    const { assignedUsers } = req.body;

    if (!receiptId || !itemId) {
      return res.status(400).json({ error: 'Receipt ID and Item ID are required' });
    }

    if (!Array.isArray(assignedUsers)) {
      return res.status(400).json({ error: 'Assigned users must be an array' });
    }

    // Verify the user is a member of this receipt
    const receiptMembers = await SingleTableService.getUserReceipts(userId);
    const membership = receiptMembers.find(r => r.receipt_id === receiptId);

    if (!membership) {
      return res.status(404).json({ error: 'Receipt not found or access denied' });
    }

    // Update the item assignment
    await SingleTableService.updateReceiptItemAssignments(receiptId, itemId, assignedUsers);

    res.json({
      message: 'Item assignment updated successfully',
      receiptId,
      itemId,
      assignedUsers
    });
  } catch (error) {
    console.error('Error updating item assignment:', error);
    res.status(500).json({ error: 'Failed to update item assignment' });
  }
};

export const bulkUpdateItemAssignments = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { receiptId } = req.params;
    const { updates } = req.body; // Array of { itemId, assignedUsers }

    if (!receiptId) {
      return res.status(400).json({ error: 'Receipt ID is required' });
    }

    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: 'Updates must be an array' });
    }

    // Verify the user is a member of this receipt
    const receiptMembers = await SingleTableService.getUserReceipts(userId);
    const membership = receiptMembers.find(r => r.receipt_id === receiptId);

    if (!membership) {
      return res.status(404).json({ error: 'Receipt not found or access denied' });
    }

    // Process bulk updates
    const results = [];
    for (const update of updates) {
      try {
        await SingleTableService.updateReceiptItemAssignments(
          receiptId, 
          update.itemId, 
          update.assignedUsers
        );
        results.push({ itemId: update.itemId, success: true });
      } catch (err) {
        console.error(`Error updating item ${update.itemId}:`, err);
        const errorMessage = (err instanceof Error) ? err.message : String(err);
        results.push({ itemId: update.itemId, success: false, error: errorMessage });
      }
    }

    res.json({
      message: 'Bulk assignment update completed',
      receiptId,
      results
    });
  } catch (error) {
    console.error('Error with bulk assignment update:', error);
    res.status(500).json({ error: 'Failed to update assignments' });
  }
};

export const clearAllItemAssignments = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { receiptId } = req.params;

    if (!receiptId) {
      return res.status(400).json({ error: 'Receipt ID is required' });
    }

    // Verify the user is a member of this receipt
    const receiptMembers = await SingleTableService.getUserReceipts(userId);
    const membership = receiptMembers.find(r => r.receipt_id === receiptId);

    if (!membership) {
      return res.status(404).json({ error: 'Receipt not found or access denied' });
    }

    // Get all items for the receipt
    const items = await SingleTableService.getReceiptItems(receiptId);
    
    // Clear assignments for all items
    const results = [];
    for (const item of items) {
      try {
        await SingleTableService.updateReceiptItemAssignments(receiptId, item.item_number, []);
        results.push({ itemId: item.item_number, success: true });
      } catch (err) {
        console.error(`Error clearing item ${item.item_number}:`, err);
        const errorMessage = (err instanceof Error) ? err.message : String(err);
        results.push({ itemId: item.item_number, success: false, error: errorMessage });
      }
    }

    res.json({
      message: 'All assignments cleared successfully',
      receiptId,
      results
    });
  } catch (error) {
    console.error('Error clearing all assignments:', error);
    res.status(500).json({ error: 'Failed to clear assignments' });
  }
};

// ==================== MEMBER DETAILS UPDATE ====================

export const updateMemberDetails = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth?.sub;
    
    // Get user details from request body (sent from frontend)
    const { email: userEmail, name: userName } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!userEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const { receiptId } = req.params;

    if (!receiptId) {
      return res.status(400).json({ error: 'Receipt ID is required' });
    }

    // Verify the user is a member of this receipt
    const receiptMembers = await SingleTableService.getUserReceipts(userId);
    const membership = receiptMembers.find(r => r.receipt_id === receiptId);

    if (!membership) {
      return res.status(404).json({ error: 'Receipt not found or access denied' });
    }

    // Update member details with JWT information
    const displayName = userName || userEmail.split('@')[0]; // Use name or fallback to email prefix
    await SingleTableService.updateReceiptMemberDetails(receiptId, userId, displayName, userEmail);

    res.json({
      message: 'Member details updated successfully',
      receiptId,
      userId,
      displayName,
      email: userEmail
    });
  } catch (error) {
    console.error('Error updating member details:', error);
    res.status(500).json({ error: 'Failed to update member details' });
  }
};