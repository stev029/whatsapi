// src/app.js
const express = require('express');
const app = express();
const whatsappRoutes = require('./routes/whatsappRoutes');
const authRoutes = require('./routes/authRoutes'); // Baru

app.use(express.json());

app.use('/auth', authRoutes); // Rute untuk pendaftaran dan login
app.use('/whatsapp', whatsappRoutes); // Rute WhatsApp, kini dilindungi

module.exports = app;