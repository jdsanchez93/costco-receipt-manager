import React, { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import {
  Box,
  Paper,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  IconButton,
} from '@mui/material';
import {
  Person as PersonIcon,
  PersonAdd as PersonAddIcon,
  Email as EmailIcon,
  AccountCircle as AccountCircleIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { getReceiptMembers, addReceiptMember } from '../services/api';
import { ReceiptMember } from '../types/singleTableTypes';

interface ReceiptMembersProps {
  receiptId: string;
  onMembersChange?: () => void;
}

const ReceiptMembers: React.FC<ReceiptMembersProps> = ({ 
  receiptId, 
  onMembersChange 
}) => {
  const { getAccessTokenSilently } = useAuth0();
  const [members, setMembers] = useState<ReceiptMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Form state
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [userType, setUserType] = useState<'authenticated' | 'placeholder'>('placeholder');

  const fetchMembers = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: process.env.REACT_APP_AUTH0_AUDIENCE,
        },
      });

      const membersData = await getReceiptMembers(receiptId, token);
      setMembers(membersData);
    } catch (err) {
      console.error('Error fetching receipt members:', err);
      setError('Failed to load receipt members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [receiptId]);

  const handleAddMember = async () => {
    if (!displayName.trim()) return;

    setSubmitting(true);
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: process.env.REACT_APP_AUTH0_AUDIENCE,
        },
      });

      await addReceiptMember(receiptId, {
        displayName: displayName.trim(),
        email: email.trim() || undefined,
        userType,
      }, token);

      // Reset form
      setDisplayName('');
      setEmail('');
      setUserType('placeholder');
      setAddDialogOpen(false);

      // Refresh members list
      await fetchMembers();
      
      if (onMembersChange) {
        onMembersChange();
      }
    } catch (err) {
      console.error('Error adding member:', err);
      setError('Failed to add member');
    } finally {
      setSubmitting(false);
    }
  };

  const getMemberIcon = (member: ReceiptMember) => {
    if (member.user_type === 'authenticated') {
      return <AccountCircleIcon color="primary" />;
    } else {
      return <PersonIcon color="action" />;
    }
  };

  const getMemberSubtitle = (member: ReceiptMember) => {
    const parts = [];
    
    if (member.user_type === 'authenticated' && member.email) {
      parts.push(member.email);
    } else if (member.user_type === 'placeholder') {
      parts.push('Placeholder user');
    }
    
    parts.push(`Added ${new Date(member.added_at).toLocaleDateString()}`);
    
    return parts.join(' • ');
  };

  const handleCloseDialog = () => {
    setAddDialogOpen(false);
    setDisplayName('');
    setEmail('');
    setUserType('placeholder');
    setError(null);
  };

  if (loading) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress />
        <Typography mt={2}>Loading receipt members...</Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">
          Receipt Members ({members.length})
        </Typography>
        <Button
          variant="contained"
          startIcon={<PersonAddIcon />}
          onClick={() => setAddDialogOpen(true)}
          size="small"
        >
          Add Member
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {members.length === 0 ? (
        <Box textAlign="center" py={4}>
          <PersonIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="body1" color="text.secondary" mb={2}>
            No members added yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Add members to split receipt items between multiple people
          </Typography>
        </Box>
      ) : (
        <List>
          {members.map((member) => (
            <ListItem key={member.SK} divider>
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
                    {member.claimed_from_placeholder && (
                      <Chip
                        label="Claimed"
                        color="success"
                        size="small"
                      />
                    )}
                  </Box>
                }
                secondary={getMemberSubtitle(member)}
              />
            </ListItem>
          ))}
        </List>
      )}

      {/* Add Member Dialog */}
      <Dialog 
        open={addDialogOpen} 
        onClose={handleCloseDialog}
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            Add Receipt Member
            <IconButton onClick={handleCloseDialog} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={3} pt={1}>
            <TextField
              fullWidth
              label="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter person's name"
              required
            />

            <FormControl fullWidth>
              <InputLabel>User Type</InputLabel>
              <Select
                value={userType}
                label="User Type"
                onChange={(e) => setUserType(e.target.value as 'authenticated' | 'placeholder')}
              >
                <MenuItem value="placeholder">
                  <Box display="flex" alignItems="center" gap={1}>
                    <PersonIcon />
                    <Box>
                      <Typography variant="body2">Placeholder User</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Person who doesn't have an account yet
                      </Typography>
                    </Box>
                  </Box>
                </MenuItem>
                <MenuItem value="authenticated">
                  <Box display="flex" alignItems="center" gap={1}>
                    <AccountCircleIcon />
                    <Box>
                      <Typography variant="body2">Existing User</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Person with an account (requires email)
                      </Typography>
                    </Box>
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>

            {userType === 'authenticated' && (
              <TextField
                fullWidth
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email address"
                required
                InputProps={{
                  startAdornment: <EmailIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                }}
              />
            )}

            <Alert severity="info">
              {userType === 'placeholder' 
                ? 'Placeholder users can later claim their account by signing up and using a share link.'
                : 'The user will be notified and can access the receipt through their account.'
              }
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={submitting}>
            Cancel
          </Button>
          <Button 
            onClick={handleAddMember}
            variant="contained"
            disabled={!displayName.trim() || (userType === 'authenticated' && !email.trim()) || submitting}
            startIcon={submitting ? <CircularProgress size={20} /> : <PersonAddIcon />}
          >
            {submitting ? 'Adding...' : 'Add Member'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default ReceiptMembers;