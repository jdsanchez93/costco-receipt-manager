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
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Chip,
  InputAdornment,
  Snackbar,
} from '@mui/material';
import {
  Share as ShareIcon,
  ContentCopy as CopyIcon,
  Link as LinkIcon,
  Add as AddIcon,
  Close as CloseIcon,
  AccessTime as AccessTimeIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { createReceiptShare, getReceiptShares } from '../services/api';
import { ReceiptShare } from '../types/singleTableTypes';

interface ReceiptSharingProps {
  receiptId: string;
}

const ReceiptSharing: React.FC<ReceiptSharingProps> = ({ receiptId }) => {
  const { getAccessTokenSilently } = useAuth0();
  const [shares, setShares] = useState<ReceiptShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [copySnackbarOpen, setCopySnackbarOpen] = useState(false);

  const fetchShares = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: process.env.REACT_APP_AUTH0_AUDIENCE,
        },
      });

      const sharesData = await getReceiptShares(receiptId, token);
      setShares(sharesData);
    } catch (err) {
      console.error('Error fetching receipt shares:', err);
      setError('Failed to load receipt shares');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShares();
  }, [receiptId]);

  const handleCreateShare = async () => {
    setSubmitting(true);
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: process.env.REACT_APP_AUTH0_AUDIENCE,
        },
      });

      await createReceiptShare(receiptId, expiresInDays, token);

      // Reset form and close dialog
      setExpiresInDays(30);
      setCreateDialogOpen(false);

      // Refresh shares list
      await fetchShares();
    } catch (err) {
      console.error('Error creating share:', err);
      setError('Failed to create share link');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyLink = async (shareUrl: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopySnackbarOpen(true);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopySnackbarOpen(true);
    }
  };

  const formatExpirationDate = (expiresAt: string) => {
    const date = new Date(expiresAt);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return 'Expired';
    } else if (diffDays === 0) {
      return 'Expires today';
    } else if (diffDays === 1) {
      return 'Expires tomorrow';
    } else if (diffDays <= 7) {
      return `Expires in ${diffDays} days`;
    } else {
      return `Expires ${date.toLocaleDateString()}`;
    }
  };

  const getExpirationColor = (expiresAt: string) => {
    const date = new Date(expiresAt);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'error';
    if (diffDays <= 3) return 'warning';
    return 'default';
  };

  const handleCloseDialog = () => {
    setCreateDialogOpen(false);
    setExpiresInDays(30);
    setError(null);
  };

  if (loading) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress />
        <Typography mt={2}>Loading share links...</Typography>
      </Paper>
    );
  }

  return (
    <>
      <Paper sx={{ p: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">
            Share Links ({shares.length})
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
            size="small"
          >
            Create Share Link
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {shares.length === 0 ? (
          <Box textAlign="center" py={4}>
            <ShareIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="body1" color="text.secondary" mb={2}>
              No share links created yet
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Create share links to let others view this receipt without signing up
            </Typography>
          </Box>
        ) : (
          <List>
            {shares.map((share) => (
              <ListItem key={share.share_token} divider>
                <ListItemText
                  primaryTypographyProps={{ component: 'div' }}
                  secondaryTypographyProps={{ component: 'div' }}
                  primary={
                    <Box display="flex" alignItems="center" gap={1}>
                      <LinkIcon color="primary" />
                      <Box component="span" sx={{ fontWeight: 'medium' }}>
                        Share Link
                      </Box>
                      <Chip
                        label={formatExpirationDate(share.expiresAt || '')}
                        color={getExpirationColor(share.expiresAt || '')}
                        size="small"
                        icon={<AccessTimeIcon />}
                      />
                      {share.current_uses > 0 && (
                        <Chip
                          label={`${share.current_uses} view${share.current_uses === 1 ? '' : 's'}`}
                          size="small"
                          icon={<VisibilityIcon />}
                          variant="outlined"
                        />
                      )}
                    </Box>
                  }
                  secondary={
                    <Box>
                      <Box sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                        Created {new Date(share.created_at).toLocaleDateString()}
                      </Box>
                      <Box 
                        sx={{ 
                          fontFamily: 'monospace', 
                          fontSize: '0.75rem',
                          wordBreak: 'break-all',
                          mt: 0.5,
                          color: 'text.secondary'
                        }}
                      >
                        {share.shareUrl}
                      </Box>
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <Tooltip title="Copy link">
                    <IconButton 
                      onClick={() => handleCopyLink(share.shareUrl || '')}
                      color="primary"
                    >
                      <CopyIcon />
                    </IconButton>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </Paper>

      {/* Create Share Dialog */}
      <Dialog 
        open={createDialogOpen} 
        onClose={handleCloseDialog}
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            Create Share Link
            <IconButton onClick={handleCloseDialog} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={3} pt={1}>
            <Alert severity="info">
              Share links allow anyone with the URL to view this receipt without signing up. 
              They can see receipt items, members, and validation status.
            </Alert>

            <TextField
              fullWidth
              label="Expires in (days)"
              type="number"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 1)))}
              inputProps={{ min: 1, max: 365 }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><AccessTimeIcon /></InputAdornment>,
              }}
              helperText={`Link will expire on ${new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toLocaleDateString()}`}
            />

            <Alert severity="warning">
              <Typography variant="body2">
                <strong>Security Note:</strong> Anyone with this link can view the receipt. 
                Only share with people you trust.
              </Typography>
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={submitting}>
            Cancel
          </Button>
          <Button 
            onClick={handleCreateShare}
            variant="contained"
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={20} /> : <ShareIcon />}
          >
            {submitting ? 'Creating...' : 'Create Share Link'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Copy Success Snackbar */}
      <Snackbar
        open={copySnackbarOpen}
        autoHideDuration={3000}
        onClose={() => setCopySnackbarOpen(false)}
        message="Share link copied to clipboard"
      />
    </>
  );
};

export default ReceiptSharing;