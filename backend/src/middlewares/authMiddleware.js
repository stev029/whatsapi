// middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Import model User

// Pastikan dotenv sudah dimuat di entry point aplikasi (misal: server.js)
// require('dotenv').config();

exports.verifyToken = async (req, res, next) => {
    // Dapatkan token dari header Authorization
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied.' });
    }

    try {
        // Verifikasi token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Cari user berdasarkan ID yang ada di token
        // req.user akan tersedia di semua controller yang menggunakan middleware ini
        req.user = await User.findById(decoded.id).select('-password -refreshToken'); // Exclude password dan refresh token

        if (!req.user) {
            return res.status(401).json({ message: 'User not found for this token.' });
        }

        next(); // Lanjutkan ke route handler
    } catch (error) {
        console.error('Token verification failed:', error);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired. Please re-authenticate.' });
        }
        res.status(401).json({ message: 'Token is not valid.' });
    }
};