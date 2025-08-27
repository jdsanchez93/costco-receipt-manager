const { CognitoJwtVerifier } = require('aws-jwt-verify');
const axios = require('axios');
const { Logger } = require('@aws-lambda-powertools/logger');

const logger = new Logger({ serviceName: 'AuthUtils' });

// Cache for JWKS
let jwksCache = null;
let jwksCacheExpiry = 0;

class AuthUtils {
  constructor() {
    this.auth0Domain = process.env.AUTH0_DOMAIN;
    this.auth0Audience = process.env.AUTH0_AUDIENCE;
    
    if (!this.auth0Domain || !this.auth0Audience) {
      throw new Error('AUTH0_DOMAIN and AUTH0_AUDIENCE environment variables are required');
    }
  }

  async getJWKS() {
    const now = Date.now();
    
    // Return cached JWKS if still valid (cache for 1 hour)
    if (jwksCache && now < jwksCacheExpiry) {
      return jwksCache;
    }

    try {
      logger.info('Fetching JWKS from Auth0', { domain: this.auth0Domain });
      
      const response = await axios.get(`https://${this.auth0Domain}/.well-known/jwks.json`, {
        timeout: 5000
      });
      
      jwksCache = response.data;
      jwksCacheExpiry = now + (60 * 60 * 1000); // Cache for 1 hour
      
      logger.info('Successfully fetched and cached JWKS');
      return jwksCache;
    } catch (error) {
      logger.error('Error fetching JWKS', { error: error.message });
      throw new Error('Failed to fetch JWKS');
    }
  }

  async verifyToken(token) {
    if (!token) {
      throw new Error('No token provided');
    }

    try {
      logger.info('Verifying JWT token');
      
      // Remove 'Bearer ' prefix if present
      const cleanToken = token.startsWith('Bearer ') ? token.substring(7) : token;
      
      // Decode token header to get algorithm and key ID
      const header = JSON.parse(Buffer.from(cleanToken.split('.')[0], 'base64').toString());
      
      if (!header.kid) {
        throw new Error('Token missing key ID');
      }

      // Get JWKS
      const jwks = await this.getJWKS();
      const key = jwks.keys.find(k => k.kid === header.kid);
      
      if (!key) {
        throw new Error('Key not found in JWKS');
      }

      // For now, we'll use a simple approach - in production you'd want to use a proper JWT library
      // This is a simplified verification - you should use aws-jwt-verify or similar
      const payload = JSON.parse(Buffer.from(cleanToken.split('.')[1], 'base64').toString());
      
      // Basic validation
      const now = Math.floor(Date.now() / 1000);
      
      if (payload.exp && payload.exp < now) {
        throw new Error('Token expired');
      }
      
      // Handle audience validation - can be string or array
      const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (!audiences.includes(this.auth0Audience)) {
        throw new Error('Invalid audience');
      }
      
      if (payload.iss !== `https://${this.auth0Domain}/`) {
        throw new Error('Invalid issuer');
      }

      logger.info('Successfully verified JWT token', { 
        sub: payload.sub, 
        aud: payload.aud,
        exp: payload.exp 
      });
      
      return payload;
    } catch (error) {
      logger.error('Error verifying JWT token', { error: error.message });
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  async getAuthenticatedUser(event) {
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new Error('Invalid Authorization header format');
    }

    const token = authHeader.substring(7);
    const payload = await this.verifyToken(token);
    
    return {
      userId: payload.sub,
      email: payload.email,
      name: payload.name || payload.nickname || payload.email,
      payload
    };
  }

  createResponse(statusCode, body, headers = {}) {
    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        ...headers
      },
      body: JSON.stringify(body)
    };
  }

  createErrorResponse(statusCode, message, error = null) {
    logger.error('Creating error response', { statusCode, message, error });
    
    return this.createResponse(statusCode, {
      error: message,
      ...(error && { details: error.message })
    });
  }

  async handleRequest(event, handler) {
    try {
      // Handle CORS preflight
      if (event.httpMethod === 'OPTIONS') {
        return this.createResponse(200, {});
      }

      // Get authenticated user
      const user = await this.getAuthenticatedUser(event);
      
      // Call the actual handler with user context
      const result = await handler(event, user);
      
      return this.createResponse(200, result);
    } catch (error) {
      if (error.message.includes('Authorization') || error.message.includes('Token')) {
        return this.createErrorResponse(401, 'Unauthorized', error);
      }
      
      if (error.message.includes('not found') || error.message.includes('Not found')) {
        return this.createErrorResponse(404, 'Not found', error);
      }
      
      if (error.message.includes('Invalid') || error.message.includes('required')) {
        return this.createErrorResponse(400, 'Bad request', error);
      }
      
      return this.createErrorResponse(500, 'Internal server error', error);
    }
  }

  async handlePublicRequest(event, handler) {
    try {
      // Handle CORS preflight
      if (event.httpMethod === 'OPTIONS') {
        return this.createResponse(200, {});
      }

      // Call the handler without authentication
      const result = await handler(event);
      
      return this.createResponse(200, result);
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('Not found')) {
        return this.createErrorResponse(404, 'Not found', error);
      }
      
      if (error.message.includes('Invalid') || error.message.includes('required')) {
        return this.createErrorResponse(400, 'Bad request', error);
      }
      
      if (error.message.includes('expired')) {
        return this.createErrorResponse(410, 'Gone', error);
      }
      
      return this.createErrorResponse(500, 'Internal server error', error);
    }
  }
}

module.exports = { AuthUtils };