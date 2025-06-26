# Database Setup Guide for Poker Website

This guide covers setting up the database for your poker website, including both local development and cloud production environments.

## Database Schema

Your poker website uses a simple PostgreSQL database with the following structure:

### Users Table
- `id` (SERIAL PRIMARY KEY)
- `username` (VARCHAR UNIQUE)
- `password` (VARCHAR - hashed)
- `created_at` (TIMESTAMP)

## Setup Options

### Option 1: Cloud SQL (Recommended for Production)

#### Step 1: Create Cloud SQL Instance

```bash
# Create PostgreSQL instance
gcloud sql instances create poker-db \
    --database-version=POSTGRES_14 \
    --tier=db-f1-micro \
    --region=us-central1 \
    --root-password=YOUR_ROOT_PASSWORD \
    --storage-type=SSD \
    --storage-size=10GB

# Enable Cloud SQL Admin API
gcloud services enable sqladmin.googleapis.com
```

#### Step 2: Create Database and User

```bash
# Create database
gcloud sql databases create pokerdb --instance=poker-db

# Create user
gcloud sql users create pokeruser \
    --instance=poker-db \
    --password=YOUR_USER_PASSWORD
```

#### Step 3: Get Connection Information

```bash
# Get connection name
gcloud sql instances describe poker-db --format="value(connectionName)"

# Get public IP (if needed)
gcloud sql instances describe poker-db --format="value(ipAddresses[0].ipAddress)"
```

#### Step 4: Configure Environment Variables

```bash
# Set environment variables in Cloud Run
gcloud run services update poker-website \
    --region=us-central1 \
    --set-env-vars="DB_USER=pokeruser,DB_HOST=/cloudsql/YOUR_CONNECTION_NAME,DB_NAME=pokerdb,DB_PASSWORD=YOUR_USER_PASSWORD,NODE_ENV=production"
```

### Option 2: Local PostgreSQL (Development)

#### Step 1: Install PostgreSQL

**Windows:**
- Download from: https://www.postgresql.org/download/windows/
- Or use Chocolatey: `choco install postgresql`

**macOS:**
```bash
brew install postgresql
brew services start postgresql
```

**Linux (Ubuntu):**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### Step 2: Create Database and User

```bash
# Connect as postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE pokerdb;
CREATE USER pokeruser WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE pokerdb TO pokeruser;
\q
```

#### Step 3: Run Database Setup Script

```bash
# Run the setup script
psql -h localhost -U pokeruser -d pokerdb -f database-setup.sql
```

### Option 3: Docker PostgreSQL (Development)

#### Step 1: Create Docker Compose File

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: pokerdb
      POSTGRES_USER: pokeruser
      POSTGRES_PASSWORD: your_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database-setup.sql:/docker-entrypoint-initdb.d/init.sql

volumes:
  postgres_data:
```

#### Step 2: Start Database

```bash
docker-compose up -d
```

## Database Setup Script

Create `database-setup.sql`:

```sql
-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster username lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Insert sample user (optional)
-- INSERT INTO users (username, password) VALUES ('admin', '$2b$10$...');
```

## Environment Configuration

### Local Development (.env file)

```env
# Database Configuration
DB_USER=pokeruser
DB_HOST=localhost
DB_NAME=pokerdb
DB_PASSWORD=your_password
DB_PORT=5432

# Session Configuration
SESSION_SECRET=your-super-secret-session-key

# Application Configuration
NODE_ENV=development
```

### Cloud Production (Cloud Run)

```bash
# Set all environment variables
gcloud run services update poker-website \
    --region=us-central1 \
    --set-env-vars="DB_USER=pokeruser,DB_HOST=/cloudsql/YOUR_CONNECTION_NAME,DB_NAME=pokerdb,DB_PASSWORD=YOUR_PASSWORD,NODE_ENV=production,SESSION_SECRET=YOUR_SESSION_SECRET"
```

## Testing Database Connection

### Test Local Connection

```bash
# Test with psql
psql -h localhost -U pokeruser -d pokerdb -c "SELECT version();"

# Test with Node.js
node -e "
const { Pool } = require('pg');
const pool = new Pool({
  user: 'pokeruser',
  host: 'localhost',
  database: 'pokerdb',
  password: 'your_password',
  port: 5432,
});
pool.query('SELECT NOW()', (err, res) => {
  console.log(err ? 'Error:' + err : 'Success:', res.rows[0]);
  pool.end();
});
"
```

### Test Cloud SQL Connection

```bash
# Test connection from Cloud Shell
gcloud sql connect poker-db --user=pokeruser --database=pokerdb
```

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Check if PostgreSQL is running
   - Verify port 5432 is open
   - Check firewall settings

2. **Authentication Failed**
   - Verify username/password
   - Check pg_hba.conf configuration
   - Ensure user has proper permissions

3. **SSL Connection Issues (Cloud SQL)**
   - Use SSL for production connections
   - Set `ssl: { rejectUnauthorized: false }` in Node.js

4. **Permission Denied**
   - Grant proper database permissions
   - Check user roles and privileges

### Debug Commands

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check logs
sudo tail -f /var/log/postgresql/postgresql-*.log

# Connect and check tables
psql -h localhost -U pokeruser -d pokerdb -c "\dt"

# Check user permissions
psql -h localhost -U pokeruser -d pokerdb -c "\du"
```

## Security Best Practices

1. **Use Strong Passwords**
2. **Enable SSL for Production**
3. **Limit Database Access**
4. **Regular Backups**
5. **Use Environment Variables**
6. **Keep PostgreSQL Updated**

## Backup and Restore

### Backup Database

```bash
# Local backup
pg_dump -h localhost -U pokeruser pokerdb > backup.sql

# Cloud SQL backup
gcloud sql export sql poker-db gs://your-bucket/backup.sql \
    --database=pokerdb
```

### Restore Database

```bash
# Local restore
psql -h localhost -U pokeruser pokerdb < backup.sql

# Cloud SQL restore
gcloud sql import sql poker-db gs://your-bucket/backup.sql \
    --database=pokerdb
``` 