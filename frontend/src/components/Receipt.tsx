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
import MemberTotals from './MemberTotals';
import { getReceiptItems, getUserReceipts, getReceiptMembers, updateMemberDetails } from '../services/api';
import { ReceiptMember, ReceiptItem as SingleTableReceiptItem } from '../types/singleTableTypes';

// Use the single table types
type ReceiptItem = SingleTableReceiptItem;

const Receipt: React.FC = () => {
  const [receiptMember, setReceiptMember] = useState<ReceiptMember | null>(null);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [members, setMembers] = useState<ReceiptMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);

  // Color palette for members (cycling through colors)
  const memberColors = [
    'primary', 'secondary', 'error', 'warning', 'info', 'success'
  ] as const;

  // Helper function to get consistent color for a member
  const getMemberColor = (memberId: string) => {
    const memberIndex = members.findIndex(m =>
      (m.userId === memberId) || (m.placeholderId === memberId)
    );
    return memberIndex >= 0 ? memberColors[memberIndex % memberColors.length] : 'default';
  };
  
  // Move hooks after state initialization
  const params = useParams();
  const receiptId = params?.receiptId;
  const navigate = useNavigate();
  const { getAccessTokenSilently, user } = useAuth0();

  const fetchReceiptData = useCallback(async (retryCount = 0) => {
    const maxRetries = 5;
    const baseDelay = 1000; // 1 second

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
        m.receiptId === receiptId
      );
      
      if (!currentMembership) {
        // If this is a retry-eligible error and we haven't exceeded max retries
        if (retryCount < maxRetries) {
          const delay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
          console.log(`Receipt not found, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries + 1})`);
          
          setRetryStatus(`Receipt is still processing... Retrying in ${Math.ceil(delay / 1000)} seconds (${retryCount + 1}/${maxRetries + 1})`);
          
          setTimeout(() => {
            fetchReceiptData(retryCount + 1);
          }, delay);
          return;
        }
        
        setError('Receipt not found or access denied');
        setLoading(false);
        setRetryStatus(null);
        return;
      }
      
      setReceiptMember(currentMembership);
      setRetryStatus(null); // Clear retry status on success

      // Get receipt items and members
      const [itemsData, membersData] = await Promise.all([
        getReceiptItems(receiptId, token),
        getReceiptMembers(receiptId, token)
      ]);
      setItems(itemsData);
      setMembers(membersData);

      // Check if current user's member details need updating
      if (user?.sub && user?.email) {
        const currentUserMember = membersData.find((member: ReceiptMember) =>
          member.userId === user.sub && member.userType === 'authenticated'
        );

        // If the member exists but has empty displayName, update it
        if (currentUserMember && (!currentUserMember.displayName || currentUserMember.displayName === '')) {
          try {
            await updateMemberDetails(
              receiptId, 
              user.email,
              user.name || user.nickname,
              token
            );
            // Refresh member data to get updated details
            const updatedMembersData = await getReceiptMembers(receiptId, token);
            setMembers(updatedMembersData);
          } catch (error) {
            console.warn('Failed to update member details:', error);
            // Continue without showing error to user since this is a background operation
          }
        }
      }
    } catch (err) {
      console.error('Error fetching receipt data:', err);
      
      // Retry on certain errors that might be timing-related
      if (retryCount < maxRetries && (err as any)?.response?.status === 404) {
        const delay = baseDelay * Math.pow(2, retryCount);
        console.log(`API error, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries + 1})`);
        
        setRetryStatus(`Receipt is still processing... Retrying in ${Math.ceil(delay / 1000)} seconds (${retryCount + 1}/${maxRetries + 1})`);
        
        setTimeout(() => {
          fetchReceiptData(retryCount + 1);
        }, delay);
        return;
      }
      
      setError('Failed to load receipt data');
      setRetryStatus(null);
    } finally {
      // Only set loading to false if we're not retrying
      if (retryCount >= maxRetries || !retryStatus) {
        setLoading(false);
      }
    }
  }, [receiptId, getAccessTokenSilently, user?.sub, user?.email, user?.name, user?.nickname]);

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
        <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="50vh">
          <CircularProgress />
          {retryStatus && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
              {retryStatus}
            </Typography>
          )}
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
              {receiptMember.displayName}
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Member Type
            </Typography>
            <Chip
              label={receiptMember.userType === 'authenticated' ? 'User' : 'Placeholder'}
              color={receiptMember.userType === 'authenticated' ? 'primary' : 'default'}
              size="small"
            />
          </Box>

          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Date
            </Typography>
            <Typography variant="body1">
              {receiptMember.addedAt ? new Date(receiptMember.addedAt).toLocaleDateString() : 'Unknown'}
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

      <Box mb={3}>
        <Typography variant="h5" gutterBottom>
          Member Totals
        </Typography>
        <MemberTotals 
          items={items}
          members={members}
          getMemberColor={getMemberColor}
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
          getMemberColor={getMemberColor}
        />
      </Box>
    </Container>
  );
};

export default Receipt;