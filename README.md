# Costco Receipt Manager

A full-stack web application for managing Costco receipts with item tracking and user assignment features.

## Features

- 🔐 Secure authentication with Auth0
- 📸 Drag-and-drop receipt upload
- 📊 Item tracking with detailed table view
- 👥 User assignment for receipt items
- ☁️ AWS DynamoDB for scalable storage
- 🐳 Docker containerization for easy deployment

## Prerequisites

- Node.js 18+
- AWS Account with DynamoDB access
- Auth0 Account
- Docker (for containerized deployment)

## Setup Instructions

### 1. Clone the repository

```bash
git clone <repository-url>
cd claude-costco-webapp
```

### 2. Configure Auth0

1. Create an Auth0 application (Single Page Application)
2. Create an Auth0 API
3. Note down the Domain, Client ID, and API Identifier

### 3. Set up AWS DynamoDB Tables

Create two DynamoDB tables:

**costco-user-receipts**
- Partition Key: PK (String)
- Sort Key: SK (String)

**costco-receipt-items**
- Partition Key: PK (String)  
- Sort Key: SK (String)

### 4. Configure Environment Variables

#### Frontend
```bash
cd frontend
cp .env.example .env
# Edit .env with your Auth0 and API configuration
```

#### Backend
```bash
cd backend
cp .env.example .env
# Edit .env with your Auth0, AWS, and DynamoDB configuration
```

### 5. Install Dependencies

```bash
# Frontend
cd frontend
npm install

# Backend
cd ../backend
npm install
```

### 6. Run Development Servers

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm start
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

## Docker Deployment

### Build and run with Docker Compose

```bash
# From root directory
docker-compose up --build
```

### Build individual containers

```bash
# Frontend
docker build -f Dockerfile.frontend -t costco-frontend .

# Backend
docker build -f Dockerfile.backend -t costco-backend .
```

## AWS Deployment

1. Push Docker images to Amazon ECR
2. Create ECS Task Definitions for frontend and backend
3. Deploy to ECS Fargate or EC2
4. Configure Application Load Balancer
5. Set up Route 53 for domain management

## Project Structure

```
claude-costco-webapp/
├── frontend/                 # React TypeScript frontend
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── services/        # API services
│   │   └── App.tsx          # Main app component
│   └── package.json
├── backend/                  # Node.js Express backend
│   ├── src/
│   │   ├── config/          # Configuration files
│   │   ├── controllers/     # Route controllers
│   │   ├── middleware/      # Express middleware
│   │   ├── models/          # Data models
│   │   ├── routes/          # API routes
│   │   └── index.ts         # Server entry point
│   └── package.json
├── docker-compose.yml        # Docker Compose configuration
├── Dockerfile.frontend       # Frontend Docker configuration
├── Dockerfile.backend        # Backend Docker configuration
└── nginx.conf               # Nginx configuration for frontend
```

## API Endpoints

- `POST /api/receipts/upload` - Upload a receipt image
- `GET /api/receipts/user-receipts` - Get user's receipts
- `GET /api/receipts/receipt/:receiptId/items` - Get items for a specific receipt
- `GET /api/receipts/items` - Get all items for the authenticated user

## Technologies Used

- **Frontend**: React, TypeScript, Material-UI, Auth0 React SDK
- **Backend**: Node.js, Express, TypeScript, AWS SDK
- **Database**: AWS DynamoDB
- **Authentication**: Auth0
- **Deployment**: Docker, AWS ECS/Fargate
- **Image Processing**: Sharp

## License

MIT