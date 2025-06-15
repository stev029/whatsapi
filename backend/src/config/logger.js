const winston = require('winston');
require('winston-daily-rotate-file'); // Memuat transport rotasi file

const { combine, timestamp, printf, colorize, align } = winston.format;

// Format log kustom
const logFormat = printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level}] ${stack || message}`;
});

// Konfigurasi transportasi file untuk error
const errorFileTransport = new winston.transports.DailyRotateFile({
    filename: 'logs/error-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m', // Rotasi jika ukuran file mencapai 20MB
    maxFiles: '14d', // Simpan log selama 14 hari
    level: 'error', // Hanya log error level
});

// Konfigurasi transportasi file untuk semua info (termasuk error)
const combinedFileTransport = new winston.transports.DailyRotateFile({
    filename: 'logs/combined-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    level: 'info', // Log info, warn, error
});

const logger = winston.createLogger({
    level: 'info', // Level default
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }), // Ini penting untuk menangkap stack trace error
        logFormat
    ),
    transports: [
        // Untuk konsol (hanya di lingkungan non-produksi, atau disesuaikan)
        new winston.transports.Console({
            format: combine(
                colorize({ all: true }),
                align(),
                logFormat
            ),
            level: 'debug' // Tampilkan semua level di konsol saat debugging
        }),
        errorFileTransport,
        combinedFileTransport,
    ],
    // ExitOnError: false agar aplikasi tidak crash jika ada error pada logger itu sendiri
    exitOnError: false,
});

// Stream untuk Morgan agar bisa menggunakan logger Winston
logger.stream = {
    write: function(message, encoding) {
        // Morgan menambahkan newline di akhir, hapus untuk konsistensi dengan Winston
        logger.info(message.trim());
    },
};

module.exports = logger;