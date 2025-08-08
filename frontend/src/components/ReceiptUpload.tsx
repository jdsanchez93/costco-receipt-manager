import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Button,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { uploadReceipt } from '../services/api';

interface ReceiptUploadProps {
  onUploadSuccess: () => void;
}

const ReceiptUpload: React.FC<ReceiptUploadProps> = ({ onUploadSuccess }) => {
  const { getAccessTokenSilently } = useAuth0();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploadedReceiptIds, setUploadedReceiptIds] = useState<string[]>([]);
  const [showValidationDialog, setShowValidationDialog] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(prev => [...prev, ...acceptedFiles]);
    setError(null);
    setSuccess(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.bmp', '.webp']
    },
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setError(null);
    setSuccess(null);
    const receiptIds: string[] = [];

    try {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: process.env.REACT_APP_AUTH0_AUDIENCE,
        },
      });
      
      for (const file of files) {
        const result = await uploadReceipt(file, token);
        receiptIds.push(result.receiptId);
      }
      
      setSuccess(`Successfully uploaded ${files.length} receipt(s)`);
      setFiles([]);
      setUploadedReceiptIds(receiptIds);
      onUploadSuccess();
      
      // Show validation dialog after successful upload
      setShowValidationDialog(true);
    } catch (err) {
      console.error('Error uploading receipts:', err);
      setError('Failed to upload receipts. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleValidateReceipts = () => {
    setShowValidationDialog(false);
    if (uploadedReceiptIds.length === 1) {
      // Navigate to validation page for single receipt
      navigate(`/receipt/${uploadedReceiptIds[0]}`);
    } else {
      // For multiple receipts, navigate to the first one
      // User can validate others from the receipts table
      navigate(`/receipt/${uploadedReceiptIds[0]}`);
    }
  };

  const handleSkipValidation = () => {
    setShowValidationDialog(false);
    setUploadedReceiptIds([]);
  };

  return (
    <Box>
      <Paper
        {...getRootProps()}
        sx={{
          p: 4,
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: isDragActive ? 'action.hover' : 'background.paper',
          border: '2px dashed',
          borderColor: isDragActive ? 'primary.main' : 'divider',
          '&:hover': {
            backgroundColor: 'action.hover',
          },
        }}
      >
        <input {...getInputProps()} />
        <CloudUploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" gutterBottom>
          {isDragActive
            ? 'Drop the receipts here...'
            : 'Drag & drop receipt images here'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          or click to select files
        </Typography>
        <Typography variant="caption" display="block" mt={1}>
          Supported formats: JPEG, PNG, GIF, BMP, WebP (Max 10MB)
        </Typography>
      </Paper>

      {files.length > 0 && (
        <Box mt={2}>
          <Typography variant="subtitle1" gutterBottom>
            Files to upload:
          </Typography>
          <List>
            {files.map((file, index) => (
              <ListItem
                key={index}
                secondaryAction={
                  <IconButton edge="end" onClick={() => removeFile(index)}>
                    <DeleteIcon />
                  </IconButton>
                }
              >
                <ListItemText
                  primary={file.name}
                  secondary={`${(file.size / 1024 / 1024).toFixed(2)} MB`}
                />
              </ListItem>
            ))}
          </List>
          <Button
            variant="contained"
            color="primary"
            onClick={handleUpload}
            disabled={uploading}
            startIcon={uploading ? <CircularProgress size={20} /> : <CloudUploadIcon />}
          >
            {uploading ? 'Uploading...' : `Upload ${files.length} Receipt(s)`}
          </Button>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {success}
        </Alert>
      )}

      {/* Validation Dialog */}
      <Dialog open={showValidationDialog} onClose={handleSkipValidation} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <CheckCircleIcon color="success" />
            Upload Successful!
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography mb={2}>
            Your {uploadedReceiptIds.length === 1 ? 'receipt has' : 'receipts have'} been uploaded successfully.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Would you like to validate the receipt{uploadedReceiptIds.length > 1 ? 's' : ''} now? 
            This helps ensure the calculated totals match the receipt image.
            {uploadedReceiptIds.length > 1 && ' You can validate additional receipts from the receipts table.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSkipValidation} color="inherit">
            Skip for Now
          </Button>
          <Button 
            onClick={handleValidateReceipts} 
            variant="contained" 
            color="primary"
            startIcon={<CheckCircleIcon />}
          >
            Validate {uploadedReceiptIds.length === 1 ? 'Receipt' : 'First Receipt'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ReceiptUpload;