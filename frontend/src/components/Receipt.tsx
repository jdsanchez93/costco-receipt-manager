import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import {
  Container,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Button,
  Paper,
  Chip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ItemsTable from './ItemsTable';
import ReceiptValidation from './ReceiptValidation';
import { getReceiptItems, getUserReceipts } from '../services/api';

interface ReceiptItem {
  PK: string;
  SK: string;
  item_number: string;
  item_name: string;
  price: number;
  discount: number;
  receipt_id: string;
  assigned_users: string[];
}

interface UserReceipt {
  PK: string;
  SK: string;
  status: 'pending' | 'processed' | 'error';
  created_at: string;
  fileName?: string;
  fileUrl?: string;
  totalAmount?: number;
  receiptDate?: string;
  validationStatus?: 'pending' | 'confirmed' | 'disputed';
  validatedBy?: string;
  validatedAt?: string;
  comments?: string;
}

const Receipt: React.FC = () => {
  const [receipt, setReceipt] = useState<UserReceipt | null>(null);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Move hooks after state initialization
  const params = useParams();
  const receiptId = params?.receiptId;
  const navigate = useNavigate();
  const { getAccessTokenSilently } = useAuth0();

  const fetchReceiptData = async () => {
    if (!receiptId) {
      setError('Receipt ID not provided');
      setLoading(false);
      return;
    }

    try {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: process.env.REACT_APP_AUTH0_AUDIENCE,
        },
      });

      // Get receipt metadata
      const receipts = await getUserReceipts(token);
      const currentReceipt = receipts.find((r: UserReceipt) => 
        r.SK === `RECEIPT#${receiptId}`
      );
      
      if (!currentReceipt) {
        setError('Receipt not found');
        setLoading(false);
        return;
      }
      
      setReceipt(currentReceipt);

      // Get receipt items
      const itemsData = await getReceiptItems(receiptId, token);
      setItems(itemsData);
    } catch (err) {
      console.error('Error fetching receipt data:', err);
      setError('Failed to load receipt data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReceiptData();
  }, [receiptId, getAccessTokenSilently]);

  const handleValidationComplete = () => {
    // Refresh receipt data to show updated validation status
    fetchReceiptData();
  };

  if (loading) {
    return (
      <Container>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Box py={4}>
          <Button 
            startIcon={<ArrowBackIcon />} 
            onClick={() => navigate('/')}
            sx={{ mb: 2 }}
          >
            Back to Receipts
          </Button>
          <Alert severity="error">{error}</Alert>
        </Box>
      </Container>
    );
  }

  if (!receipt) {
    return (
      <Container>
        <Box py={4}>
          <Button 
            startIcon={<ArrowBackIcon />} 
            onClick={() => navigate('/')}
            sx={{ mb: 2 }}
          >
            Back to Receipts
          </Button>
          <Alert severity="warning">Receipt not found</Alert>
        </Box>
      </Container>
    );
  }

  const totalItems = items.length;
  const calculatedTotal = items.reduce((sum, item) => sum + (item.price - (item.discount || 0)), 0);

  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Button 
        startIcon={<ArrowBackIcon />} 
        onClick={() => navigate('/')}
        sx={{ mb: 3 }}
      >
        Back to Receipts
      </Button>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Receipt Details
        </Typography>
        
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 3 }}>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Receipt ID
            </Typography>
            <Typography variant="body1">
              {receiptId}
            </Typography>
          </Box>
          
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Status
            </Typography>
            <Chip 
              label={receipt.status} 
              color={receipt.status === 'processed' ? 'success' : 
                     receipt.status === 'error' ? 'error' : 'default'}
              size="small"
            />
          </Box>
          
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Upload Date
            </Typography>
            <Typography variant="body1">
              {new Date(receipt.created_at).toLocaleDateString()}
            </Typography>
          </Box>
          
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Total Items
            </Typography>
            <Typography variant="body1">
              {totalItems}
            </Typography>
          </Box>

          {receipt.receiptDate && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Receipt Date
              </Typography>
              <Typography variant="body1">
                {new Date(receipt.receiptDate).toLocaleDateString()}
              </Typography>
            </Box>
          )}

          {receipt.totalAmount && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Receipt Total
              </Typography>
              <Typography variant="body1">
                ${receipt.totalAmount.toFixed(2)}
              </Typography>
            </Box>
          )}

          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Calculated Total
            </Typography>
            <Typography variant="body1">
              ${calculatedTotal.toFixed(2)}
            </Typography>
          </Box>

          {receipt.validationStatus && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Validation Status
              </Typography>
              <Chip 
                label={receipt.validationStatus} 
                color={receipt.validationStatus === 'confirmed' ? 'success' : 
                       receipt.validationStatus === 'disputed' ? 'error' : 'default'}
                size="small"
              />
            </Box>
          )}

          {receipt.validatedAt && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Validated On
              </Typography>
              <Typography variant="body1">
                {new Date(receipt.validatedAt).toLocaleDateString()}
              </Typography>
            </Box>
          )}

          {receipt.fileName && (
            <Box sx={{ gridColumn: '1 / -1' }}>
              <Typography variant="subtitle2" color="text.secondary">
                File Name
              </Typography>
              <Typography variant="body1">
                {receipt.fileName}
              </Typography>
            </Box>
          )}
        </Box>
      </Paper>

      <Box mb={3}>
        <Typography variant="h5" gutterBottom>
          Receipt Validation
        </Typography>
        <ReceiptValidation 
          receiptId={receiptId || ''} 
          receipt={receipt}
          calculatedTotal={calculatedTotal}
          onValidationComplete={handleValidationComplete}
        />
      </Box>

      <Box>
        <Typography variant="h5" gutterBottom>
          Receipt Items
        </Typography>
        <ItemsTable items={items} />
      </Box>
    </Container>
  );
};

export default Receipt;