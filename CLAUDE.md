# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a full-stack Costco receipt management application with:
- React TypeScript frontend with Material-UI
- **ASP.NET Core 8** backend (Lambda function deployed via AWS CDK)
- AWS DynamoDB single-table design for data storage
- Auth0 for JWT-based authentication
- AWS S3 for receipt image storage
- AWS CloudFront distribution for frontend hosting
- AWS API Gateway for API routing

### Migration Status
The application was recently migrated from Node.js/Express to ASP.NET Core to improve maintainability and leverage .NET's robust ecosystem. The old `backend/` directory contains the legacy Node.js implementation for reference. All new development should focus on the `cdk-backend/` directory.

## Common Development Commands

### Frontend (from /frontend directory)
```bash
npm start          # Start development server on port 3000
npm run build      # Build production bundle
npm test           # Run tests
```

### Backend API (from /cdk-backend/src/CostcoReceipts.Api directory)
```bash
dotnet run         # Start local development server on port 5002
dotnet watch run   # Start with hot reload
dotnet build       # Compile the project
dotnet test        # Run tests
dotnet clean       # Clean build artifacts
```

**For detailed local development setup**, see `cdk-backend/LOCAL_DEV.md` which covers:
- AWS profile configuration and SSO login
- User secrets management
- Swagger UI access (http://localhost:5002/swagger)
- Debugging and troubleshooting

### CDK Infrastructure (from /cdk-backend directory)
```bash
npm install        # Install CDK dependencies
cdk synth          # Synthesize CloudFormation template
cdk deploy         # Deploy to AWS
cdk diff           # Show infrastructure changes
cdk destroy        # Tear down infrastructure
```

## Architecture

### Infrastructure (AWS CDK)
The application is deployed using AWS CDK (`cdk-backend/lib/costco-receipts-stack.ts`):

- **Lambda Function**: Single .NET 8 Lambda running ASP.NET Core API
  - Timeout: 30 seconds
  - Memory: 1024 MB
  - Runtime: .NET 8
  - Bundled using Docker during CDK deployment

- **API Gateway**: REST API with Lambda proxy integration
  - CORS configured for CloudFront origin
  - Binary media types support for images
  - Proxy all routes to single Lambda function

- **CloudFront Distribution**:
  - Serves frontend from S3
  - Routes `/api/*` requests to API Gateway
  - Custom domain support (optional)
  - HTTPS redirect enforced

- **S3 Bucket**: Hosts React frontend build
  - Origin Access Control (OAC) for security
  - Versioned for rollback capability

### Database Schema (DynamoDB Single-Table Design)
The application uses a **single DynamoDB table** (`dev-costco-receipt-parser-main`) with the following access patterns:

**Entity Types:**
- **Receipt Members** (`USER#<user_id>` / `RECEIPT#<receipt_id>`)
  - Stores user's relationship to receipts
  - Attributes: receipt_id, display_name, email, user_type, validation_status, validated_by, validated_at, comments

- **Receipt Items** (`RECEIPT#<receipt_id>` / `ITEM#<item_index>`)
  - Stores individual line items from receipt
  - Attributes: item_number, item_name, price, discount, assigned_users[]

- **Receipt Geometry** (`RECEIPT#<receipt_id>` / `GEOMETRY#<field_name>#<field_type>`)
  - Stores AWS Textract OCR data for validation
  - Attributes: text, confidence, bounding_box, polygon

- **Receipt Shares** (`RECEIPT#<receipt_id>` / `SHARE#<share_token>`)
  - Stores public sharing links
  - Attributes: share_token, owner_user_id, expires_at, is_active, current_uses

**Global Secondary Indexes:**
- GSI1: Allows querying shares by share_token for public access

### API Endpoints

**Upload/Download (authenticated):**
- `POST /api/receipts/get-upload-url` - Get S3 presigned upload URL
- `GET /api/receipts/get-download-url/:receiptId` - Get S3 presigned download URL

**Receipt Data (authenticated):**
- `GET /api/receipts/user-receipts` - Get user's receipts
- `GET /api/receipts/receipt/:receiptId/items` - Get items for a receipt
- `GET /api/receipts/receipt/:receiptId/geometry` - Get Textract OCR geometry data
- `POST /api/receipts/validate/:receiptId` - Validate receipt subtotal

**Receipt Members (authenticated):**
- `GET /api/receipts/receipt/:receiptId/members` - Get receipt members
- `POST /api/receipts/receipt/:receiptId/members` - Add member to receipt
- `PUT /api/receipts/receipt/:receiptId/members/update-details` - Update member details

**Receipt Sharing (authenticated):**
- `POST /api/receipts/receipt/:receiptId/share` - Create shareable link
- `GET /api/receipts/receipt/:receiptId/shares` - Get receipt shares

**Public Sharing (no auth):**
- `GET /api/receipts/shared/:shareToken` - Access shared receipt publicly

**Item Assignments (authenticated):**
- `PUT /api/receipts/receipt/:receiptId/items/:itemId/assignment` - Update item assignment
- `PUT /api/receipts/receipt/:receiptId/items/assignments/bulk` - Bulk update assignments
- `DELETE /api/receipts/receipt/:receiptId/items/assignments/all` - Clear all assignments

### Authentication Flow
1. Frontend uses Auth0 React SDK for authentication
2. Backend validates JWT tokens using ASP.NET Core Auth0 middleware
3. All API endpoints (except `/shared/:shareToken`) require valid Auth0 JWT token
4. User identity extracted from JWT `sub` claim

## Environment Configuration

### Frontend (.env)
- `REACT_APP_AUTH0_DOMAIN` - Auth0 tenant domain
- `REACT_APP_AUTH0_CLIENT_ID` - Auth0 application client ID
- `REACT_APP_AUTH0_REDIRECT_URI` - OAuth callback URL
- `REACT_APP_API_BASE_URL` - Backend API URL (http://localhost:5002 for local dev)
- `REACT_APP_AUTH0_AUDIENCE` - Auth0 API identifier

### ASP.NET Core Backend Configuration

The backend uses a **layered configuration** approach:
1. `appsettings.json` - Base configuration
2. `appsettings.Development.json` - Development overrides
3. **User Secrets** - Sensitive data (local development only)
4. **Environment Variables** - Lambda/production configuration

**Configuration Values:**
- `AUTH0_DOMAIN` - Auth0 tenant domain
- `AUTH0_AUDIENCE` - Auth0 API identifier
- `AWS:Profile` - AWS CLI profile (local dev only)
- `AWS:Region` - AWS region (default: us-east-1)
- `DYNAMODB_TABLE_MAIN` - Single DynamoDB table name
- `S3_UPLOAD_API_URL` - External S3 upload API endpoint
- `S3_DOWNLOAD_API_URL` - External S3 download API endpoint
- `CLOUDFRONT_DOMAIN` - Custom domain for frontend (optional)
- `Cors:AllowedOrigins` - Array of allowed CORS origins

**Local Development:**
See `cdk-backend/LOCAL_DEV.md` for setting up user secrets and AWS credentials.

## JSON Serialization Strategy

The application uses **separate naming conventions** for the API layer and DynamoDB storage:

### API Layer (camelCase)
- **All API responses** use default ASP.NET Core camelCase serialization
- C# PascalCase properties automatically serialize to camelCase (e.g., `ReceiptId` → `receiptId`)
- Frontend TypeScript interfaces use camelCase to match

**Example API Response:**
```json
{
  "receiptId": "abc123",
  "createdAt": "2024-01-01T00:00:00Z",
  "validationStatus": "confirmed",
  "validatedAt": "2024-01-02T00:00:00Z"
}
```

### DynamoDB Layer (snake_case)
- DynamoDB attributes use `snake_case` naming via `[DynamoDBProperty("snake_case")]` attributes
- This is configured per-property in `DynamoDbModels.cs`
- The `SingleTableService._jsonOptions` uses `SnakeCaseLower` for DynamoDB writes only
- PK/SK keys remain uppercase as stored in the table

**Example Model Property:**
```csharp
[DynamoDBProperty("receipt_id")]
public string ReceiptId { get; set; }
```

## Key Features
1. Drag-and-drop receipt upload with react-dropzone
2. Receipt validation with AWS Textract OCR data visualization
3. Multi-user receipt sharing with assignment tracking
4. Public shareable links with expiration
5. Receipt subtotal validation workflow
6. Individual receipt detail pages with items table and receipt image viewing
7. Receipt image display with fullscreen modal view
8. React Router navigation between receipts list and detail views
9. Material-UI DataGrid for displaying data
10. Integration with external S3 upload/download APIs using JWT passthrough
11. JWT-based authentication with Auth0
12. DynamoDB single-table design for scalable data storage

## UI Structure
- **Dashboard** (`/`): Main receipts table with upload functionality
- **Receipt Details** (`/receipt/:receiptId`): Individual receipt view with receipt image, metadata, and items table
- **Receipt Image Display**: Embedded image with fullscreen modal view
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
The ASP.NET Core backend includes Auth0 logging middleware in development mode (`Auth0LoggingMiddleware.cs`):

**To debug Auth0 issues:**
1. Check console for Auth0 configuration on startup
2. Review logged token details for each authenticated request
3. Verify `AUTH0_DOMAIN` and `AUTH0_AUDIENCE` are set correctly
4. Ensure frontend and backend use the same Auth0 tenant and audience
5. Confirm JWT tokens include "Bearer " prefix in Authorization header

**Common Auth0 Setup Issues:**
- **401 Unauthorized**: Check that Auth0 audience matches between frontend and backend
- **Missing claims**: Verify Auth0 API settings include user metadata in access token
- **Token expired**: Frontend should automatically refresh tokens using Auth0 SDK
- **CORS errors with auth**: Ensure preflight OPTIONS requests don't require authentication

**Local Development:**
Run `dotnet user-secrets list` to verify Auth0 secrets are configured properly.

### AWS Credentials Issues

**Local Development:**
- Ensure AWS CLI profile is configured: `aws configure --profile <profile-name>`
- For SSO profiles: Run `aws sso login --profile <profile-name>` before starting the API
- Verify profile name matches `AWS:Profile` in user secrets

**Lambda Deployment:**
- Lambda uses IAM role - no credentials needed
- Verify Lambda execution role has DynamoDB and S3 permissions
- Check CloudWatch logs for permission errors

### DynamoDB Access Errors

**Verify table access:**
```bash
aws dynamodb describe-table --table-name dev-costco-receipt-parser-main --profile <profile-name>
```

**Common issues:**
- Table name mismatch in configuration
- Insufficient IAM permissions
- AWS region mismatch (default: us-east-1)

### CORS Issues

**Local Development (localhost:3000):**
- Frontend runs on port 3000, backend on port 5002
- CORS is configured in `appsettings.Development.json`
- Both ports must be whitelisted

**Production (CloudFront):**
- CORS configured via `Cors:AllowedOrigins` environment variable array
- Set in CDK stack: `Cors__AllowedOrigins__0=https://your-domain.com`
- API Gateway has separate CORS preflight configuration

### JSON Serialization Issues

If the frontend receives unexpected field names:
1. Verify API responses use camelCase (default ASP.NET Core behavior)
2. Check frontend TypeScript interfaces match camelCase naming
3. Use browser DevTools Network tab to inspect actual API responses
4. For DynamoDB issues, verify `[DynamoDBProperty("snake_case")]` attributes are set correctly in `DynamoDbModels.cs`

### Build and Deployment Issues

**CDK Deployment Failures:**
- Ensure .NET 8 SDK is installed: `dotnet --version`
- Clean build artifacts: `cd cdk-backend/src/CostcoReceipts.Api && dotnet clean`
- Check CDK stack parameters are set correctly
- Review CloudFormation events in AWS console

**Lambda Cold Start:**
- First request after deployment may take 5-10 seconds
- Subsequent requests should be fast (< 1 second)
- Consider provisioned concurrency for production

## Deployment Notes

### Infrastructure as Code (CDK)
The application is deployed using **AWS CDK** (`cdk-backend/lib/costco-receipts-stack.ts`):

```bash
cd cdk-backend
npm install
cdk deploy --context auth0Domain=<domain> --context auth0Audience=<audience>
```

### Architecture Components

**Backend (Lambda):**
- Runtime: .NET 8 (`DOTNET_8`)
- Handler: `CostcoReceipts.Api` (ASP.NET Core Lambda)
- Bundling: Uses Docker to compile and package during `cdk deploy`
- Memory: 1024 MB
- Timeout: 30 seconds
- Environment variables set via CDK stack

**Frontend (S3 + CloudFront):**
1. Build React app: `cd frontend && npm run build`
2. Upload to S3: `aws s3 sync build/ s3://<frontend-bucket-name>/`
3. Invalidate CloudFront cache: `aws cloudfront create-invalidation --distribution-id <id> --paths "/*"`

**Database:**
- DynamoDB table must exist before deployment (not created by this stack)
- Table name passed as stack parameter: `mainTableName`
- Uses single-table design with GSI for share token lookups

### CDK Stack Parameters

Required:
- `mainTableName` - Existing DynamoDB table name

Optional (via context):
- `auth0Domain` - Auth0 tenant domain
- `auth0Audience` - Auth0 API audience
- `s3UploadApiUrl` - External S3 upload API endpoint
- `s3DownloadApiUrl` - External S3 download API endpoint
- `customDomainName` - Custom domain for CloudFront
- `certificateArn` - ACM certificate ARN (must be in us-east-1)

### Deployment Checklist

1. ✅ .NET 8 SDK installed
2. ✅ AWS CDK CLI installed (`npm install -g aws-cdk`)
3. ✅ AWS credentials configured
4. ✅ DynamoDB table exists
5. ✅ Auth0 application configured
6. ✅ External S3 upload/download APIs deployed
7. ✅ (Optional) ACM certificate created in us-east-1 for custom domain

### Monitoring

- **Lambda Logs**: CloudWatch Logs `/aws/lambda/<function-name>`
- **API Gateway Logs**: Enable execution and access logging in API Gateway settings
- **CloudFront Logs**: Optional S3 access logs
- **DynamoDB Metrics**: Monitor read/write capacity and throttling

### Rolling Back

```bash
# Revert to previous version
cdk deploy --rollback

# Or completely tear down
cdk destroy
```