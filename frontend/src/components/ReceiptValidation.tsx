import React, { useState, useRef, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { 
  Box, 
  Paper, 
  Typography,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Stack,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { getReceiptDownloadUrl, getReceiptGeometry, validateReceiptSubtotal } from '../services/api';
import { UserReceipt } from '../types/singleTableTypes';

interface BoundingBox {
  Width: number;
  Height: number;
  Left: number;
  Top: number;
}

interface Point {
  X: number;
  Y: number;
}

interface ReceiptGeometry {
  PK: string;
  SK: string;
  receipt_id: string;
  field_name: string;
  field_type: 'label' | 'value';
  text: string;
  confidence: number;
  bounding_box: BoundingBox;
  polygon: Point[];
  created_at: string;
}

interface GeometryData {
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
}

interface ReceiptValidationProps {
  receiptId: string;
  receipt: UserReceipt;
  calculatedTotal: number;
  onValidationComplete: () => void;
}

const ReceiptValidation: React.FC<ReceiptValidationProps> = ({ 
  receiptId, 
  receipt, 
  calculatedTotal,
  onValidationComplete
}) => {
  const { getAccessTokenSilently } = useAuth0();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [geometryData, setGeometryData] = useState<GeometryData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const token = await getAccessTokenSilently({
          authorizationParams: {
            audience: process.env.REACT_APP_AUTH0_AUDIENCE,
          },
        });

        // Fetch both image URL and geometry data in parallel
        const [imageResponse, geometryResponse] = await Promise.all([
          getReceiptDownloadUrl(receiptId, token),
          getReceiptGeometry(receiptId, token)
        ]);

        setImageUrl(imageResponse.downloadUrl);
        setGeometryData(geometryResponse);
      } catch (err) {
        console.error('Error fetching receipt data:', err);
        setError('Failed to load receipt data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [receiptId, getAccessTokenSilently]);

  const handleImageLoad = () => {
    if (imageRef.current) {
      setImageDimensions({
        width: imageRef.current.clientWidth,
        height: imageRef.current.clientHeight,
      });
      setImageLoaded(true);
    }
  };

  const handleValidation = async (isValid: boolean) => {
    setSubmitting(true);
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: process.env.REACT_APP_AUTH0_AUDIENCE,
        },
      });

      await validateReceiptSubtotal(receiptId, isValid, comments, token);
      setValidationDialogOpen(false);
      onValidationComplete();
    } catch (err) {
      console.error('Error validating receipt:', err);
      setError('Failed to submit validation');
    } finally {
      setSubmitting(false);
    }
  };

  const renderBoundingBoxes = () => {
    if (!imageLoaded) return null;

    const boxes = [];
    const padding = 4; // pixels to expand the bounding box
    
    // Render subtotal label and value boxes
    if (geometryData.subtotal?.label) {
      const { bounding_box } = geometryData.subtotal.label;
      const left = (bounding_box.Left * imageDimensions.width) - padding;
      const top = (bounding_box.Top * imageDimensions.height) - padding;
      const width = (bounding_box.Width * imageDimensions.width) + (padding * 2);
      const height = (bounding_box.Height * imageDimensions.height) + (padding * 2);

      boxes.push(
        <div
          key="subtotal-label"
          style={{
            position: 'absolute',
            left: `${Math.max(0, left)}px`,
            top: `${Math.max(0, top)}px`,
            width: `${width}px`,
            height: `${height}px`,
            border: '2px solid #2196f3',
            backgroundColor: 'rgba(33, 150, 243, 0.05)',
            borderRadius: '4px',
            zIndex: 10,
          }}
        />
      );
    }

    if (geometryData.subtotal?.value) {
      const { bounding_box } = geometryData.subtotal.value;
      const left = (bounding_box.Left * imageDimensions.width) - padding;
      const top = (bounding_box.Top * imageDimensions.height) - padding;
      const width = (bounding_box.Width * imageDimensions.width) + (padding * 2);
      const height = (bounding_box.Height * imageDimensions.height) + (padding * 2);

      boxes.push(
        <div
          key="subtotal-value"
          style={{
            position: 'absolute',
            left: `${Math.max(0, left)}px`,
            top: `${Math.max(0, top)}px`,
            width: `${width}px`,
            height: `${height}px`,
            border: '3px solid #ff6b35',
            backgroundColor: 'rgba(255, 107, 53, 0.1)',
            borderRadius: '4px',
            zIndex: 11,
          }}
        />
      );
    }

    return <>{boxes}</>;
  };

  const getValidationStatus = () => {
    if (!geometryData.subtotal?.value) {
      return {
        status: 'no-subtotal',
        message: 'No subtotal found in receipt image',
        color: 'warning' as const,
        icon: <ErrorIcon />
      };
    }

    const textractAmount = parseFloat(geometryData.subtotal.value.text.replace(/[^\d.-]/g, ''));
    const difference = Math.abs(textractAmount - calculatedTotal);
    const tolerance = 0.01; // 1 cent tolerance

    if (difference <= tolerance) {
      return {
        status: 'match',
        message: 'Subtotal matches calculated total',
        color: 'success' as const,
        icon: <CheckCircleIcon />
      };
    } else {
      return {
        status: 'mismatch',
        message: `Subtotal differs by $${difference.toFixed(2)}`,
        color: 'error' as const,
        icon: <ErrorIcon />
      };
    }
  };

  if (loading) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress />
        <Typography mt={2}>Loading receipt validation...</Typography>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Paper>
    );
  }

  if (!imageUrl) {
    return (
      <Paper sx={{ p: 3 }}>
        <Alert severity="info">No receipt image available for validation</Alert>
      </Paper>
    );
  }

  const validationStatus = getValidationStatus();

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Receipt Validation
      </Typography>

      <Box mb={2}>
        <Stack direction="row" spacing={2} alignItems="center" mb={2}>
          <Typography variant="body1">
            <strong>Calculated Total:</strong> ${calculatedTotal.toFixed(2)}
          </Typography>
          {geometryData.subtotal?.value && (
            <Typography variant="body1">
              <strong>Receipt Subtotal:</strong> {geometryData.subtotal.value.text}
            </Typography>
          )}
          <Chip
            icon={validationStatus.icon}
            label={validationStatus.message}
            color={validationStatus.color}
            size="small"
          />
        </Stack>

        {receipt.validationStatus && (
          <Alert 
            severity={receipt.validationStatus === 'confirmed' ? 'success' : 'warning'}
            sx={{ mb: 2 }}
          >
            This receipt has been {receipt.validationStatus} 
            {receipt.validatedAt && ` on ${new Date(receipt.validatedAt).toLocaleDateString()}`}
          </Alert>
        )}
      </Box>

      <Box sx={{ position: 'relative', display: 'inline-block' }} ref={containerRef}>
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Receipt for validation"
          style={{
            maxWidth: '100%',
            height: 'auto',
            maxHeight: '600px',
          }}
          onLoad={handleImageLoad}
        />
        {renderBoundingBoxes()}
      </Box>

      <Box mt={2}>
        <Typography variant="body2" color="text.secondary" mb={2}>
          {geometryData.subtotal?.value ? 
            `Orange box highlights the subtotal value (${geometryData.subtotal.value.confidence.toFixed(1)}% confidence). Blue box shows the label.` :
            'No subtotal text detected in this receipt'
          }
        </Typography>

        <Stack direction="row" spacing={2}>
          <Button
            variant="contained"
            color="success"
            onClick={() => setValidationDialogOpen(true)}
            disabled={!geometryData.subtotal?.value || receipt.validationStatus === 'confirmed'}
          >
            {validationStatus.status === 'match' ? 'Confirm Match' : 'Confirm Anyway'}
          </Button>
          <Button
            variant="outlined"
            color="error"
            onClick={() => setValidationDialogOpen(true)}
            disabled={!geometryData.subtotal?.value || receipt.validationStatus === 'disputed'}
          >
            Report Issue
          </Button>
        </Stack>
      </Box>

      <Dialog open={validationDialogOpen} onClose={() => setValidationDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Validate Receipt Subtotal</DialogTitle>
        <DialogContent>
          <Typography mb={2}>
            Does the calculated total (${calculatedTotal.toFixed(2)}) match the subtotal shown on the receipt?
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Comments (optional)"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Add any notes about discrepancies or issues..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setValidationDialogOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button 
            onClick={() => handleValidation(false)} 
            color="error"
            disabled={submitting}
          >
            Report Issue
          </Button>
          <Button 
            onClick={() => handleValidation(true)} 
            color="success" 
            variant="contained"
            disabled={submitting}
          >
            {submitting ? <CircularProgress size={20} /> : 'Confirm Match'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default ReceiptValidation;