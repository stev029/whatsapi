// src/models/index.js
const mongoose = require('mongoose');
const config = require('../config');

const connectDB = async () => {
    try {
        await mongoose.connect(config.mongoUri, {
            // useNewUrlParser: true, // Tidak diperlukan di Mongoose 6+
            // useUnifiedTopology: true, // Tidak diperlukan di Mongoose 6+
        });
        console.log('MongoDB Connected successfully!');
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        process.exit(1); // Keluar dari proses jika koneksi gagal
    }
};

module.exports = connectDB;