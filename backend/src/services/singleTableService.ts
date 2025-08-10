import { QueryCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDbClient, TABLES, GSI } from '../config/dynamodb';
import { 
  ReceiptItem, 
  ReceiptMember, 
  UserReceipt, 
  ReceiptShare, 
  ReceiptGeometry,
  PlaceholderUser,
  convertFloats 
} from '../models/SingleTableModels';
import { v4 as uuidv4 } from 'uuid';

// ==================== RECEIPT ITEMS ====================

export const getReceiptItems = async (receiptId: string): Promise<ReceiptItem[]> => {
  const result = await dynamoDbClient.send(new QueryCommand({
    TableName: TABLES.MAIN,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk_prefix)',
    ExpressionAttributeValues: {
      ':pk': `RECEIPT#${receiptId}`,
      ':sk_prefix': 'ITEM#',
    },
  }));

  return (result.Items || []) as ReceiptItem[];
};

export const createReceiptItem = async (receiptId: string, item: Omit<ReceiptItem, 'PK' | 'SK' | 'entity_type' | 'receipt_id' | 'created_at'>): Promise<ReceiptItem> => {
  const itemId = item.item_number || uuidv4();
  const receiptItem: ReceiptItem = {
    PK: `RECEIPT#${receiptId}`,
    SK: `ITEM#${itemId}`,
    entity_type: 'RECEIPT_ITEM',
    receipt_id: receiptId,
    created_at: new Date().toISOString(),
    ...item,
  };

  await dynamoDbClient.send(new PutCommand({
    TableName: TABLES.MAIN,
    Item: convertFloats(receiptItem),
    ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
  }));

  return receiptItem;
};

// ==================== RECEIPT MEMBERS ====================

export const getReceiptMembers = async (receiptId: string): Promise<ReceiptMember[]> => {
  const result = await dynamoDbClient.send(new QueryCommand({
    TableName: TABLES.MAIN,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk_prefix)',
    ExpressionAttributeValues: {
      ':pk': `RECEIPT#${receiptId}`,
      ':sk_prefix': 'USER#',
    },
  }));

  return (result.Items || []) as ReceiptMember[];
};

export const addAuthenticatedUserToReceipt = async (
  receiptId: string, 
  userId: string, 
  displayName: string, 
  email: string, 
  addedByUserId: string
): Promise<ReceiptMember> => {
  const member: ReceiptMember = {
    PK: `RECEIPT#${receiptId}`,
    SK: `USER#${userId}`,
    GSI1PK: `USER#${userId}`,
    GSI1SK: `RECEIPT#${receiptId}`,
    entity_type: 'RECEIPT_MEMBER',
    user_type: 'authenticated',
    display_name: displayName,
    email: email,
    user_id: userId,
    receipt_id: receiptId,
    added_by: addedByUserId,
    added_at: new Date().toISOString(),
  };

  // Create member record
  await dynamoDbClient.send(new PutCommand({
    TableName: TABLES.MAIN,
    Item: convertFloats(member),
    ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
  }));

  // Create inverse relationship for user lookups
  const userReceipt: UserReceipt = {
    PK: `USER#${userId}`,
    SK: `RECEIPT#${receiptId}`,
    entity_type: 'USER_RECEIPT',
    receipt_id: receiptId,
    user_id: userId,
    status: 'active',
    joined_at: new Date().toISOString(),
  };

  await dynamoDbClient.send(new PutCommand({
    TableName: TABLES.MAIN,
    Item: convertFloats(userReceipt),
    ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
  }));

  return member;
};

export const addPlaceholderUserToReceipt = async (
  receiptId: string, 
  displayName: string, 
  addedByUserId: string
): Promise<ReceiptMember> => {
  const placeholderId = uuidv4();
  
  const member: ReceiptMember = {
    PK: `RECEIPT#${receiptId}`,
    SK: `USER#${placeholderId}`,
    GSI1PK: `USER#${placeholderId}`,
    GSI1SK: `RECEIPT#${receiptId}`,
    entity_type: 'RECEIPT_MEMBER',
    user_type: 'placeholder',
    display_name: displayName,
    placeholder_id: placeholderId,
    receipt_id: receiptId,
    added_by: addedByUserId,
    added_at: new Date().toISOString(),
  };

  // Create member record
  await dynamoDbClient.send(new PutCommand({
    TableName: TABLES.MAIN,
    Item: convertFloats(member),
    ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
  }));

  // Create placeholder user record
  const placeholder: PlaceholderUser = {
    PK: `USER#${placeholderId}`,
    SK: `RECEIPT#${receiptId}`,
    entity_type: 'PLACEHOLDER_USER',
    receipt_id: receiptId,
    placeholder_id: placeholderId,
    display_name: displayName,
    status: 'unclaimed',
    created_at: new Date().toISOString(),
  };

  await dynamoDbClient.send(new PutCommand({
    TableName: TABLES.MAIN,
    Item: convertFloats(placeholder),
    ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
  }));

  return member;
};

// ==================== USER RECEIPTS ====================

export const getUserReceipts = async (userId: string): Promise<UserReceipt[]> => {
  const result = await dynamoDbClient.send(new QueryCommand({
    TableName: TABLES.MAIN,
    IndexName: GSI.GSI1,
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
    },
  }));

  // Filter to only USER_RECEIPT entities
  return (result.Items || []).filter(item => item.entity_type === 'USER_RECEIPT') as UserReceipt[];
};

