import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Auth0Provider } from '@auth0/auth0-react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Dashboard from './components/Dashboard';
import Receipt from './components/Receipt';
import SharedReceipt from './components/SharedReceipt';
import ProtectedRoute from './components/ProtectedRoute';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#66B2FF', // Lighter blue for dark theme
    },
    secondary: {
      main: '#FF6B6B', // Lighter red for dark theme
    },
    background: {
      default: '#121212',
      paper: '#1E1E1E',
    },
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(255, 255, 255, 0.7)',
    },
  },
  components: {
    // Customize components for better dark theme experience
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#1E1E1E',
          borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(255, 255, 255, 0.12)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none', // Remove uppercase transformation
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          '&.MuiChip-colorDefault': {
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            color: 'rgba(255, 255, 255, 0.87)',
          },
        },
      },
    },
  },
});

function App() {
  const domain = process.env.REACT_APP_AUTH0_DOMAIN || '';
  const clientId = process.env.REACT_APP_AUTH0_CLIENT_ID || '';
  const redirectUri = process.env.REACT_APP_AUTH0_REDIRECT_URI || window.location.origin;
  const audience = process.env.REACT_APP_AUTH0_AUDIENCE;

  return (
    <Router>
      <Auth0Provider
        domain={domain}
        clientId={clientId}
        authorizationParams={{
          redirect_uri: redirectUri,
          audience: audience,
        }}
      >
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/receipt/:receiptId" element={
              <ProtectedRoute>
                <Receipt />
              </ProtectedRoute>
            } />
            <Route path="/shared-receipt/:shareToken" element={<SharedReceipt />} />
          </Routes>
        </ThemeProvider>
      </Auth0Provider>
    </Router>
  );
}

export default App;
