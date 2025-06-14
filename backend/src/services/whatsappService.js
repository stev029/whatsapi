// src/services/whatsappService.js
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs-extra');
const path = require('path');
const jwt = require('jsonwebtoken'); // Import JWT untuk secret token sesi
const config = require('../config');
const User = require('../models/User');

// Objek untuk menyimpan semua klien WhatsApp yang aktif
const clients = {}; // { phoneNumber: ClientInstance }
const qrCodes = {}; // { phoneNumber: qrData }
const clientStatuses = {}; // { phoneNumber: 'LOADING' | 'QR_READY' | 'READY' | 'DISCONNECTED' | 'AUTH_FAILURE' | 'ERROR' }
const qrTimeouts = {}; // { phoneNumber: TimeoutInstance }

// Fungsi untuk menghasilkan secret token sesi
function generateSessionToken(userId, phoneNumber) {
    return jwt.sign({ userId, phoneNumber }, config.sessionSecret, { expiresIn: '1y' }); // Token sesi bisa lebih lama
}

// Fungsi untuk menghapus sesi secara paksa (dari memori dan disk)
async function destroySession(phoneNumber, userId, io, reason = 'Timeout') {
    console.log(`Destroying session for ${phoneNumber} due to: ${reason}`);

    const client = clients[phoneNumber];
    if (client) {
        try {
            await client.destroy(); // Tutup browser dan hapus sesi
        } catch (err) {
            console.error(`Error destroying whatsapp-web.js client for ${phoneNumber}:`, err.message);
        }
        clients[phoneNumber].destroy()
        delete clients[phoneNumber];
    }

    delete qrCodes[phoneNumber];
    delete clientStatuses[phoneNumber];
    if (qrTimeouts[phoneNumber]) {
        clearTimeout(qrTimeouts[phoneNumber]);
        delete qrTimeouts[phoneNumber];
    }

    const sessionPath = path.join(config.sessionDir, `session_${phoneNumber}`);
    if (await fs.pathExists(sessionPath)) {
        try {
            await fs.remove(sessionPath); // Hapus folder sesi dari disk
            console.log(`Session folder for ${phoneNumber} removed.`);
        } catch (err) {
            console.error(`Error removing session folder ${sessionPath}:`, err.message);
        }
    }

    // Update status di database User
    const user = await User.findById(userId);
    if (user) {
        user.whatsappSessions = user.whatsappSessions.filter(s => s.phoneNumber !== phoneNumber);
        await user.save();
    }

    if (io) io.emit('client_status', { phoneNumber, status: 'DESTROYED', reason, userId });
}


