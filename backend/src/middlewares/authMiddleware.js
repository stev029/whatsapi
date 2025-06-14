// src/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User'); // Import model User (Mongoose)

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.status(401).json({ error: 'Authentication token required.' });
    }

    jwt.verify(token, config.jwtSecret, async (err, userPayload) => {
        if (err) {
            console.error('JWT verification error:', err);
            return res.status(403).json({ error: 'Invalid or expired token.' });
        }
        try {
            const user = await User.findById(userPayload.id); // Cari user di MongoDB
            if (!user) {
                return res.status(404).json({ error: 'User not found.' });
            }
            req.user = user; // Attach Mongoose user object to request
            next();
        } catch (dbError) {
            console.error('Database error in authMiddleware:', dbError);
            res.status(500).json({ error: 'Server error during authentication.' });
        }
    });
}

module.exports = authenticateToken;