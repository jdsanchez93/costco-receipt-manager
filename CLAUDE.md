# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a full-stack Costco receipt management application with:
- React TypeScript frontend with Material-UI
- Node.js/Express TypeScript backend
- AWS DynamoDB for data storage
- Auth0 for authentication
- AWS S3 for receipt image storage (to be configured)
- Docker containerization for AWS deployment

## Common Development Commands

### Frontend (from /frontend directory)
```bash
npm start          # Start development server on port 3000
npm run build      # Build production bundle
npm test           # Run tests
```

### Backend (from /backend directory)
```bash
npm run dev        # Start development server with nodemon on port 5000
npm run build      # Compile TypeScript to JavaScript
npm start          # Run production server
```

### Docker Commands (from root directory)
```bash
docker-compose up --build    # Build and run both services
docker build -f Dockerfile.frontend -t costco-frontend .
docker build -f Dockerfile.backend -t costco-backend .
```

## Architecture

### Database Schema (DynamoDB)
- **UserReceipts Table**: Stores receipt metadata
  - PK: `USER#user_id`
  - SK: `RECEIPT#receipt_id`
  - Attributes: status, created_at, fileName, fileUrl, totalAmount, receiptDate

- **ReceiptItems Table**: Stores individual receipt items
  - PK: Primary key for items
  - SK: Sort key for items
  - Attributes: item_number, item_name, price, discount, receipt_id, assigned_users

### API Endpoints
- `POST /api/receipts/get-upload-url` - Get S3 presigned upload URL
- `POST /api/receipts/upload` - Upload receipt image (legacy endpoint)
- `GET /api/receipts/user-receipts` - Get user's receipts
- `GET /api/receipts/receipt/:receiptId/items` - Get items for a specific receipt
- `GET /api/receipts/items` - Get all items for authenticated user

### Authentication Flow
1. Frontend uses Auth0 React SDK for authentication
2. Backend validates JWT tokens using express-jwt and jwks-rsa
3. All API endpoints require valid Auth0 token

## Environment Configuration

### Frontend (.env)
- REACT_APP_AUTH0_DOMAIN
- REACT_APP_AUTH0_CLIENT_ID
- REACT_APP_AUTH0_REDIRECT_URI
- REACT_APP_API_BASE_URL
- REACT_APP_AUTH0_AUDIENCE

### Backend (.env)
- PORT
- AUTH0_DOMAIN
- AUTH0_AUDIENCE
- AWS_REGION
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- DYNAMODB_TABLE_USER_RECEIPTS
- DYNAMODB_TABLE_ITEMS
- S3_UPLOAD_API_URL

## Key Features
1. Drag-and-drop receipt upload with react-dropzone
2. Receipts table showing all user receipts with status and metadata
3. Individual receipt detail pages with items table
4. React Router navigation between receipts list and detail views
5. Material-UI DataGrid for displaying data
6. Integration with external S3 upload API using JWT passthrough
7. JWT-based authentication with Auth0
8. DynamoDB integration for scalable data storage

## UI Structure
- **Dashboard** (`/`): Main receipts table with upload functionality
- **Receipt Details** (`/receipt/:receiptId`): Individual receipt view with items table
- Navigation between views using React Router
- Responsive Material-UI components

## S3 Upload Integration
The application integrates with an external API Gateway endpoint for S3 uploads:

1. **Two-step upload process**:
   - Frontend calls `/api/receipts/get-upload-url` (no body required)
   - Backend forwards JWT to external API Gateway to get presigned S3 URL
   - Frontend uploads directly to S3 using presigned URL

2. **External API Gateway Requirements**:
   - POST request to 'upload-url' endpoint with optional content_type in body
   - Must use same Auth0 domain/audience for JWT validation  
   - Should return `{ upload_url, receipt_id, expires_in }` response format
   - Configured via `S3_UPLOAD_API_URL` environment variable

3. **Request Format**:
   ```json
   {
     "content_type": "image/jpeg"
   }
   ```
   (content_type is optional, defaults to image/jpeg if not provided)

4. **Response Format**:
   ```json
   {
     "upload_url": "presigned S3 URL", 
     "receipt_id": "generated receipt ID",
     "expires_in": 3600
   }
   ```

## Troubleshooting

### Auth0 Issues
The backend includes comprehensive logging for Auth0 authentication issues:

1. **Configuration Logging**: On startup, the backend logs whether Auth0 environment variables are set
2. **Token Debugging**: Each authenticated request logs detailed token information including:
   - Authorization header presence and format
   - Token length and preview
   - Decoded JWT header and payload (audience, issuer, expiration, subject)
3. **Error Logging**: Auth errors include detailed error messages, codes, and request context

To debug Auth0 issues:
1. Check backend console for "Auth0 Configuration" logs on startup
2. Look for "Token Debug Info" logs for each request
3. Review "Auth0 Error Details" for specific authentication failures

### Common Auth0 Setup Issues
- Ensure AUTH0_DOMAIN and AUTH0_AUDIENCE are correctly set in backend/.env
- Verify frontend Auth0 configuration matches backend
- Check that Auth0 API identifier (audience) is correctly configured
- Ensure JWT tokens are being sent with "Bearer " prefix

### CORS Issues
The backend uses simple CORS configuration allowing localhost:3000. If experiencing CORS issues:
1. Verify frontend is running on port 3000
2. Check that requests include proper headers
3. Review browser developer tools for specific CORS error messages

## Deployment Notes
- Application is containerized for AWS ECS/Fargate deployment
- Frontend served via Nginx
- Backend runs on Node.js
- Ensure AWS credentials are properly configured for DynamoDB access
- S3 bucket needs to be configured for receipt image storage