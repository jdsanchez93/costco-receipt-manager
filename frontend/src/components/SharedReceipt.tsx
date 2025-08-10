import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Paper,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Button,
} from '@mui/material';
import {
  Person as PersonIcon,
  AccountCircle as AccountCircleIcon,
  ArrowBack as ArrowBackIcon,
  Share as ShareIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { getSharedReceipt } from '../services/api';
import { SharedReceiptResponse, ReceiptMember } from '../types/singleTableTypes';
import ItemsTable from './ItemsTable';
import ReceiptValidation from './ReceiptValidation';

const SharedReceipt: React.FC = () => {
  const { shareToken } = useParams<{ shareToken: string }>();
  const navigate = useNavigate();
  const [sharedReceipt, setSharedReceipt] = useState<SharedReceiptResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSharedReceipt = async () => {
      if (!shareToken) {
        setError('Invalid share token');
        setLoading(false);
        return;
      }

      try {
        const data = await getSharedReceipt(shareToken);
        setSharedReceipt(data);
      } catch (err: any) {
        console.error('Error fetching shared receipt:', err);
        if (err.response?.status === 404) {
          setError('This share link is invalid or has expired');
        } else {
          setError('Failed to load shared receipt');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchSharedReceipt();
  }, [shareToken]);

  const getMemberIcon = (member: ReceiptMember) => {
    if (member.user_type === 'authenticated') {
      return <AccountCircleIcon color="primary" />;
    } else {
      return <PersonIcon color="action" />;
    }
  };

  const calculatedTotal = sharedReceipt?.items.reduce(
    (sum, item) => sum + (item.price - (item.discount || 0)), 0
  ) || 0;

  if (loading) {
    return (
      <Container>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error || !sharedReceipt) {
    return (
      <Container>
        <Box py={4}>
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
          <Button 
            startIcon={<ArrowBackIcon />} 
            onClick={() => navigate('/')}
          >
            Go to Dashboard
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      {/* Header */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box display="flex" alignItems="center" gap={2} mb={2}>
          <ShareIcon color="primary" />
          <Typography variant="h4" component="h1">
            Shared Receipt
          </Typography>
        </Box>
        
        <Alert severity="info" sx={{ mb: 2 }}>
          This receipt has been shared with you. You're viewing a read-only version.
        </Alert>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 3 }}>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Receipt ID
            </Typography>
            <Typography variant="body1">
              {sharedReceipt.receiptId}
            </Typography>
          </Box>
          
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Total Items
            </Typography>
            <Typography variant="body1">
              {sharedReceipt.items.length}
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

          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Share Expires
            </Typography>
            <Typography variant="body1">
              <Box display="flex" alignItems="center" gap={1}>
                <ScheduleIcon fontSize="small" />
                {new Date(sharedReceipt.shareInfo.expiresAt).toLocaleDateString()}
              </Box>
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Receipt Members */}
      {sharedReceipt.members.length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Receipt Members ({sharedReceipt.members.length})
          </Typography>
          <List>
            {sharedReceipt.members.map((member) => (
              <ListItem key={member.SK}>
                <ListItemAvatar>
                  <Avatar>
                    {getMemberIcon(member)}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography variant="body1">
                        {member.display_name}
                      </Typography>
                      <Chip
                        label={member.user_type === 'authenticated' ? 'User' : 'Placeholder'}
                        color={member.user_type === 'authenticated' ? 'primary' : 'default'}
                        size="small"
                      />
                    </Box>
                  }
                  secondary={
                    member.user_type === 'authenticated' && member.email
                      ? member.email
                      : 'Placeholder user'
                  }
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {/* Receipt Validation - if geometry data exists */}
      {Object.keys(sharedReceipt.geometry).length > 0 && (
        <Box mb={3}>
          <Typography variant="h5" gutterBottom>
            Receipt Validation
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            This validation view is read-only. Only the receipt owner can make changes.
          </Alert>
          {/* Create a simple UserReceipt object for the validation component */}
          <ReceiptValidation 
            receiptId={sharedReceipt.receiptId}
            receipt={{
              PK: `USER#shared`,
              SK: `RECEIPT#${sharedReceipt.receiptId}`,
              entity_type: 'USER_RECEIPT',
              receipt_id: sharedReceipt.receiptId,
              user_id: 'shared',
              status: 'active',
              validationStatus: 'pending', // Default for shared view
            }}
            calculatedTotal={calculatedTotal}
            onValidationComplete={() => {}} // No-op for shared view
          />
        </Box>
      )}

      {/* Receipt Items */}
      <Box>
        <Typography variant="h5" gutterBottom>
          Receipt Items
        </Typography>
        <ItemsTable items={sharedReceipt.items} />
      </Box>

      {/* Call to Action */}
      <Paper sx={{ p: 3, mt: 3, textAlign: 'center' }}>
        <Typography variant="h6" gutterBottom>
          Want to manage your own receipts?
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Create your own account to upload, validate, and share receipts with others.
        </Typography>
        <Button 
          variant="contained" 
          onClick={() => navigate('/')}
          sx={{ mr: 2 }}
        >
          Get Started
        </Button>
      </Paper>
    </Container>
  );
};

export default SharedReceipt;