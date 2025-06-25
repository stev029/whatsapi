// src/routes/whatsappRoutes.js
const express = require('express');
const router = express.Router();
const whatsappController = require("../controllers/whatsappController");
const { verifyToken } = require("../middlewares/authMiddleware"); // Untuk otentikasi user
const authenticateSessionToken = require("../middlewares/sessionAuthMiddleware"); // Untuk otentikasi sesi

// Rute untuk menambah sesi baru (membutuhkan user token)
router.post("/start-session",verifyToken, whatsappController.addSession);
// Rute untuk mendapatkan status sesi user (membutuhkan user token)
router.get('/status', verifyToken, whatsappController.getUserSessionsStatus);
// Rute untuk menghapus sesi (membutuhkan user token)
router.delete("/delete-session/:phoneNumber", verifyToken, whatsappController.deleteSession);
// Rute untuk menyimpan webhook (membutuhkan user token)
router.post("/set-webhook", verifyToken, whatsappController.setWebhook);
// Rute baru untuk meminta QR/Pairing Code ulang
router.post('/request-code', verifyToken, whatsappController.requestSessionCode);

// Rute ini membutuhkan secret token sesi (X-Session-Token header) DAN user token
// Urutan middleware penting: authenticateToken harus jalan duluan untuk mendapatkan req.user
router.post('/send-message', authenticateSessionToken, whatsappController.sendMessage);
router.post('/send-media', authenticateSessionToken, whatsappController.sendMedia);

module.exports = router;