// src/app.js
const express = require('express');
const cors = require('cors');
const morgan = require('morgan'); // <--- Tambahkan ini
const logger = require('./config/logger'); // <--- Tambahkan ini

const config = require('./config')
const authRoutes = require('./routes/authRoutes');
const whatsappRoutes = require('./routes/whatsappRoutes');

const app = express();

// Konfigurasi CORS
app.use(cors({
    origin: config.allowCorsOrigins,
    methods: config.allowCorsMethods,
    allowedHeaders: config.allowCorsHeaders
}));

// Gunakan Morgan untuk logging request HTTP
// 'combined' adalah format log yang standar, atau 'dev' untuk output berwarna di dev
app.use(morgan('combined', { stream: logger.stream })); // <--- Tambahkan ini

app.use(express.json()); // Body parser untuk JSON

// Rute
app.use('/auth', authRoutes);
app.use('/whatsapp', whatsappRoutes);

// Basic route
app.get('/', (req, res) => {
    res.send('WhatsApp BSP API is running!');
});

// Middleware penanganan error terakhir
app.use((err, req, res, next) => {
    // Log error menggunakan Winston
    logger.error(`Error: ${err.message}`, { path: req.path, method: req.method, stack: err.stack });

    // Kirim respons error ke klien
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        error: err.message || 'An unexpected error occurred.',
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined // Tampilkan stack trace hanya di dev
    });
});


module.exports = app;