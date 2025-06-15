// src/config/index.js
require('dotenv').config();

module.exports = {
    port: process.env.PORT || 3000,
    mode: process.env.MODE || 'dev',
    sessionDir: './sessions',
    allowCorsOrigins: '*',
    allowCorsMethods: ['PUT', 'DELETE', 'POST', 'GET'],
    allowCorsHeaders: ['Content-Type', 'Authorization', 'X-Session-Token'],
    jwtSecret: process.env.JWT_SECRET,
    maxSessionsPerUser: parseInt(process.env.MAX_SESSIONS_PER_USER || '2', 10),
    mongoUri: process.env.MONGO_URI,
    qrTimeoutMinutes: parseInt(process.env.QR_TIMEOUT_MINUTES || '5', 10), // Durasi timeout QR
    sessionTokenHeader: 'x-session-token', // Nama header untuk secret token sesi
    sessionSecret: process.env.SESSION_SECRET || '6f86c79f52d1a62bfa9690ff1acc0bf4187bcaec7f4bee4cc3a586908f471864' // Secret untuk JWT sesi WhatsApp
};