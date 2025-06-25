// controllers/authController.js
const User = require('../models/User'); // Pastikan path model User benar
const jwt = require('jsonwebtoken');
const { generateAccessToken, generateRefreshToken } = require('../utils/tokenGenerator');

// Pastikan dotenv sudah dimuat di entry point aplikasi (misal: server.js)
// require('dotenv').config(); // Tidak perlu di sini jika sudah di entry point

// --- REGISTER USER ---
exports.register = async (req, res) => {
    const { username, password } = req.body;

    try {
        // Cek apakah username sudah ada
        let user = await User.findOne({ username });
        if (user) {
            return res.status(400).json({ message: 'Username already exists.' });
        }

        // Buat user baru
        user = new User({ username, password }); // Password akan dihash oleh pre-save hook di model

        // Simpan user baru
        await user.save();

        // Generate tokens
        const accessToken = generateAccessToken(user._id, user.username);
        const refreshToken = generateRefreshToken(user._id);

        // Simpan refresh token di database (pastikan field 'refreshToken' ada di model User)
        user.refreshToken = refreshToken;
        await user.save();

        res.status(201).json({
            message: 'User registered successfully!',
            token: accessToken,
            refreshToken: refreshToken,
            user: {
                id: user._id,
                username: user.username,
            }
        });

    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
};

// --- LOGIN USER ---
exports.login = async (req, res) => {
    const { username, password } = req.body;

    try {
        // Cari user berdasarkan username
        const user = await User.findOne({ username }).select('+password'); // Pastikan password diambil jika select: false

        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials.' });
        }

        // Bandingkan password
        const isMatch = await user.comparePassword(password); // Menggunakan metode dari model
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials.' });
        }

        // Generate tokens
        const accessToken = generateAccessToken(user._id, user.username);
        const refreshToken = generateRefreshToken(user._id);

        // Simpan refresh token baru di database (timpa yang lama)
        user.refreshToken = refreshToken;
        await user.save(); // Simpan perubahan pada user

        res.status(200).json({
            message: 'Logged in successfully!',
            token: accessToken, // Ini adalah access token
            refreshToken: refreshToken,
            user: {
                id: user._id,
                username: user.username,
            }
        });

    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
};

// --- LOGOUT USER ---
exports.logout = async (req, res) => {
    // Asumsi req.user.id sudah ada dari middleware verifyToken jika diakses dari rute terproteksi
    // Atau bisa juga user mengirimkan refresh token di body/cookie untuk di-logout

    const userId = req.user?.id || req.body?.userId; // Ambil userId dari req.user (jika dari verifyAccessToken) atau req.body

    if (!userId) {
        return res.status(400).json({ message: 'User ID is required for logout.' });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        user.refreshToken = undefined; // Hapus refresh token dari database
        await user.save();

        res.status(200).json({ message: 'Logged out successfully.' });
    } catch (error) {
        console.error('Error during logout:', error);
        res.status(500).json({ message: 'Server error during logout.' });
    }
};


// --- REFRESH TOKEN ---
exports.refreshToken = async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(401).json({ message: 'Refresh Token not provided.' });
    }

    try {
        // Verifikasi refresh token
        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

        // Cari user berdasarkan ID yang ada di refresh token
        const user = await User.findById(decoded.id).select('+refreshToken');

        // Pastikan user ada dan refresh token di database cocok dengan yang dikirim
        if (!user || user.refreshToken !== refreshToken) {
            return res.status(403).json({ message: 'Invalid Refresh Token.' });
        }

        // Generate access token baru
        const newAccessToken = generateAccessToken(user._id, user.username);
        // Anda juga bisa generate refresh token baru di sini jika ingin rolling refresh tokens
        // const newRefreshToken = generateRefreshToken(user._id);
        // user.refreshToken = newRefreshToken;
        // await user.save();

        res.status(200).json({
            message: 'New access token granted.',
            token: newAccessToken,
            // newRefreshToken: newRefreshToken // Kirim jika Anda generate refresh token baru
        });

    } catch (error) {
        console.error('Error refreshing token:', error);
        if (error.name === 'TokenExpiredError') {
            return res.status(403).json({ message: 'Refresh Token expired. Please log in again.' });
        }
        res.status(403).json({ message: 'Invalid or expired Refresh Token.' });
    }
};