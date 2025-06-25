// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middlewares/authMiddleware'); // Import middleware

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken); // Rute baru untuk refresh token
router.post('/logout', verifyToken, authController.logout); // Logout butuh token untuk identifikasi user

// Contoh route yang dilindungi (hanya bisa diakses jika ada token valid)
router.get('/protected-route', verifyToken, (req, res) => {
    res.status(200).json({ message: `Welcome ${req.user.username}, you accessed a protected route!` });
});

module.exports = router;