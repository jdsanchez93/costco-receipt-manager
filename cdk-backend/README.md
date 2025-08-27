# Costco Receipts CDK Backend

A modern, serverless backend for the Costco Receipt Management application, built with AWS CDK and designed to work with **externally managed DynamoDB tables**.

## 🏗️ Architecture

```
Internet → CloudFront → API Gateway → Lambda Functions → External DynamoDB Tables
           ↓
         S3 (Frontend)
```

### Key Components

- **AWS CDK**: Infrastructure as Code using TypeScript
- **API Gateway**: RESTful API with CORS support
- **Lambda Functions**: 13 specialized functions for different operations
- **External DynamoDB**: References tables from another stack/deployment
- **CloudFront**: Global CDN for frontend and API (optional)
- **S3**: Static website hosting for React frontend (optional)
- **Lambda Layer**: Shared dependencies and utilities

## 🔧 **External DynamoDB Integration**

This stack is designed to work with DynamoDB tables created in a separate stack or deployment. It references existing tables by name rather than creating new ones.

### Required Table Structure

Your external DynamoDB tables must have this exact structure:

#### **UserReceipts Table**
```
Primary Key:
- PK (String) - Hash Key
- SK (String) - Range Key

Global Secondary Index (GSI1):
- GSI1PK (String) - Hash Key  
- GSI1SK (String) - Range Key

Entity Patterns:
PK                SK                  Type
USER#user123      RECEIPT#receipt456  Receipt Membership
RECEIPT#receipt456 SHARE#token789     Share Link
```

#### **Items Table**
```
Primary Key:
- PK (String) - Hash Key (RECEIPT#receipt_id)
- SK (String) - Range Key (ITEM#001, ITEM#002, etc.)

Entity Patterns:
PK                SK        Attributes
RECEIPT#receipt456 ITEM#001  item_name, price, discount, assigned_users[]
RECEIPT#receipt456 ITEM#002  item_name, price, discount, assigned_users[]
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- AWS CLI configured with appropriate permissions
- CDK CLI installed: `npm install -g aws-cdk`
- **Existing DynamoDB tables** with the correct structure

### Installation

1. **Clone and setup**:
   ```bash
   cd cdk-backend
   npm install
   cd lambda/layers/shared/nodejs && npm install && cd -
   ```

2. **Configure your environment**:
   
   ```bash
   # Copy the example configuration
   cp cdk.context.example.json cdk.context.json
   
   # Edit cdk.context.json with your actual values
   ```
   
   **Update cdk.context.json**:
   ```json
   {
     "mainTableName": "your-dynamodb-table-name",
     "auth0Domain": "your-auth0-domain.auth0.com",
     "auth0Audience": "your-api-audience",
     "s3UploadApiUrl": "https://your-api.execute-api.region.amazonaws.com/stage/upload-url",
     "s3DownloadApiUrl": "https://your-api.execute-api.region.amazonaws.com/stage/download-url",
     "customDomainName": "your-domain.com",
     "certificateArn": "arn:aws:acm:region:account:certificate/id"
   }
   ```

   **Option B: Use CDK context flags**
   ```bash
   cdk deploy -c userReceiptsTableName=MyUserReceiptsTable -c itemsTableName=MyItemsTable
   ```

   **Option C: Use environment variables**
   ```bash
   export USER_RECEIPTS_TABLE=MyUserReceiptsTable
   export ITEMS_TABLE=MyItemsTable
   cdk deploy
   ```

3. **Deploy**:
   ```bash
   ./scripts/deploy.sh prod
   ```

4. **Deploy frontend** (optional):
   ```bash
   ./scripts/deploy-frontend.sh prod
   ```

## 📋 **Configuration Options**

### Required Props
- `userReceiptsTableName`: Name of your external UserReceipts table
- `itemsTableName`: Name of your external Items table

### Optional Props
- `auth0Domain`: Auth0 tenant domain (default: from context)
- `auth0Audience`: Auth0 API identifier (default: from context)
- `s3UploadApiUrl`: External S3 upload API URL (default: empty)
- `s3DownloadApiUrl`: External S3 download API URL (default: empty)
- `deployFrontend`: Whether to create S3 bucket and CloudFront (default: true)

### Configuration Methods

1. **cdk.context.json** (recommended):
   ```json
   {
     "userReceiptsTableName": "prod-user-receipts",
     "itemsTableName": "prod-items",
     "auth0Domain": "mycorp.auth0.com",
     "auth0Audience": "https://receipts-api.mycorp.com",
     "deployFrontend": true
   }
   ```

2. **CDK Context Flags**:
   ```bash
   cdk deploy \
     -c userReceiptsTableName=prod-user-receipts \
     -c itemsTableName=prod-items \
     -c auth0Domain=mycorp.auth0.com \
     -c deployFrontend=false
   ```

3. **Environment Variables**:
   ```bash
   export USER_RECEIPTS_TABLE=prod-user-receipts
   export ITEMS_TABLE=prod-items
   cdk deploy
   ```

## 🎯 Features

### Implemented Endpoints

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/health` | GET | Health check | ❌ |
| `/api/receipts/user-receipts` | GET | Get user's receipts | ✅ |
| `/api/receipts/get-upload-url` | POST | Get S3 upload URL | ✅ |
| `/api/receipts/get-download-url/{id}` | GET | Get S3 download URL | ✅ |
| `/api/receipts/receipt/{id}/items` | GET | Get receipt items | ✅ |
| `/api/receipts/receipt/{id}/geometry` | GET | Get receipt geometry data | ✅ |
| `/api/receipts/receipt/{id}/items/{itemId}/assignment` | PUT | Update item assignment | ✅ |
| `/api/receipts/receipt/{id}/items/assignments/bulk` | PUT | Bulk update assignments | ✅ |
| `/api/receipts/receipt/{id}/items/assignments/all` | DELETE | Clear all assignments | ✅ |
| `/api/receipts/receipt/{id}/members` | GET/POST | Manage receipt members | ✅ |
| `/api/receipts/receipt/{id}/members/update-details` | PUT | Update member details | ✅ |
| `/api/receipts/receipt/{id}/share` | POST | Create share link | ✅ |
| `/api/receipts/receipt/{id}/shares` | GET | Get share links | ✅ |
| `/api/receipts/shared/{token}` | GET | Get shared receipt | ❌ |
| `/api/receipts/validate/{id}` | POST | Validate receipt | ✅ |

