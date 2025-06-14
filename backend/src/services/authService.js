// src/services/authService.js
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Import model User
const config = require('../config');

async function registerUser(username, password) {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
        throw new Error('Username already exists.');
    }
    const newUser = new User({ username, password }); // Password akan di-hash oleh middleware pre-save
    await newUser.save();
    return { id: newUser._id, username: newUser.username }; // _id adalah ID yang dibuat MongoDB
}

async function loginUser(username, password) {
    const user = await User.findOne({ username });
    if (!user) {
        throw new Error('Invalid credentials.');
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
        throw new Error('Invalid credentials.');
    }

    const token = jwt.sign({ id: user._id, username: user.username }, config.jwtSecret, { expiresIn: '1h' });
    return { token };
}

module.exports = {
    registerUser,
    loginUser
};