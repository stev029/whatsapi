// utils/tokenGenerator.js
const jwt = require('jsonwebtoken');

// Pastikan .env sudah dimuat (misal di server.js atau app.js)
// require('dotenv').config();

const generateAccessToken = (userId, username) => {
    return jwt.sign(
        { id: userId, username: username },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRATION || '1h' }
    );
};

const generateRefreshToken = (userId) => {
    // Refresh token tidak perlu membawa banyak payload, cukup identifikasi user
    return jwt.sign(
        { id: userId },
        process.env.JWT_SECRET, // Bisa menggunakan secret yang sama atau secret berbeda untuk refresh token
        { expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRATION || '7d' }
    );
};

module.exports = {
    generateAccessToken,
    generateRefreshToken
};