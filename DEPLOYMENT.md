# Poker Website - Cloud Run Deployment Guide

This guide will help you deploy your poker website to Google Cloud Run.

## Prerequisites

1. **Google Cloud Account**: You need a Google Cloud account with billing enabled
2. **Google Cloud SDK**: Install the Google Cloud CLI
3. **Docker**: Install Docker Desktop or Docker Engine
4. **Node.js**: Version 16 or higher (for local development)

## Setup Steps

### 1. Install Google Cloud SDK

Download and install from: https://cloud.google.com/sdk/docs/install

### 2. Authenticate with Google Cloud

```bash
gcloud auth login
gcloud auth application-default login
```

### 3. Create a Google Cloud Project

```bash
# Create a new project (replace with your desired project ID)
gcloud projects create your-poker-project-id

# Set the project as default
gcloud config set project your-poker-project-id
```

### 4. Enable Required APIs

```bash
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

## Database Setup (Recommended: Cloud SQL)

### Option A: Cloud SQL (Recommended for Production)

1. **Create a Cloud SQL instance**:
```bash
gcloud sql instances create poker-db \
    --database-version=POSTGRES_14 \
    --tier=db-f1-micro \
    --region=us-central1 \
    --root-password=your-root-password
```

2. **Create a database**:
```bash
gcloud sql databases create pokerdb --instance=poker-db
```

3. **Create a user**:
```bash
gcloud sql users create pokeruser \
    --instance=poker-db \
    --password=your-user-password
```

### Option B: Local Database (Development Only)

For development, you can use a local PostgreSQL database.

## Environment Variables

Create a `.env` file for local development:

```env
# Database Configuration
DB_USER=pokeruser
DB_HOST=your-cloud-sql-connection-name
DB_NAME=pokerdb
DB_PASSWORD=your-user-password
DB_PORT=5432

# Session Configuration
SESSION_SECRET=your-super-secret-session-key

# Application Configuration
NODE_ENV=production
FRONTEND_URL=https://your-service-url.run.app
```

## Deployment Options

### Option 1: Using the Deployment Script (Recommended)

1. **Update the project ID** in `deploy.sh`:
```bash
PROJECT_ID="your-actual-project-id"
```

2. **Make the script executable**:
```bash
chmod +x deploy.sh
```

3. **Run the deployment**:
```bash
./deploy.sh
```

### Option 2: Manual Deployment

1. **Build and push the Docker image**:
```bash
# Set your project ID
export PROJECT_ID="your-project-id"

# Build the image
docker build -t gcr.io/$PROJECT_ID/poker-website .

# Push to Container Registry
docker push gcr.io/$PROJECT_ID/poker-website
```

2. **Deploy to Cloud Run**:
```bash
gcloud run deploy poker-website \
    --image gcr.io/$PROJECT_ID/poker-website \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --port 8080 \
    --memory 512Mi \
    --cpu 1 \
    --max-instances 10
```

### Option 3: Using Cloud Build (CI/CD)

1. **Push your code to a Git repository** (GitHub, GitLab, etc.)

2. **Connect your repository to Cloud Build**:
   - Go to Cloud Build > Triggers
   - Create a new trigger
   - Connect your repository
   - Use the `cloudbuild.yaml` file

3. **Set up automatic deployments** on push to main branch

## Post-Deployment Configuration

### 1. Set Environment Variables in Cloud Run

```bash
gcloud run services update poker-website \
    --region=us-central1 \
    --set-env-vars="DB_USER=pokeruser,DB_HOST=your-cloud-sql-connection,DB_NAME=pokerdb,DB_PASSWORD=your-password,NODE_ENV=production"
```

### 2. Update CORS Settings

After deployment, update the `FRONTEND_URL` environment variable to match your Cloud Run service URL.

### 3. Database Connection

If using Cloud SQL, you'll need to:
- Configure the connection string
- Set up proper networking
- Ensure SSL connections are enabled

## Monitoring and Logs

### View Logs
```bash
gcloud logs tail --service=poker-website
```

### Monitor Performance
- Go to Cloud Run console
- Select your service
- View metrics and logs

## Troubleshooting

### Common Issues

1. **Port Issues**: Ensure your app listens on port 8080
2. **Database Connection**: Check SSL settings and connection strings
3. **CORS Errors**: Verify FRONTEND_URL is set correctly
4. **Memory Issues**: Increase memory allocation if needed

### Debug Commands

```bash
# Check service status
gcloud run services describe poker-website --region=us-central1

# View recent logs
gcloud logs read --service=poker-website --limit=50

# Test the health endpoint
curl https://your-service-url.run.app/health
```

## Cost Optimization

- **Memory**: Start with 512Mi, adjust based on usage
- **CPU**: 1 CPU is usually sufficient for small applications
- **Max Instances**: Set to 10 to prevent runaway costs
- **Min Instances**: Set to 0 for cost savings (cold starts)

## Security Considerations

1. **Environment Variables**: Never commit secrets to version control
2. **Database**: Use Cloud SQL with proper access controls
3. **HTTPS**: Cloud Run provides HTTPS by default
4. **Authentication**: Consider adding authentication for production use

## Next Steps

1. Set up a custom domain
2. Configure SSL certificates
3. Set up monitoring and alerting
4. Implement CI/CD pipeline
5. Add authentication and authorization 