@echo off
setlocal enabledelayedexpansion

echo 🎰 Poker Website - Quick Deploy to Cloud Run
echo ==============================================

REM Check if gcloud is installed
where gcloud >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Google Cloud SDK is not installed.
    echo Please install it from: https://cloud.google.com/sdk/docs/install
    pause
    exit /b 1
)

REM Check if user is authenticated
gcloud auth list --filter=status:ACTIVE --format="value(account)" | findstr . >nul
if %errorlevel% neq 0 (
    echo ❌ You are not authenticated with gcloud.
    echo Please run: gcloud auth login
    pause
    exit /b 1
)

REM Get current project
for /f "tokens=*" %%i in ('gcloud config get-value project 2^>nul') do set CURRENT_PROJECT=%%i

if "%CURRENT_PROJECT%"=="" (
    echo ❌ No project is set. Please set a project first:
    echo gcloud config set project YOUR_PROJECT_ID
    pause
    exit /b 1
)

echo ✅ Using project: %CURRENT_PROJECT%

REM Ask for confirmation
set /p CONFIRM="Do you want to deploy to this project? (y/N): "
if /i not "%CONFIRM%"=="y" (
    echo Deployment cancelled.
    pause
    exit /b 1
)

REM Enable required APIs
echo 🔧 Enabling required APIs...
gcloud services enable cloudbuild.googleapis.com --quiet
gcloud services enable run.googleapis.com --quiet
gcloud services enable containerregistry.googleapis.com --quiet

REM Build and deploy
echo 🏗️  Building and deploying...
set IMAGE_NAME=gcr.io/%CURRENT_PROJECT%/poker-website

REM Build the image
echo Building Docker image...
docker build -t %IMAGE_NAME% .
if %errorlevel% neq 0 (
    echo ❌ Docker build failed. Make sure Docker is running.
    pause
    exit /b 1
)

REM Push the image
echo Pushing image to Container Registry...
docker push %IMAGE_NAME%
if %errorlevel% neq 0 (
    echo ❌ Failed to push image to Container Registry.
    pause
    exit /b 1
)

REM Deploy to Cloud Run
echo Deploying to Cloud Run...
gcloud run deploy poker-website ^
    --image %IMAGE_NAME% ^
    --platform managed ^
    --region us-central1 ^
    --allow-unauthenticated ^
    --port 8080 ^
    --memory 512Mi ^
    --cpu 1 ^
    --max-instances 10 ^
    --set-env-vars NODE_ENV=production
if %errorlevel% neq 0 (
    echo ❌ Deployment failed.
    pause
    exit /b 1
)

REM Get the service URL
for /f "tokens=*" %%i in ('gcloud run services describe poker-website --region=us-central1 --format="value(status.url)"') do set SERVICE_URL=%%i

echo.
echo 🎉 Deployment completed successfully!
echo 🌐 Your Poker Website is now available at:
echo    %SERVICE_URL%
echo.
echo 📝 Next steps:
echo 1. Set up your database (Cloud SQL recommended)
echo 2. Configure environment variables:
echo    gcloud run services update poker-website --region=us-central1 --set-env-vars="DB_USER=your_user,DB_HOST=your_host,DB_NAME=pokerdb,DB_PASSWORD=your_password"
echo 3. Test your application at the URL above
echo.
echo 📚 For detailed instructions, see DEPLOYMENT.md
pause 