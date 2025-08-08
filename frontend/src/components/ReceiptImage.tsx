import React, { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { 
  Box, 
  Paper, 
  CircularProgress, 
  Alert, 
  IconButton,
  Dialog,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import CloseIcon from '@mui/icons-material/Close';
import { getReceiptDownloadUrl } from '../services/api';

interface ReceiptImageProps {
  receiptId: string;
}

const ReceiptImage: React.FC<ReceiptImageProps> = ({ receiptId }) => {
  const { getAccessTokenSilently } = useAuth0();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  useEffect(() => {
    const fetchImageUrl = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const token = await getAccessTokenSilently({
          authorizationParams: {
            audience: process.env.REACT_APP_AUTH0_AUDIENCE,
          },
        });

        const { downloadUrl } = await getReceiptDownloadUrl(receiptId, token);
        setImageUrl(downloadUrl);
      } catch (err) {
        console.error('Error fetching receipt image:', err);
        setError('Failed to load receipt image');
      } finally {
        setLoading(false);
      }
    };

    if (receiptId) {
      fetchImageUrl();
    }
  }, [receiptId, getAccessTokenSilently]);

  const handleFullscreenOpen = () => {
    setFullscreenOpen(true);
  };

  const handleFullscreenClose = () => {
    setFullscreenOpen(false);
  };

  if (loading) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress />
        <Box mt={2}>Loading receipt image...</Box>
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
        <Alert severity="info">No receipt image available</Alert>
      </Paper>
    );
  }

  return (
    <>
      <Paper sx={{ p: 2, position: 'relative' }}>
        <Box sx={{ position: 'relative', display: 'inline-block' }}>
          <img
            src={imageUrl}
            alt="Receipt"
            style={{
              maxWidth: '100%',
              height: 'auto',
              maxHeight: '400px',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
            onClick={handleFullscreenOpen}
          />
          <IconButton
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              color: 'white',
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
              },
            }}
            onClick={handleFullscreenOpen}
          >
            <FullscreenIcon />
          </IconButton>
        </Box>
      </Paper>

      <Dialog
        open={fullscreenOpen}
        onClose={handleFullscreenClose}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Receipt Image
          <IconButton onClick={handleFullscreenClose}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <img
            src={imageUrl}
            alt="Receipt"
            style={{
              width: '100%',
              height: 'auto',
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ReceiptImage;