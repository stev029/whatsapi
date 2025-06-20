// src/controllers/whatsappController.js
const whatsappService = require('../services/whatsappService');

exports.addSession = async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        const userId = req.user._id; // _id dari Mongoose

        if (!phoneNumber) {
            return res.status(400).json({ error: 'Phone number is required.' });
        }
        const cleanPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');

        const result = await whatsappService.createClient(userId, cleanPhoneNumber, req.app.get('socketio'));
        if (result.success) {
            res.status(200).json({
                message: result.message,
                phoneNumber: cleanPhoneNumber,
                sessionToken: result.sessionToken // Kirim secret token sesi
            });
        } else {
            res.status(500).json({ error: result.message, details: result.error });
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.setWebhook = async (req, res, next) => {
    const { phoneNumber, webhoobUrl } = req.body;
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

exports.getUserSessionsStatus = async (req, res) => { // Pastikan async
    const userId = req.user._id;
    const status = await whatsappService.getClientStatusForUser(userId); // Panggil async
    res.status(200).json(status);
};

// Endpoint untuk mengirim pesan (tidak perlu senderPhoneNumber di body)
exports.sendMessage = async (req, res) => {
    try {
        const senderPhoneNumber = req.senderPhoneNumber; // Diambil dari sessionAuthMiddleware
        const { targetNumber, message } = req.body;

        if (!targetNumber || !message) {
            return res.status(400).json({ error: 'targetNumber and message are required.' });
        }

        const result = await whatsappService.sendMessage(senderPhoneNumber, targetNumber, message);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Endpoint untuk mengirim media (tidak perlu senderPhoneNumber di body)
exports.sendMedia = async (req, res) => {
    try {
        const senderPhoneNumber = req.senderPhoneNumber; // Diambil dari sessionAuthMiddleware
        const { targetNumber, filePath, caption } = req.body;

        if (!targetNumber || !filePath) {
            return res.status(400).json({ error: 'targetNumber and filePath are required.' });
        }

        const result = await whatsappService.sendMedia(senderPhoneNumber, targetNumber, filePath, caption);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Endpoint baru: Menghapus sesi WhatsApp
exports.deleteSession = async (req, res) => {
    try {
        const { phoneNumber } = req.params; // Nomor WA yang akan dihapus
        const userId = req.user._id; // User yang meminta penghapusan dari JWT utama

        // **VALIDASI KEPEMILIKAN SESI:**
        // Pastikan pengguna yang login ini benar-benar memiliki sesi WhatsApp dengan phoneNumber tersebut.
        const user = req.user; // req.user sudah dimuat oleh authMiddleware utama
        const sessionExistsForUser = user.whatsappSessions.some(s => s.phoneNumber === phoneNumber);

        if (!sessionExistsForUser) {
            return res.status(403).json({ error: 'Forbidden: You do not own this WhatsApp session.' });
        }

        // Panggil service untuk menghapus sesi
        await whatsappService.destroySession(phoneNumber, userId, req.app.get('socketio'), 'USER_REQUEST');
        res.status(200).json({ message: `Session for ${phoneNumber} successfully deleted.` });
    } catch (error) {
        console.error('Error deleting session:', error);
        res.status(500).json({ error: error.message || 'Failed to delete session.' });
    }
};
