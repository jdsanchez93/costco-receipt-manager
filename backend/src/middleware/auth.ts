import { Request, Response, NextFunction } from 'express';
import { expressjwt } from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import dotenv from 'dotenv';

dotenv.config();

// Log Auth0 configuration on startup
console.log('Auth0 Configuration:');
console.log('AUTH0_DOMAIN:', process.env.AUTH0_DOMAIN ? 'SET' : 'NOT SET');
console.log('AUTH0_AUDIENCE:', process.env.AUTH0_AUDIENCE ? 'SET' : 'NOT SET');

if (process.env.AUTH0_DOMAIN && process.env.AUTH0_AUDIENCE) {
  console.log('JWKS URI:', `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`);
  console.log('Issuer:', `https://${process.env.AUTH0_DOMAIN}/`);
}

// Custom logging middleware for debugging tokens
export const logTokenDetails = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  console.log('=== Token Debug Info ===');
  console.log('Request URL:', req.method, req.originalUrl);
  console.log('Authorization header present:', !!authHeader);
  
  if (authHeader) {
    console.log('Authorization header format:', authHeader.startsWith('Bearer ') ? 'Valid Bearer format' : 'Invalid format');
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      console.log('Token length:', token.length);
      console.log('Token preview:', token.substring(0, 50) + '...');
      
      // Decode JWT header (without verification for debugging)
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          console.log('Token header:', header);
          console.log('Token payload (aud, iss, exp):', {
            aud: payload.aud,
            iss: payload.iss,
            exp: payload.exp,
            sub: payload.sub ? 'present' : 'missing'
          });
        }
      } catch (error: any) {
        console.log('Error decoding token:', error.message);
      }
    }
  } else {
    console.log('No authorization header found');
  }
  console.log('========================');
  
  next();
};

// Create a conditional auth middleware
export const checkJwt = process.env.AUTH0_DOMAIN && process.env.AUTH0_AUDIENCE 
  ? expressjwt({
      secret: jwksRsa.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
      }) as any,
      audience: process.env.AUTH0_AUDIENCE,
      issuer: `https://${process.env.AUTH0_DOMAIN}/`,
      algorithms: ['RS256'],
    })
  : (req: Request, res: Response, next: NextFunction) => {
      console.warn('Auth0 not configured - skipping authentication');
      next();
    };

export const handleAuthError = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.name === 'UnauthorizedError') {
    console.error('=== Auth0 Error Details ===');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);
    console.error('Request URL:', req.method, req.originalUrl);
    console.error('Authorization header:', req.headers.authorization ? 'Present' : 'Missing');
    
    if (err.inner) {
      console.error('Inner error:', err.inner);
    }
    
    console.error('===========================');
    
    res.status(401).json({ 
      error: 'Invalid token',
      details: process.env.NODE_ENV === 'development' ? {
        message: err.message,
        code: err.code
      } : undefined
    });
  } else {
    console.error('Non-auth error:', err);
    next(err);
  }
};