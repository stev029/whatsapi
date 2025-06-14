// src/controllers/authController.js
const authService = require('../services/authService');

exports.register = async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }
        const user = await authService.registerUser(username, password);
        res.status(201).json({ message: 'User registered successfully.', user });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }
        const { token } = await authService.loginUser(username, password);
        res.status(200).json({ message: 'Login successful.', token });
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
};