// Fungsi untuk membuat dan menginisialisasi klien WhatsApp baru
async function createClient(userId, phoneNumber, io) {
    const user = await User.findById(userId);
    if (!user) {
        throw new Error('User not found.');
    }

    // Cek apakah sesi ini sudah ada untuk user ini, jika ya, gunakan yang sudah ada
    let sessionEntry = user.whatsappSessions.find(s => s.phoneNumber === phoneNumber);
    if (sessionEntry) {
        // Jika sudah ada, tapi statusnya DISCONNECTED atau ERROR, coba inisialisasi ulang
        if (clientStatuses[phoneNumber] === 'READY') {
             console.log(`Client for ${phoneNumber} already ready.`);
             return { success: true, message: 'Client is already ready.', sessionToken: sessionEntry.secretToken };
        }
        console.log(`Re-initializing existing session for ${phoneNumber}.`);
        // Jika statusnya loading/qr_ready, mungkin sudah dalam proses
        if (clientStatuses[phoneNumber] === 'LOADING' || clientStatuses[phoneNumber] === 'QR_READY') {
            return { success: true, message: 'Client is already initializing.', sessionToken: sessionEntry.secretToken };
        }
    } else {
        // Jika sesi baru, cek batasan
        if (user.whatsappSessions.length >= config.maxSessionsPerUser) {
            throw new Error(`You have reached the maximum limit of ${config.maxSessionsPerUser} WhatsApp sessions.`);
        }
        // Buat secret token baru untuk sesi ini
        sessionEntry = {
            phoneNumber,
            secretToken: generateSessionToken(userId, phoneNumber),
            status: 'LOADING' // Set status awal di objek sesi
        };
        user.whatsappSessions.push(sessionEntry);
        await user.save(); // Simpan perubahan ke DB
    }

    const sessionPath = path.join(config.sessionDir, `session_${phoneNumber}`);
    await fs.ensureDir(sessionPath);

    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: phoneNumber,
            dataPath: sessionPath
        }),
        puppeteer: {
            args: [
                '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
                '--single-process', '--disable-gpu'
            ],
        }
    });

    clients[phoneNumber];
    clientStatuses[phoneNumber] = 'LOADING'; // Update status global
    // Update status di DB juga
    await User.updateOne(
        { _id: userId, 'whatsappSessions.phoneNumber': phoneNumber },
        { '$set': { 'whatsappSessions.$.status': 'LOADING', 'whatsappSessions.$.lastUpdated': Date.now() } }
    );


    // Event Listeners untuk klien ini
    client.on('qr', qr => {
        console.log(`QR RECEIVED for ${phoneNumber}:`, qr);
        qrCodes[phoneNumber] = qr;
        clientStatuses[phoneNumber] = 'QR_READY';
        io.emit('qr_code', { phoneNumber, qr, userId, secretToken: sessionEntry.secretToken });

        // Mulai timer penghapusan otomatis
        qrTimeouts[phoneNumber] = setTimeout(async () => {
            if (clientStatuses[phoneNumber] !== 'READY') { // Jika belum siap dalam waktu timeout
                await destroySession(phoneNumber, userId, io, 'QR_TIMEOUT');
                console.log(`Session for ${phoneNumber} removed due to QR timeout.`);
            }
        }, config.qrTimeoutMinutes * 60 * 1000); // Konversi menit ke milidetik

        // Update status di DB
        User.updateOne(
            { _id: userId, 'whatsappSessions.phoneNumber': phoneNumber },
            { '$set': { 'whatsappSessions.$.status': 'QR_READY', 'whatsappSessions.$.lastUpdated': Date.now() } }
        ).exec();
    });

    client.on('ready', async () => {
        console.log(`Client ${phoneNumber} is ready!`);
        clientStatuses[phoneNumber] = 'READY';
        delete qrCodes[phoneNumber];
        if (qrTimeouts[phoneNumber]) {
            clearTimeout(qrTimeouts[phoneNumber]); // Hentikan timer jika sudah siap
            delete qrTimeouts[phoneNumber];
        }
        io.emit('client_status', { phoneNumber, status: 'READY', userId, secretToken: sessionEntry.secretToken });

        // Update status di DB
        await User.updateOne(
            { _id: userId, 'whatsappSessions.phoneNumber': phoneNumber },
            { '$set': { 'whatsappSessions.$.status': 'READY', 'whatsappSessions.$.lastUpdated': Date.now() } }
        );
    });

    client.on('message', async msg => {
        console.log(`MESSAGE from ${phoneNumber}:`, msg.body);
        io.emit('new_message', { phoneNumber, message: msg.body, from: msg.from, userId, secretToken: sessionEntry.secretToken });

        if (msg.body.toLowerCase() === 'halo') {
            msg.reply('Halo kembali!');
        } else if (msg.body.toLowerCase() === '!status') {
            const clientInfo = clients[phoneNumber] && clients[phoneNumber].info;
            if (clientInfo) {
                msg.reply(`Status: Connected (from ${clientInfo.pushname})`);
            } else {
                msg.reply('Status: Disconnected');
            }
        }
    });

    client.on('disconnected', async (reason) => {
        console.log(`Client ${phoneNumber} was disconnected:`, reason);
        clientStatuses[phoneNumber] = 'DISCONNECTED';
        io.emit('client_status', { phoneNumber, status: 'DISCONNECTED', reason, userId, secretToken: sessionEntry.secretToken });

        // Hentikan timer jika sesi terputus sebelum siap
        if (qrTimeouts[phoneNumber]) {
            clearTimeout(qrTimeouts[phoneNumber]);
            delete qrTimeouts[phoneNumber];
        }

        // Jangan langsung destroy, biarkan client.initialize() berikutnya yang menghandle
        // atau jika ingin langsung hapus, panggil destroySession di sini
        // Untuk saat ini, kita hanya update status dan hapus dari objek memory
        delete clients[phoneNumber];
        delete qrCodes[phoneNumber];

        // Update status di DB menjadi DISCONNECTED
        const updatedUser = await User.findOneAndUpdate(
            { _id: userId, 'whatsappSessions.phoneNumber': phoneNumber },
            { '$set': { 'whatsappSessions.$.status': 'DISCONNECTED', 'whatsappSessions.$.lastUpdated': Date.now() } },
            { new: true } // Return the updated document
        );
        // Jika sesi terputus, kita mungkin tidak perlu menghapus dari whatsappSessions user
        // tapi biarkan dia ada dengan status DISCONNECTED, agar bisa di-reconnect
        if (updatedUser) {
            console.log(`User ${updatedUser.username} sessions after disconnect:`, updatedUser.whatsappSessions.map(s => `${s.phoneNumber}(${s.status})`).join(', '));
        }
    });

    client.on('auth_failure', async msg => {
        console.error(`Authentication failure for ${phoneNumber}:`, msg);
        clientStatuses[phoneNumber] = 'AUTH_FAILURE';
        io.emit('client_status', { phoneNumber, status: 'AUTH_FAILURE', message: msg, userId, secretToken: sessionEntry.secretToken });

        // Hapus sesi jika terjadi auth failure
        await destroySession(phoneNumber, userId, io, 'AUTH_FAILURE');
    });

    client.on('change_state', state => {
        console.log(`Client ${phoneNumber} state changed:`, state);
        io.emit('client_status', { phoneNumber, status: `STATE_${state}`, userId, secretToken: sessionEntry.secretToken });
        // Update status di DB juga
        User.updateOne(
            { _id: userId, 'whatsappSessions.phoneNumber': phoneNumber },
            { '$set': { 'whatsappSessions.$.status': `STATE_${state}`, 'whatsappSessions.$.lastUpdated': Date.now() } }
        ).exec();
    });


    try {
        await client.initialize();
        return { success: true, message: 'Client initialization started.', sessionToken: sessionEntry.secretToken };
    } catch (error) {
        console.error(`Error initializing client for ${phoneNumber}:`, error);
        clientStatuses[phoneNumber] = 'ERROR';
        // Hapus sesi jika terjadi error saat inisialisasi awal
        await destroySession(phoneNumber, userId, io, `INITIALIZATION_ERROR: ${error.message}`);
        return { success: false, message: 'Error initializing client.', error: error.message };
    }
}