### Lambda Functions

1. **get-user-receipts**: Retrieve user's receipt memberships
2. **get-receipt-items**: Get items for a specific receipt
3. **get-receipt-geometry**: Get geometry data for receipt fields
4. **update-item-assignment**: Handle all item assignment operations
5. **get-receipt-members**: Get members for a receipt
6. **add-receipt-member**: Add new members to receipts
7. **create-receipt-share**: Create shareable links
8. **get-receipt-shares**: List all share links for a receipt
9. **get-shared-receipt**: Public access to shared receipts
10. **get-upload-url**: Generate S3 presigned upload URLs
11. **get-download-url**: Generate S3 presigned download URLs
12. **validate-receipt**: Handle receipt validation
13. **update-member-details**: Update member information

## 📁 Project Structure

```
cdk-backend/
├── bin/
│   └── app.ts                    # CDK app with external table configuration
├── lib/
│   └── costco-receipts-stack.ts  # Main CDK stack (no DynamoDB creation)
├── lambda/
│   ├── layers/shared/nodejs/     # Shared utilities and dependencies
│   └── functions/                # 13 Lambda functions
├── scripts/
│   ├── install-dependencies.sh   # Setup script
│   ├── deploy.sh                # Main deployment with table validation
│   └── deploy-frontend.sh       # Frontend deployment
├── cdk.context.json             # Configuration with table names
└── README.md
```

## 🔐 Authentication & Permissions

### DynamoDB Permissions
The CDK stack automatically grants the following permissions to Lambda functions:

