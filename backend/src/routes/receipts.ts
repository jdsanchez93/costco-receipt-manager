import { Router } from 'express';
import multer from 'multer';
import { checkJwt, logTokenDetails } from '../middleware/auth';
import { 
  uploadReceipt,
  getUploadUrl,
  getDownloadUrl,
  getUserReceipts, 
  getReceiptItems,
  getAllItems,
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
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Add logging middleware to all routes for debugging
router.use(logTokenDetails);

// Apply authentication to specific routes
// Upload and download routes
router.post('/get-upload-url', checkJwt, getUploadUrl);
router.get('/get-download-url/:receiptId', checkJwt, getDownloadUrl);
router.post('/upload', checkJwt, upload.single('receipt'), uploadReceipt);

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

// Legacy route for all items
router.get('/items', checkJwt, getAllItems);

export default router;