import { Router } from 'express';
import { checkJwt, logTokenDetails } from '../middleware/auth';
import { 
  getUploadUrl,
  getDownloadUrl,
  getUserReceipts, 
  getReceiptItems,
  getReceiptGeometryData,
  validateReceiptSubtotal,
  getReceiptMembers,
  addReceiptMember,
  updateMemberDetails,
  createReceiptShare,
  getReceiptShares,
  getSharedReceipt,
  updateItemAssignment,
  bulkUpdateItemAssignments,
  clearAllItemAssignments
} from '../controllers/receiptController';

const router = Router();

// Add logging middleware to all routes for debugging
router.use(logTokenDetails);

// Apply authentication to specific routes
// Upload and download routes
router.post('/get-upload-url', checkJwt, getUploadUrl);
router.get('/get-download-url/:receiptId', checkJwt, getDownloadUrl);

// User receipts routes
router.get('/user-receipts', checkJwt, getUserReceipts);

// Receipt data routes
router.get('/receipt/:receiptId/items', checkJwt, getReceiptItems);
router.get('/receipt/:receiptId/geometry', checkJwt, getReceiptGeometryData);
router.post('/validate/:receiptId', checkJwt, validateReceiptSubtotal);

// Receipt members routes
router.get('/receipt/:receiptId/members', checkJwt, getReceiptMembers);
router.post('/receipt/:receiptId/members', checkJwt, addReceiptMember);
router.put('/receipt/:receiptId/members/update-details', checkJwt, updateMemberDetails);

// Receipt sharing routes
router.post('/receipt/:receiptId/share', checkJwt, createReceiptShare);
router.get('/receipt/:receiptId/shares', checkJwt, getReceiptShares);

// Public sharing route (no auth required)
router.get('/shared/:shareToken', getSharedReceipt);

// Item assignments routes
router.put('/receipt/:receiptId/items/:itemId/assignment', checkJwt, updateItemAssignment);
router.put('/receipt/:receiptId/items/assignments/bulk', checkJwt, bulkUpdateItemAssignments);
router.delete('/receipt/:receiptId/items/assignments/all', checkJwt, clearAllItemAssignments);

export default router;