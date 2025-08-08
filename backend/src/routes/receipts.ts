import { Router } from 'express';
import multer from 'multer';
import { checkJwt, logTokenDetails } from '../middleware/auth';
import { 
  uploadReceipt,
  getUploadUrl,
  getDownloadUrl,
  getUserReceipts, 
  getReceiptItems,
  getAllItems 
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
router.post('/get-upload-url', checkJwt, getUploadUrl);
router.get('/get-download-url/:receiptId', checkJwt, getDownloadUrl);
router.post('/upload', checkJwt, upload.single('receipt'), uploadReceipt);
router.get('/user-receipts', checkJwt, getUserReceipts);
router.get('/receipt/:receiptId/items', checkJwt, getReceiptItems);
router.get('/items', checkJwt, getAllItems);

export default router;