// Fungsi untuk mendapatkan status klien, disaring berdasarkan pengguna
async function getClientStatusForUser(userId) {
    const user = await User.findById(userId);
    if (!user) return {};

    const statuses = {};
    for (const session of user.whatsappSessions) { // Iterasi melalui objek sesi di DB
        const phoneNumber = session.phoneNumber;
        statuses[phoneNumber] = {
            status: clientStatuses[phoneNumber] || session.status || 'NOT_FOUND', // Ambil dari status global atau dari DB
            qr: qrCodes[phoneNumber] || null,
            info: clients[phoneNumber] && clients[phoneNumber].info ? {
                pushname: clients[phoneNumber].info.pushname,
                number: clients[phoneNumber].info.wid.user
            } : null,
            secretToken: session.secretToken // Sertakan secret token sesi
        };
    }
    return statuses;
}

// Fungsi untuk mengirim pesan, menggunakan senderPhoneNumber dari middleware
async function sendMessage(senderPhoneNumber, targetNumber, message) { // userId tidak lagi dibutuhkan di sini
    const client = clients[senderPhoneNumber];
    if (!client || clientStatuses[senderPhoneNumber] !== 'READY') {
        throw new Error(`Client for ${senderPhoneNumber} is not ready or does not exist. Status: ${clientStatuses[senderPhoneNumber] || 'Unknown'}`);
    }

    const chatId = targetNumber.includes('@c.us') ? targetNumber : `${targetNumber}@c.us`;
    try {
        const result = await client.sendMessage(chatId, message);
        return { success: true, id: result.id._serialized };
    } catch (error) {
        console.error(`Error sending message from ${senderPhoneNumber} to ${targetNumber}:`, error);
        throw new Error(`Failed to send message: ${error.message}`);
    }
}

