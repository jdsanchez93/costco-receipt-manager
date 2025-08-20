import { Request, Response, NextFunction } from 'express';
import { expressjwt } from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import dotenv from 'dotenv';

dotenv.config();

// Validate Auth0 configuration on startup
if (!process.env.AUTH0_DOMAIN || !process.env.AUTH0_AUDIENCE) {
  console.warn('Auth0 not fully configured - authentication will be skipped');
}

// Simplified logging middleware for authentication debugging
export const logTokenDetails = (req: Request, res: Response, next: NextFunction) => {
  // Only log in development and for auth failures
  if (process.env.NODE_ENV === 'development' && !req.headers.authorization) {
    console.warn(`No auth header for ${req.method} ${req.originalUrl}`);
  }
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
      next();
    };

export const handleAuthError = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.name === 'UnauthorizedError') {
    console.error(`Auth error on ${req.method} ${req.originalUrl}: ${err.message}`);
    
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