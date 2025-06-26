const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const session = require('express-session');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const pg = require('pg');
const path = require('path');
const cors = require('cors');  // <-- added cors import

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

require('dotenv').config();

// PostgreSQL DB setup - Updated for cloud deployment
const pool = new pg.Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'pokerdb',
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Enable CORS for frontend - Updated for production
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? process.env.FRONTEND_URL || 'https://your-domain.com'
        : 'http://localhost:3000',
    credentials: true,
}));

// Middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
    session({
        secret: process.env.SESSION_SECRET || 'poker-secret',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }
    })
);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
const authRoutes = require('./routes/auth');
app.use('/', authRoutes);

// WebSocket
const pokerSocket = require('./sockets/poker');
io.on('connection', (socket) => {
    pokerSocket(io, socket);
});

// Health check endpoint for Cloud Run
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
