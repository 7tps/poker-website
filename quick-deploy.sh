#!/bin/bash

# Quick Deploy Script for Poker Website
# This script will guide you through the deployment process

echo "🎰 Poker Website - Quick Deploy to Cloud Run"
echo "=============================================="

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Google Cloud SDK is not installed."
    echo "Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "❌ You are not authenticated with gcloud."
    echo "Please run: gcloud auth login"
    exit 1
fi

# Get current project
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)

if [ -z "$CURRENT_PROJECT" ]; then
    echo "❌ No project is set. Please set a project first:"
    echo "gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "✅ Using project: $CURRENT_PROJECT"

# Ask for confirmation
read -p "Do you want to deploy to this project? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 1
fi

# Enable required APIs
echo "🔧 Enabling required APIs..."
gcloud services enable cloudbuild.googleapis.com --quiet
gcloud services enable run.googleapis.com --quiet
gcloud services enable containerregistry.googleapis.com --quiet

# Build and deploy
echo "🏗️  Building and deploying..."
IMAGE_NAME="gcr.io/$CURRENT_PROJECT/poker-website"

# Build the image
docker build -t $IMAGE_NAME . || {
    echo "❌ Docker build failed. Make sure Docker is running."
    exit 1
}

# Push the image
docker push $IMAGE_NAME || {
    echo "❌ Failed to push image to Container Registry."
    exit 1
}

# Deploy to Cloud Run
gcloud run deploy poker-website \
    --image $IMAGE_NAME \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --port 8080 \
    --memory 512Mi \
    --cpu 1 \
    --max-instances 10 \
    --set-env-vars NODE_ENV=production || {
    echo "❌ Deployment failed."
    exit 1
}

# Get the service URL
SERVICE_URL=$(gcloud run services describe poker-website --region=us-central1 --format="value(status.url)")

echo ""
echo "🎉 Deployment completed successfully!"
echo "🌐 Your Poker Website is now available at:"
echo "   $SERVICE_URL"
echo ""
echo "📝 Next steps:"
echo "1. Set up your database (Cloud SQL recommended)"
echo "2. Configure environment variables:"
echo "   gcloud run services update poker-website --region=us-central1 --set-env-vars=\"DB_USER=your_user,DB_HOST=your_host,DB_NAME=pokerdb,DB_PASSWORD=your_password\""
echo "3. Test your application at the URL above"
echo ""
echo "📚 For detailed instructions, see DEPLOYMENT.md" 