export const createUserReceipt = async (userId: string, receiptId: string, receiptData: Partial<UserReceipt>): Promise<UserReceipt> => {
  const userReceipt: UserReceipt = {
    PK: `USER#${userId}`,
    SK: `RECEIPT#${receiptId}`,
    entity_type: 'USER_RECEIPT',
    receipt_id: receiptId,
    user_id: userId,
    status: 'pending',
    created_at: new Date().toISOString(),
    ...receiptData,
  };

  await dynamoDbClient.send(new PutCommand({
    TableName: TABLES.MAIN,
    Item: convertFloats(userReceipt),
    ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
  }));

  return userReceipt;
};

export const updateUserReceiptValidation = async (
  userId: string, 
  receiptId: string, 
  isValid: boolean, 
  comments?: string
): Promise<void> => {
  await dynamoDbClient.send(new UpdateCommand({
    TableName: TABLES.MAIN,
    Key: {
      PK: `USER#${userId}`,
      SK: `RECEIPT#${receiptId}`,
    },
    UpdateExpression: 'SET validationStatus = :status, validatedBy = :userId, validatedAt = :timestamp, comments = :comments',
    ExpressionAttributeValues: {
      ':status': isValid ? 'confirmed' : 'disputed',
      ':userId': userId,
      ':timestamp': new Date().toISOString(),
      ':comments': comments || null,
    },
  }));
};

// ==================== RECEIPT GEOMETRY ====================

export const getReceiptGeometry = async (receiptId: string): Promise<{ [fieldName: string]: { label?: ReceiptGeometry; value?: ReceiptGeometry; } }> => {
  const result = await dynamoDbClient.send(new QueryCommand({
    TableName: TABLES.MAIN,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk_prefix)',
    ExpressionAttributeValues: {
      ':pk': `RECEIPT#${receiptId}`,
      ':sk_prefix': 'GEOMETRY#',
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
};

export const storeReceiptGeometry = async (receiptId: string, fieldName: string, fieldType: 'label' | 'value', geometryData: Omit<ReceiptGeometry, 'PK' | 'SK' | 'entity_type' | 'receipt_id' | 'field_name' | 'field_type' | 'created_at'>): Promise<void> => {
  const geometry: ReceiptGeometry = {
    PK: `RECEIPT#${receiptId}`,
    SK: `GEOMETRY#${fieldName.toUpperCase()}#${fieldType.toUpperCase()}`,
    entity_type: 'RECEIPT_GEOMETRY',
    receipt_id: receiptId,
    field_name: fieldName,
    field_type: fieldType,
    created_at: new Date().toISOString(),
    ...geometryData,
  };

  await dynamoDbClient.send(new PutCommand({
    TableName: TABLES.MAIN,
    Item: convertFloats(geometry),
    ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
  }));
};

// ==================== RECEIPT SHARES ====================

export const createReceiptShare = async (receiptId: string, ownerUserId: string, expiresInDays: number = 30): Promise<ReceiptShare> => {
  const shareToken = require('crypto').randomBytes(32).toString('base64url');
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + (expiresInDays * 24 * 60 * 60 * 1000));
  const expiresAtTimestamp = Math.floor(expiresAt.getTime() / 1000);

  const share: ReceiptShare = {
    PK: `SHARE#${shareToken}`,
    SK: `RECEIPT#${receiptId}`,
    GSI2PK: `RECEIPT#${receiptId}`,
    GSI2SK: `SHARE#${shareToken}`,
    entity_type: 'RECEIPT_SHARE',
    receipt_id: receiptId,
    owner_user_id: ownerUserId,
    share_token: shareToken,
    created_at: createdAt.toISOString(),
    expires_at: expiresAtTimestamp,
    is_active: true,
    current_uses: 0,
  };

  await dynamoDbClient.send(new PutCommand({
    TableName: TABLES.MAIN,
    Item: convertFloats(share),
    ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
  }));

  return share;
};

export const getReceiptFromShareToken = async (shareToken: string): Promise<ReceiptShare | null> => {
  const result = await dynamoDbClient.send(new QueryCommand({
    TableName: TABLES.MAIN,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `SHARE#${shareToken}`,
    },
  }));

  const items = result.Items || [];
  if (items.length === 0) {
    return null;
  }

  const share = items[0] as ReceiptShare;
  
  // Check if share is still active
  if (!share.is_active) {
    return null;
  }

  // Check if expired (TTL will handle cleanup, but we can check here too)
  const now = Math.floor(Date.now() / 1000);
  if (share.expires_at < now) {
    return null;
  }

  return share;
};

export const getActiveSharesForReceipt = async (receiptId: string): Promise<ReceiptShare[]> => {
  const result = await dynamoDbClient.send(new QueryCommand({
    TableName: TABLES.MAIN,
    IndexName: GSI.GSI2,
    KeyConditionExpression: 'GSI2PK = :pk AND begins_with(GSI2SK, :sk_prefix)',
    ExpressionAttributeValues: {
      ':pk': `RECEIPT#${receiptId}`,
      ':sk_prefix': 'SHARE#',
    },
  }));

  // Filter out inactive shares
  const activeShares = (result.Items || [])
    .filter(share => share.is_active) as ReceiptShare[];

  return activeShares;
};