```typescript
// For imported tables
userReceiptsTable.grantReadWriteData(lambdaFunction);
itemsTable.grantReadWriteData(lambdaFunction);

// For GSI access
fn.addToRolePolicy(new iam.PolicyStatement({
  actions: ['dynamodb:Query', 'dynamodb:Scan'],
  resources: [
    `${userReceiptsTable.tableArn}/index/*`,
    `${itemsTable.tableArn}/index/*`
  ],
}));
```

### Cross-Stack/Account Access
If your DynamoDB tables are in a different stack or account, ensure:

1. **Same Account**: CDK will automatically create appropriate IAM policies
2. **Cross-Account**: You'll need to manually configure:
   - Resource-based policies on DynamoDB tables
   - Cross-account role assumptions
   - VPC configurations if needed

## 💰 Cost Optimization

### No DynamoDB Costs in This Stack
Since this stack references external tables, you only pay for:

| Component | Monthly Cost | Free Tier |
|-----------|-------------|-----------|
| **12 Lambda Functions** | $0-2 | 1M requests FREE |
| **API Gateway** | $0-4 | 1M requests FREE |
| **CloudFront** | $0-1 | 1TB + 10M requests FREE |
| **S3** | $0-1 | 5GB FREE |
| **Total** | **$0-5/month** | **Mostly FREE first year** |

Your DynamoDB costs are managed separately in the external stack.

## 🛠️ Development

### Local Development
```bash
# Install dependencies
npm install
./scripts/install-dependencies.sh

# Build TypeScript
npm run build

# Validate configuration
npm run synth

# Deploy to AWS
./scripts/deploy.sh prod

# Deploy only API (no frontend)
cdk deploy -c deployFrontend=false
```

### Testing with External Tables
```bash
# Test health endpoint
curl https://your-api-domain.com/health

# Test authenticated endpoint
curl -H "Authorization: Bearer $JWT_TOKEN" \
     https://your-api-domain.com/api/receipts/user-receipts

# Verify table access
aws dynamodb describe-table --table-name YourMainTable
```

## 🚀 Deployment Strategies

### Multi-Environment Setup
```bash
# Development with different table names
cdk deploy -c userReceiptsTableName=dev-user-receipts \
           -c itemsTableName=dev-items \
           -c deployFrontend=false

# Staging
cdk deploy -c userReceiptsTableName=staging-user-receipts \
           -c itemsTableName=staging-items

# Production
cdk deploy -c userReceiptsTableName=prod-user-receipts \
           -c itemsTableName=prod-items
```

### API-Only Deployment
```bash
# Deploy only Lambda functions and API Gateway
cdk deploy -c deployFrontend=false
```

### Cross-Account Deployment
```bash
# Deploy to different account with external tables
export CDK_DEFAULT_ACCOUNT=123456789012
cdk deploy -c userReceiptsTableName=cross-account-user-receipts \
           -c itemsTableName=cross-account-items
```

## 🔧 Troubleshooting

### Common Issues

1. **Table Access Denied**:
   ```
   Error: User is not authorized to perform: dynamodb:GetItem
   ```
   - Verify table names are correct
   - Check IAM permissions
   - Ensure tables exist in the same region

2. **Table Not Found**:
   ```
   Error: Requested resource not found
   ```
   - Verify table names in configuration
   - Check region settings
   - Confirm tables exist: `aws dynamodb list-tables`

3. **Cross-Stack References**:
   ```
   Error: Cannot read properties of undefined
   ```
   - Use `Table.fromTableName()` instead of direct references
   - Verify exports from the source stack

### Validation Commands
```bash
# Verify table access
aws dynamodb describe-table --table-name YourMainTable
aws dynamodb scan --table-name YourMainTable --limit 1

# Check Lambda permissions
aws iam get-role --role-name CostcoReceiptsStack-GetUserReceiptsFunctionRole*

# Test API endpoints
curl https://your-api.execute-api.us-east-1.amazonaws.com/prod/health
```

## 🔄 Migration from Previous Version

If migrating from a version that created its own DynamoDB table:

1. **Export data** from old table:
   ```bash
   aws dynamodb scan --table-name OldTable > table-backup.json
   ```

2. **Deploy new stack** with external table reference:
   ```bash
   cdk deploy -c mainTableName=NewMainTable
   ```

3. **Import data** to new table (if needed)

4. **Delete old stack** after verification

## 📄 License

This project is part of the Costco Receipt Management application.