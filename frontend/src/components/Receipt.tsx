import React, { useState, useEffect, useCallback } from 'react';
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
import ReceiptMembers from './ReceiptMembers';
import ReceiptSharing from './ReceiptSharing';
import ItemAssignment from './ItemAssignment';
import { getReceiptItems, getUserReceipts, getReceiptMembers } from '../services/api';
import { ReceiptMember, ReceiptItem as SingleTableReceiptItem } from '../types/singleTableTypes';

// Use the single table types
type ReceiptItem = SingleTableReceiptItem;

const Receipt: React.FC = () => {
  const [receiptMember, setReceiptMember] = useState<ReceiptMember | null>(null);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [members, setMembers] = useState<ReceiptMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Move hooks after state initialization
  const params = useParams();
  const receiptId = params?.receiptId;
  const navigate = useNavigate();
  const { getAccessTokenSilently } = useAuth0();

  const fetchReceiptData = useCallback(async () => {
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

      // Get user's membership in receipts
      const receiptMembers = await getUserReceipts(token);
      const currentMembership = receiptMembers.find((m: ReceiptMember) => 
        m.receipt_id === receiptId
      );
      
      if (!currentMembership) {
        setError('Receipt not found or access denied');
        setLoading(false);
        return;
      }
      
      setReceiptMember(currentMembership);

      // Get receipt items and members
      const [itemsData, membersData] = await Promise.all([
        getReceiptItems(receiptId, token),
        getReceiptMembers(receiptId, token)
      ]);
      setItems(itemsData);
      setMembers(membersData);
    } catch (err) {
      console.error('Error fetching receipt data:', err);
      setError('Failed to load receipt data');
    } finally {
      setLoading(false);
    }
  }, [receiptId, getAccessTokenSilently]);

  useEffect(() => {
    fetchReceiptData();
  }, [fetchReceiptData]);

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

  if (!receiptMember) {
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
              Your Role
            </Typography>
            <Typography variant="body1">
              {receiptMember.display_name}
            </Typography>
          </Box>
          
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Member Type
            </Typography>
            <Chip 
              label={receiptMember.user_type === 'authenticated' ? 'User' : 'Placeholder'} 
              color={receiptMember.user_type === 'authenticated' ? 'primary' : 'default'}
              size="small"
            />
          </Box>
          
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Joined Date
            </Typography>
            <Typography variant="body1">
              {receiptMember.added_at ? new Date(receiptMember.added_at).toLocaleDateString() : 'Unknown'}
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

          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Calculated Total
            </Typography>
            <Typography variant="body1">
              ${calculatedTotal.toFixed(2)}
            </Typography>
          </Box>

          {receiptMember.validationStatus && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Your Validation
              </Typography>
              <Chip 
                label={receiptMember.validationStatus} 
                color={receiptMember.validationStatus === 'confirmed' ? 'success' : 
                       receiptMember.validationStatus === 'disputed' ? 'error' : 'default'}
                size="small"
              />
            </Box>
          )}

          {receiptMember.validatedAt && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Validated On
              </Typography>
              <Typography variant="body1">
                {new Date(receiptMember.validatedAt).toLocaleDateString()}
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
          receipt={receiptMember}
          calculatedTotal={calculatedTotal}
          onValidationComplete={handleValidationComplete}
        />
      </Box>

      <Box mb={3}>
        <Typography variant="h5" gutterBottom>
          Receipt Members
        </Typography>
        <ReceiptMembers 
          receiptId={receiptId || ''}
          onMembersChange={fetchReceiptData}
        />
      </Box>

      <Box mb={3}>
        <Typography variant="h5" gutterBottom>
          Share Receipt
        </Typography>
        <ReceiptSharing 
          receiptId={receiptId || ''}
        />
      </Box>

      <Box>
        <Typography variant="h5" gutterBottom>
          Assign Items to Members
        </Typography>
        <ItemAssignment 
          items={items}
          members={members}
          receiptId={receiptId || ''}
          onAssignmentChange={fetchReceiptData}
        />
      </Box>
    </Container>
  );
};

export default Receipt;