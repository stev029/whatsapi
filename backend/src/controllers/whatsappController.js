// src/controllers/whatsappController.js
const whatsappService = require('../services/whatsappService');
const User = require("../models/User");
const logger = require("../config/logger");

exports.addSession = async (req, res, next) => {
    const { phoneNumber, usePairingCode } = req.body; // Terima usePairingCode dari frontend
    const userId = req.user.id; // Dari token JWT

    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required.' });
    }

    // Nomor telepon harus dalam format internasional tanpa +
    const cleanPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');

    if (!cleanPhoneNumber) {
        return res.status(400).json({ error: 'Invalid phone number format.' });
    }

    try {
        const result = await whatsappService.createClient(userId, cleanPhoneNumber, req.app.get('socketio'), usePairingCode);
        res.status(200).json(result);
    } catch (error) {
        logger.error(`Error starting session for ${cleanPhoneNumber}: ${error.message}`, error.stack);
        next(error); // Teruskan error ke error handling middleware
    }
};

exports.setWebhook = async (req, res, next) => {
    const { phoneNumber, webhookUrl } = req.body;
    const userId = req.user.id; // Dari token JWT

    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required.' });
    }
    // webhookUrl bisa null/kosong untuk menghapus webhook
    if (webhookUrl && typeof webhookUrl !== 'string') {
        return res.status(400).json({ error: 'Webhook URL must be a string or null.' });
    }

    const cleanPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');

    try {
        // Pastikan user memiliki sesi WhatsApp ini
        const user = await User.findById(userId);
        const sessionExists = user.whatsappSessions.some(s => s.phoneNumber === cleanPhoneNumber);
        if (!sessionExists) {
            return res.status(403).json({ error: 'You do not own this WhatsApp session.' });
        }

        const result = await whatsappService.setWebhookUrl(userId, cleanPhoneNumber, webhookUrl || null);
        res.status(200).json(result);
    } catch (error) {
        logger.error(`Error setting webhook URL for ${cleanPhoneNumber}: ${error.message}`, error.stack);
        next(error);
    }
};

exports.getUserSessionsStatus = async (req, res, next) => {
    const userId = req.user.id; // Dari token JWT
    try {
        const statuses = await whatsappService.getClientStatusForUser(userId);
        res.status(200).json(statuses);
    } catch (error) {
        logger.error(`Error getting client status for user ${userId}: ${error.message}`, error.stack);
        next(error);
    }
};

// Endpoint untuk mengirim pesan (tidak perlu senderPhoneNumber di body)
exports.sendMessage = async (req, res, next) => {
    const { targetNumber, message } = req.body;
    const { senderPhoneNumber } = req; // Diambil dari authenticateSession

    if (!senderPhoneNumber || !targetNumber || !message) {
        return res.status(400).json({ error: 'Sender phone number, target number, and message are required.' });
    }

    // Validasi dan sanitasi nomor
    const cleanSenderPhoneNumber = senderPhoneNumber.replace(/[^0-9]/g, '');
    const cleanTargetNumber = targetNumber.replace(/[^0-9]/g, '');

    try {
        const result = await whatsappService.sendMessage(cleanSenderPhoneNumber, cleanTargetNumber, message);
        res.status(200).json(result);
    } catch (error) {
        logger.error(`Error sending message from ${cleanSenderPhoneNumber} to ${cleanTargetNumber}: ${error.message}`, error.stack);
        next(error);
    }
};

// Endpoint untuk mengirim media (tidak perlu senderPhoneNumber di body)
exports.sendMedia = async (req, res, next) => {
    const { senderPhoneNumber, targetNumber, filePath, caption } = req.body;

    if (!senderPhoneNumber || !targetNumber || !filePath) {
        return res.status(400).json({ error: 'Sender phone number, target number, and file path are required.' });
    }

    const cleanSenderPhoneNumber = senderPhoneNumber.replace(/[^0-9]/g, '');
    const cleanTargetNumber = targetNumber.replace(/[^0-9]/g, '');

    try {
        const result = await whatsappService.sendMedia(cleanSenderPhoneNumber, cleanTargetNumber, filePath, caption);
        res.status(200).json(result);
    } catch (error) {
        logger.error(`Error sending media from ${cleanSenderPhoneNumber} to ${cleanTargetNumber}: ${error.message}`, error.stack);
        next(error);
    }
};

// Endpoint baru: Menghapus sesi WhatsApp
exports.deleteSession = async (req, res, next) => {
    const { phoneNumber } = req.params;
    const userId = req.user.id; // Dari token JWT

    const cleanPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');

    try {
        // Untuk memastikan user yang menghapus sesi adalah pemiliknya
        const user = await User.findById(userId);
        const sessionToDelete = user.whatsappSessions.find(s => s.phoneNumber === cleanPhoneNumber);

        if (!sessionToDelete) {
            return res.status(404).json({ error: 'WhatsApp session not found for this user.' });
        }

        // destroySession akan menghapus dari memori, file, dan DB
        await whatsappService.destroySession(cleanPhoneNumber, userId, req.app.get('io'));
        res.status(200).json({ message: 'WhatsApp session deleted successfully.' });
    } catch (error) {
        logger.error(`Error deleting session for ${cleanPhoneNumber}: ${error.message}`, error.stack);
        next(error);
    }
};

exports.requestSessionCode = async (req, res) => {
    const { phoneNumber, usePairingCode } = req.body;
    const userId = req.user.id; // Diperoleh dari verifyToken middleware

    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required.' });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Meminta QR/Pairing Code ulang
        // Asumsi whatsapp-web.js client memiliki metode untuk me-request code
        // ATAU Anda harus membuat logika untuk memicu event QR/Pairing Code dari client yang ada
        await whatsappService.getAuthentication(phoneNumber, req.app.get('socketio'), usePairingCode) // Asumsi ada method ini
        return res.status(200).json({ message: 'Pairing code request sent.' });

    } catch (error) {
        console.error('Error requesting session code:', error);
        res.status(500).json({ error: 'Internal server error while requesting session code.' });
    }
};