import React, { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import {
  Container,
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  CircularProgress,
  Alert,
} from '@mui/material';
import LoginButton from './LoginButton';
import LogoutButton from './LogoutButton';
import ReceiptUpload from './ReceiptUpload';
import ItemsTable from './ItemsTable';
import { getItems } from '../services/api';

const Dashboard: React.FC = () => {
  const { isAuthenticated, isLoading, getAccessTokenSilently } = useAuth0();
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = async () => {
    if (!isAuthenticated) return;
    
    setLoadingItems(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: process.env.REACT_APP_AUTH0_AUDIENCE,
        },
      });
      console.log('Token obtained:', token ? 'Yes' : 'No');
      const data = await getItems(token);
      setItems(data);
    } catch (err) {
      console.error('Error fetching items:', err);
      setError('Failed to load items');
    } finally {
      setLoadingItems(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchItems();
    }
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Costco Receipt Manager
          </Typography>
          {isAuthenticated ? <LogoutButton /> : <LoginButton />}
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4 }}>
        {!isAuthenticated ? (
          <Box textAlign="center" py={8}>
            <Typography variant="h4" gutterBottom>
              Welcome to Costco Receipt Manager
            </Typography>
            <Typography variant="body1" color="text.secondary" mb={3}>
              Please log in to manage your receipts and view items
            </Typography>
            <LoginButton />
          </Box>
        ) : (
          <>
            <Box mb={4}>
              <Typography variant="h4" gutterBottom>
                Receipt Management
              </Typography>
              <ReceiptUpload onUploadSuccess={fetchItems} />
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Box>
              <Typography variant="h5" gutterBottom>
                All Receipt Items
              </Typography>
              {loadingItems ? (
                <Box display="flex" justifyContent="center" py={4}>
                  <CircularProgress />
                </Box>
              ) : (
                <ItemsTable items={items} />
              )}
            </Box>
          </>
        )}
      </Container>
    </>
  );
};

export default Dashboard;