// Fungsi untuk mengirim media, menggunakan senderPhoneNumber dari middleware
async function sendMedia(senderPhoneNumber, targetNumber, filePath, caption = '') { // userId tidak lagi dibutuhkan di sini
    const client = clients[senderPhoneNumber];
    if (!client || clientStatuses[senderPhoneNumber] !== 'READY') {
        throw new Error(`Client for ${senderPhoneNumber} is not ready or does not exist. Status: ${clientStatuses[senderPhoneNumber] || 'Unknown'}`);
    }

    const chatId = targetNumber.includes('@c.us') ? targetNumber : `${targetNumber}@c.us`;
    try {
        const media = MessageMedia.fromFilePath(filePath);
        const result = await client.sendMessage(chatId, media, { caption: caption });
        return { success: true, id: result.id._serialized };
    } catch (error) {
        console.error(`Error sending media from ${senderPhoneNumber} to ${targetNumber}:`, error);
        throw new Error(`Failed to send media: ${error.message}`);
    }
}

// Fungsi untuk memuat ulang semua sesi yang sudah ada saat server restart
async function restoreSessions(io) {
    console.log("Starting session restoration process...");
    const sessionDirs = await fs.readdir(config.sessionDir);
    const allUsers = await User.find({});

    for (const dir of sessionDirs) {
        if (dir.startsWith('session_')) {
            const phoneNumber = dir.replace('session_', '');
            console.log(`Checking existing session folder for: ${phoneNumber}`);

            // Coba temukan user dan sessionEntry di database
            let foundUserId = null;
            let foundSessionEntry = null;
            for (const user of allUsers) {
                const session = user.whatsappSessions.find(s => s.phoneNumber === phoneNumber);
                if (session) {
                    foundUserId = user._id;
                    foundSessionEntry = session;
                    break;
                }
            }

            if (!foundUserId || !foundSessionEntry) {
                console.warn(`Session folder for ${phoneNumber} found but no associated user/entry in DB. Removing orphaned session.`);
                await fs.remove(path.join(config.sessionDir, dir)); // Hapus folder sesi yang "yatim"
                continue;
            }

            console.log(`Attempting to restore session for ${phoneNumber} (owned by user ${foundUserId})...`);

            const client = new Client({
                authStrategy: new LocalAuth({
                    clientId: phoneNumber,
                    dataPath: path.join(config.sessionDir, dir)
                }),
                puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
            });

            clients[phoneNumber] = client;
            clientStatuses[phoneNumber] = 'LOADING'; // Set status awal saat restore
            // Update status di DB saat restore
            await User.updateOne(
                { _id: foundUserId, 'whatsappSessions.phoneNumber': phoneNumber },
                { '$set': { 'whatsappSessions.$.status': 'LOADING', 'whatsappSessions.$.lastUpdated': Date.now() } }
            );

            // Set event listeners untuk klien yang dipulihkan
            client.on('qr', qr => {
                console.log(`QR RECEIVED for ${phoneNumber} (restored):`, qr);
                qrCodes[phoneNumber] = qr;
                clientStatuses[phoneNumber] = 'QR_READY';
                io.emit('qr_code', { phoneNumber, qr, userId: foundUserId, secretToken: foundSessionEntry.secretToken, restored: true });

                // Mulai timer QR untuk sesi yang dipulihkan jika masih QR_READY
                qrTimeouts[phoneNumber] = setTimeout(async () => {
                    if (clientStatuses[phoneNumber] !== 'READY') {
                        await destroySession(phoneNumber, foundUserId, io, 'QR_TIMEOUT_RESTORED');
                        console.log(`Restored session for ${phoneNumber} removed due to QR timeout.`);
                    }
                }, config.qrTimeoutMinutes * 60 * 1000);

                 User.updateOne(
                    { _id: foundUserId, 'whatsappSessions.phoneNumber': phoneNumber },
                    { '$set': { 'whatsappSessions.$.status': 'QR_READY', 'whatsappSessions.$.lastUpdated': Date.now() } }
                ).exec();
            });

            client.on('ready', async () => {
                console.log(`Client ${phoneNumber} (restored) is ready!`);
                clientStatuses[phoneNumber] = 'READY';
                delete qrCodes[phoneNumber];
                if (qrTimeouts[phoneNumber]) {
                    clearTimeout(qrTimeouts[phoneNumber]);
                    delete qrTimeouts[phoneNumber];
                }
                io.emit('client_status', { phoneNumber, status: 'READY', userId: foundUserId, secretToken: foundSessionEntry.secretToken, restored: true });

                await User.updateOne(
                    { _id: foundUserId, 'whatsappSessions.phoneNumber': phoneNumber },
                    { '$set': { 'whatsappSessions.$.status': 'READY', 'whatsappSessions.$.lastUpdated': Date.now() } }
                );
            });

            client.on('message', async msg => {
                console.log(`MESSAGE from ${phoneNumber} (restored):`, msg.body);
                io.emit('new_message', { phoneNumber, message: msg.body, from: msg.from, userId: foundUserId, secretToken: foundSessionEntry.secretToken });
                if (msg.body.toLowerCase() === 'halo') { msg.reply('Halo kembali!'); }
            });

            client.on('disconnected', async (reason) => {
                console.log(`Client ${phoneNumber} (restored) was disconnected:`, reason);
                clientStatuses[phoneNumber] = 'DISCONNECTED';
                io.emit('client_status', { phoneNumber, status: 'DISCONNECTED', reason, userId: foundUserId, secretToken: foundSessionEntry.secretToken, restored: true });

                if (qrTimeouts[phoneNumber]) {
                    clearTimeout(qrTimeouts[phoneNumber]);
                    delete qrTimeouts[phoneNumber];
                }
                delete clients[phoneNumber];
                delete qrCodes[phoneNumber];

                await User.updateOne(
                    { _id: foundUserId, 'whatsappSessions.phoneNumber': phoneNumber },
                    { '$set': { 'whatsappSessions.$.status': 'DISCONNECTED', 'whatsappSessions.$.lastUpdated': Date.now() } }
                );
            });

            client.on('auth_failure', async msg => {
                console.error(`Authentication failure for ${phoneNumber} (restored):`, msg);
                clientStatuses[phoneNumber] = 'AUTH_FAILURE';
                io.emit('client_status', { phoneNumber, status: 'AUTH_FAILURE', message: msg, userId: foundUserId, secretToken: foundSessionEntry.secretToken });
                await destroySession(phoneNumber, foundUserId, io, 'AUTH_FAILURE_RESTORED');
            });

            client.on('change_state', state => {
                console.log(`Client ${phoneNumber} (restored) state changed:`, state);
                io.emit('client_status', { phoneNumber, status: `STATE_${state}`, userId: foundUserId, secretToken: foundSessionEntry.secretToken });
                User.updateOne(
                    { _id: foundUserId, 'whatsappSessions.phoneNumber': phoneNumber },
                    { '$set': { 'whatsappSessions.$.status': `STATE_${state}`, 'whatsappSessions.$.lastUpdated': Date.now() } }
                ).exec();
            });

            try {
                await client.initialize();
            } catch (error) {
                console.error(`Error restoring client for ${phoneNumber}:`, error);
                clientStatuses[phoneNumber] = 'ERROR';
                await destroySession(phoneNumber, foundUserId, io, `INITIALIZATION_ERROR_RESTORED: ${error.message}`);
            }
        }
    }
    console.log("Session restoration process completed.");
}

module.exports = {
    createClient,
    getClientStatusForUser,
    sendMessage,
    sendMedia,
    restoreSessions,
    destroySession // Export juga untuk penggunaan di controller jika perlu
};