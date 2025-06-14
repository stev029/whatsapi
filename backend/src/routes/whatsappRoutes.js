// src/routes/whatsappRoutes.js
const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsappController');
const authenticateToken = require('../middlewares/authMiddleware'); // Untuk otentikasi user
const authenticateSessionToken = require('../middlewares/sessionAuthMiddleware'); // Untuk otentikasi sesi

// Semua rute di sini memerlukan otentikasi pengguna (JWT di Authorization header)
router.use(authenticateToken);

// Rute untuk menambah sesi baru (membutuhkan user token)
router.post('/add-session', whatsappController.addSession);
// Rute untuk mendapatkan status sesi user (membutuhkan user token)
router.get('/status', whatsappController.getUserSessionsStatus);
// Rute untuk menghapus sesi (membutuhkan user token)
router.delete('/delete-session/:phoneNumber', whatsappController.deleteSession);


// Rute ini membutuhkan secret token sesi (X-Session-Token header) DAN user token
// Urutan middleware penting: authenticateToken harus jalan duluan untuk mendapatkan req.user
router.post('/send-message', authenticateSessionToken, whatsappController.sendMessage);
router.post('/send-media', authenticateSessionToken, whatsappController.sendMedia);

module.exports = router;