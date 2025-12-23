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
import MemberTotals from './MemberTotals';

const SharedReceipt: React.FC = () => {
  const { shareToken } = useParams<{ shareToken: string }>();
  const navigate = useNavigate();
  const [sharedReceipt, setSharedReceipt] = useState<SharedReceiptResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Color palette for members (cycling through colors)
  const memberColors = [
    'primary', 'secondary', 'error', 'warning', 'info', 'success'
  ] as const;

  // Helper function to get consistent color for a member
  const getMemberColor = (memberId: string) => {
    if (!sharedReceipt) return 'default';
    const memberIndex = sharedReceipt.members.findIndex(m =>
      (m.userId === memberId) || (m.placeholderId === memberId)
    );
    return memberIndex >= 0 ? memberColors[memberIndex % memberColors.length] : 'default';
  };

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
    if (member.userType === 'authenticated') {
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

        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: { 
            xs: '1fr', 
            sm: 'repeat(2, 1fr)', 
            md: 'repeat(4, 1fr)' 
          }, 
          gap: 3 
        }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h4" fontWeight="bold" color="primary">
              {sharedReceipt.items.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total Items
            </Typography>
          </Box>
          
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h4" fontWeight="bold" color="primary">
              {sharedReceipt.members.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Members
            </Typography>
          </Box>

          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h4" fontWeight="bold" color="success.main">
              ${calculatedTotal.toFixed(2)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total Amount
            </Typography>
          </Box>

          <Box sx={{ textAlign: 'center' }}>
            <Box display="flex" alignItems="center" justifyContent="center" gap={1}>
              <ScheduleIcon fontSize="small" />
              <Typography variant="body1" fontWeight="bold">
                {new Date(sharedReceipt.shareInfo.expiresAt).toLocaleDateString()}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Share Expires
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
          <Box sx={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: 2 
          }}>
            {sharedReceipt.members.map((member, index) => {
              const memberId = member.userId || member.placeholderId || '';
              const memberColor = memberColors[index % memberColors.length];
              
              return (
                <Box 
                  key={member.SK}
                  sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 1.5,
                    p: 2,
                    border: '2px solid',
                    borderColor: `${memberColor}.main`,
                    borderRadius: 2,
                    bgcolor: (theme) => theme.palette.mode === 'dark' 
                      ? `${memberColor}.dark` 
                      : `${memberColor}.light`,
                    opacity: 0.9,
                    minWidth: 200
                  }}
                >
                  <Avatar sx={{ 
                    width: 32, 
                    height: 32,
                    bgcolor: `${memberColor}.main`,
                    color: 'white'
                  }}>
                    {getMemberIcon(member)}
                  </Avatar>
                  <Box>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography variant="body2" fontWeight="medium">
                        {member.displayName}
                      </Typography>
                      <Chip
                        label={member.userType === 'authenticated' ? 'User' : 'Guest'}
                        color={memberColor}
                        size="small"
                        sx={{ height: 20, fontSize: '0.75rem' }}
                      />
                    </Box>
                    {member.userType === 'authenticated' && member.email && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {member.email}
                      </Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Paper>
      )}

      {/* Member Totals */}
      <Box mb={3}>
        <Typography variant="h5" gutterBottom>
          Cost Breakdown
        </Typography>
        <MemberTotals 
          items={sharedReceipt.items}
          members={sharedReceipt.members}
          getMemberColor={getMemberColor}
        />
      </Box>

      {/* Receipt Items */}
      <Box mb={3}>
        <Typography variant="h5" gutterBottom>
          Receipt Items
        </Typography>
        <ItemsTable 
          items={sharedReceipt.items} 
          members={sharedReceipt.members}
          getMemberColor={getMemberColor}
          isSharedView={true}
        />
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