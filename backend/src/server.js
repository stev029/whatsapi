// src/server.js
const app = require('./app');
const http = require('http');
const socketio = require('socket.io');
const whatsappService = require('./services/whatsappService');
const config = require('./config');
const connectDB = require('./models'); // Import fungsi koneksi DB

const server = http.createServer(app);
const io = socketio(server, {
    cors: {
        origin: config.allowCorsOrigins,
        methods: config.allowCorsMethods,
        allowedHeaders: config.allowCorsHeaders
    }
});
app.set('socketio', io);

// Event Socket.IO untuk koneksi klien web (frontend)
io.on('connection', async (socket) => { // Tambahkan async di sini
    console.log('A user connected via Socket.IO');
    // Jika Anda ingin mengirim status sesi saat ini, pastikan user sudah login
    // atau kirim status umum yang tidak terkait user.
    // Contoh: socket.emit('current_sessions_status', whatsappService.getClientStatusForUser(socket.handshake.query.userId));
    // Ini lebih kompleks karena user harus otentikasi di Socket.IO juga.
    // Untuk saat ini, kita akan mengirim status umum atau tidak sama sekali di koneksi awal.
    socket.on('disconnect', () => {
        console.log('User disconnected from Socket.IO');
    });
});

const startServer = async () => {
    await connectDB(); // Hubungkan ke MongoDB

    server.listen(config.port, async () => {
        console.log(`Server running on http://localhost:${config.port}`);
        console.log('WhatsApp API Multi-Session Ready!');
        console.log('Attempting to restore existing sessions...');
        await whatsappService.restoreSessions(io); // Coba pulihkan sesi saat server dimulai
    });
};

startServer();