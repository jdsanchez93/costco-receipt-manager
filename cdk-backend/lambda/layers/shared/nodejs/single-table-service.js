const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const { Logger } = require('@aws-lambda-powertools/logger');

const logger = new Logger({ serviceName: 'SingleTableService' });
const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamodb = DynamoDBDocumentClient.from(client);

class SingleTableService {
  constructor() {
    this.mainTable = process.env.DYNAMODB_TABLE_MAIN;
  }

  // User Receipts Methods
  async getUserReceipts(userId) {
    logger.info('Getting user receipts', { userId });
    
    const params = {
      TableName: this.mainTable,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
      },
    };

    try {
      const result = await dynamodb.send(new QueryCommand(params));
      logger.info('Successfully retrieved user receipts', { count: result.Items.length });
      return result.Items || [];
    } catch (error) {
      logger.error('Error getting user receipts', { error: error.message, userId });
      throw error;
    }
  }

  async getReceiptMembers(receiptId) {
    logger.info('Getting receipt members', { receiptId });
    
    const params = {
      TableName: this.mainTable,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk_prefix)',
      ExpressionAttributeValues: {
        ':pk': `RECEIPT#${receiptId}`,
        ':sk_prefix': 'USER#',
      },
    };

    try {
      const result = await dynamodb.send(new QueryCommand(params));
      logger.info('Successfully retrieved receipt members', { count: result.Items.length });
      return result.Items || [];
    } catch (error) {
      logger.error('Error getting receipt members', { error: error.message, receiptId });
      throw error;
    }
  }

  async createReceiptMember(receiptId, userId, displayName, email, addedByUserId, userType = 'authenticated') {
    logger.info('Creating receipt member', { receiptId, userId, userType });
    
    const member = {
      PK: `RECEIPT#${receiptId}`,
      SK: `USER#${userId}`,
      GSI1PK: `USER#${userId}`,
      GSI1SK: `RECEIPT#${receiptId}`,
      entity_type: 'RECEIPT_MEMBER',
      user_type: userType,
      receipt_id: receiptId,
      placeholder_id: userType === 'placeholder' ? userId : '',
      user_id: userId,
      display_name: displayName,
      email: email,
      user_type: userType,
      added_by: addedByUserId,
      added_at: new Date().toISOString()
    };

    try {
      await dynamodb.send(new PutCommand({
        TableName: this.mainTable,
        Item: member
      }));
      
      logger.info('Successfully created receipt member', { receiptId, userId });
      return member;
    } catch (error) {
      logger.error('Error creating receipt member', { error: error.message, receiptId, userId });
      throw error;
    }
  }

  async updateMemberDetails(receiptId, userId, displayName, email) {
    logger.info('Updating member details', { receiptId, userId });
    
    const params = {
      TableName: this.mainTable,
      Key: {
        PK: `RECEIPT#${receiptId}`,
        SK: `USER#${userId}`,
      },
      UpdateExpression: 'SET display_name = :displayName, email = :email, updated_at = :updatedAt',
      ExpressionAttributeValues: {
        ':displayName': displayName,
        ':email': email,
        ':updatedAt': new Date().toISOString(),
        ':emptyString': '',
      },
      // Only update if the member exists and has empty display_name
      ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK) AND (attribute_not_exists(display_name) OR display_name = :emptyString)',
    };

    try {
      await dynamodb.send(new UpdateCommand(params));
      logger.info('Successfully updated member details', { receiptId, userId });
    } catch (error) {
      logger.error('Error updating member details', { error: error.message, receiptId, userId });
      throw error;
    }
  }

  // Receipt Items Methods
  async getReceiptItems(receiptId) {
    logger.info('Getting receipt items', { receiptId });
    
    const params = {
      TableName: this.mainTable,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk_prefix)',
      ExpressionAttributeValues: {
        ':pk': `RECEIPT#${receiptId}`,
        ':sk_prefix': 'ITEM#',
      },
    };

    try {
      const result = await dynamodb.send(new QueryCommand(params));
      logger.info('Successfully retrieved receipt items', { count: result.Items.length });
      return result.Items || [];
    } catch (error) {
      logger.error('Error getting receipt items', { error: error.message, receiptId });
      throw error;
    }
  }

  async updateItemAssignment(receiptId, itemId, assignedUsers) {
    logger.info('Updating item assignment', { receiptId, itemId, assignedUserCount: assignedUsers.length });
    
    const params = {
      TableName: this.mainTable,
      Key: {
        PK: `RECEIPT#${receiptId}`,
        SK: `ITEM#${itemId.toString().padStart(3, '0')}`
      },
      UpdateExpression: 'SET assigned_users = :users, updated_at = :updatedAt',
      ExpressionAttributeValues: {
        ':users': assignedUsers,
        ':updatedAt': new Date().toISOString()
      }
    };

    try {
      await dynamodb.send(new UpdateCommand(params));
      logger.info('Successfully updated item assignment', { receiptId, itemId });
    } catch (error) {
      logger.error('Error updating item assignment', { error: error.message, receiptId, itemId });
      throw error;
    }
  }

  async bulkUpdateItemAssignments(receiptId, updates) {
    logger.info('Bulk updating item assignments', { receiptId, updateCount: updates.length });
    
    const updatePromises = updates.map(update => 
      this.updateItemAssignment(receiptId, update.itemId, update.assignedUsers)
    );

    try {
      await Promise.all(updatePromises);
      logger.info('Successfully completed bulk update', { receiptId, updateCount: updates.length });
    } catch (error) {
      logger.error('Error in bulk update', { error: error.message, receiptId });
      throw error;
    }
  }

  async clearAllItemAssignments(receiptId) {
    logger.info('Clearing all item assignments', { receiptId });
    
    // First get all items
    const items = await this.getReceiptItems(receiptId);
    
    // Then clear assignments for each
    const updates = items.map(item => ({
      itemId: item.SK.replace('ITEM#', ''),
      assignedUsers: []
    }));

    await this.bulkUpdateItemAssignments(receiptId, updates);
    logger.info('Successfully cleared all assignments', { receiptId, itemCount: items.length });
  }

  // Receipt Validation Methods
  async validateReceiptSubtotal(receiptId, userId, validationStatus, validatedAmount, comments) {
    logger.info('Validating receipt subtotal', { receiptId, userId, validationStatus });
    
    const params = {
      TableName: this.mainTable,
      Key: {
        PK: `USER#${userId}`,
        SK: `RECEIPT#${receiptId}`
      },
      UpdateExpression: 'SET validationStatus = :status, validatedAmount = :amount, validationComments = :comments, validatedAt = :validatedAt',
      ExpressionAttributeValues: {
        ':status': validationStatus,
        ':amount': validatedAmount,
        ':comments': comments,
        ':validatedAt': new Date().toISOString()
      }
    };

    try {
      await dynamodb.send(new UpdateCommand(params));
      logger.info('Successfully validated receipt', { receiptId, userId, validationStatus });
    } catch (error) {
      logger.error('Error validating receipt', { error: error.message, receiptId, userId });
      throw error;
    }
  }

  // Receipt Sharing Methods
  async createReceiptShare(receiptId, userId, expiresInDays = 30) {
    logger.info('Creating receipt share', { receiptId, userId, expiresInDays });
    
    const shareToken = uuidv4();
    const createdAt = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(createdAt.getDate() + expiresInDays);
    const expiresAtTimestamp = Math.floor(expiresAt.getTime() / 1000);

    const share = {
      PK: `SHARE#${shareToken}`,
      SK: `RECEIPT#${receiptId}`,
      GSI2PK: `RECEIPT#${receiptId}`,
      GSI2SK: `SHARE#${shareToken}`,
      entity_type: 'RECEIPT_SHARE',
      receipt_id: receiptId,
      owner_user_id: userId,
      share_token: shareToken,
      created_at: createdAt.toISOString(),
      expires_at: expiresAtTimestamp,
      is_active: true,
      current_uses: 0,
    };

    try {
      await dynamodb.send(new PutCommand({
        TableName: this.mainTable,
        Item: share
      }));
      
      logger.info('Successfully created receipt share', { receiptId, shareToken });
      return share;
    } catch (error) {
      logger.error('Error creating receipt share', { error: error.message, receiptId });
      throw error;
    }
  }

  async getReceiptShares(receiptId) {
    logger.info('Getting receipt shares', { receiptId });
    
    const params = {
      TableName: this.mainTable,
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk AND begins_with(GSI2SK, :sk_prefix)',
      ExpressionAttributeValues: {
        ':pk': `RECEIPT#${receiptId}`,
        ':sk_prefix': 'SHARE#',
      },
    };

    try {
      const result = await dynamodb.send(new QueryCommand(params));
      logger.info('Successfully retrieved receipt shares', { count: result.Items.length });
      // Filter out inactive shares
      const activeShares = (result.Items || [])
        .filter(share => share.is_active);
      return activeShares || [];
    } catch (error) {
      logger.error('Error getting receipt shares', { error: error.message, receiptId });
      throw error;
    }
  }

  async getSharedReceipt(shareToken) {
    logger.info('Getting shared receipt', { shareToken });
    
    // Get share info
    const shareParams = {
      TableName: this.mainTable,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `SHARE#${shareToken}`,
      },
    };

    try {
      const shareResult = await dynamodb.send(new QueryCommand(shareParams));
      if (!shareResult.Items || shareResult.Items.length === 0) {
        throw new Error('Share not found');
      }

      const share = shareResult.Items[0];
      
      // Check if share is still active
      if (!share.is_active) {
        return null;
      }

      // Check if expired (TTL will handle cleanup, but we can check here too)
      const now = Math.floor(Date.now() / 1000);
      if (share.expires_at < now) {
        return null;
      }

      logger.info('Successfully retrieved shared receipt', { shareToken, receiptId: share.receipt_id });
      
      return share;
    } catch (error) {
      logger.error('Error getting shared receipt', { error: error.message, shareToken });
      throw error;
    }
  }

  async getReceiptGeometry(receiptId) {
    logger.info('Getting receipt geometry', { receiptId });
    
    const params = {
      TableName: this.mainTable,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk_prefix)',
      ExpressionAttributeValues: {
        ':pk': `RECEIPT#${receiptId}`,
        ':sk_prefix': 'GEOMETRY#'
      }
    };

    try {
      const result = await dynamodb.send(new QueryCommand(params));
      
      if (!result.Items || result.Items.length === 0) {
        logger.info('No geometry data found', { receiptId });
        return {};
      }

      // Transform the geometry data into the expected format (matching original backend)
      const geometryData = {};
      result.Items.forEach(item => {
        if (item.field_name && item.field_type) {
          const fieldName = item.field_name.toLowerCase();
          const fieldType = item.field_type;
          
          if (!geometryData[fieldName]) {
            geometryData[fieldName] = {};
          }
          
          // Transform the data to match the original format
          geometryData[fieldName][fieldType] = {
            text: item.text,
            confidence: item.confidence ? parseFloat(item.confidence.toString()) : 0,
            bounding_box: item.bounding_box ? {
              Width: parseFloat(item.bounding_box.Width?.toString() || '0'),
              Height: parseFloat(item.bounding_box.Height?.toString() || '0'),
              Left: parseFloat(item.bounding_box.Left?.toString() || '0'),
              Top: parseFloat(item.bounding_box.Top?.toString() || '0')
            } : {},
            polygon: item.polygon ? item.polygon.map(point => ({
              X: parseFloat(point.X?.toString() || '0'),
              Y: parseFloat(point.Y?.toString() || '0')
            })) : []
          };
        }
      });
      
      logger.info('Successfully retrieved receipt geometry', { receiptId, fields: Object.keys(geometryData).length });
      return geometryData;
    } catch (error) {
      logger.error('Error getting receipt geometry', { error: error.message, receiptId });
      throw error;
    }
  }
}

module.exports = { SingleTableService };