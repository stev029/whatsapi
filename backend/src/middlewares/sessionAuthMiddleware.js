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
        const { phoneNumber } = decoded;
        req.senderPhoneNumber = phoneNumber; // Tambahkan senderPhoneNumber ke request
        next();
    } catch (error) {
        console.error('Session token verification error:', error.message);
        return res.status(403).json({ error: 'Invalid or expired session token.' });
    }
}

module.exports = authenticateSessionToken;