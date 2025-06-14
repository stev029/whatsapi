// src/middlewares/sessionAuthMiddleware.js
const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');

async function authenticateSessionToken(req, res, next) {
    const sessionToken = req.headers[config.sessionTokenHeader];

    if (!sessionToken) {
        return res.status(401).json({ error: 'Session token required in X-Session-Token header.' });
    }

    try {
        const decoded = jwt.verify(sessionToken, config.sessionSecret);
        const { userId, phoneNumber } = decoded;

        // VERIFIKASI UTAMA: Pastikan userId dari sessionToken cocok dengan userId dari JWT pengguna utama
        // Ini adalah validasi kepemilikan ganda
        if (!req.user || req.user._id.toString() !== userId) { // req.user._id datang dari authMiddleware
            return res.status(403).json({ error: 'User does not own this session token.' });
        }

        // Pastikan user dan sesi masih valid di database
        const user = req.user; // Gunakan objek user yang sudah dimuat oleh authMiddleware
        const sessionEntry = user.whatsappSessions.find(s => s.phoneNumber === phoneNumber && s.secretToken === sessionToken);
        if (!sessionEntry) {
            return res.status(403).json({ error: 'Invalid or expired session token, or session not found for this user.' });
        }

        req.senderPhoneNumber = phoneNumber; // Tambahkan senderPhoneNumber ke request
        next();
    } catch (error) {
        console.error('Session token verification error:', error.message);
        return res.status(403).json({ error: 'Invalid or expired session token.' });
    }
}

module.exports = authenticateSessionToken;