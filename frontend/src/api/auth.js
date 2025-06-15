import axios from 'axios';
import config from '../config'

const API_BASE_URL = config.API_BASE_URL; // Ganti jika backend Anda di port lain

export const registerUser = async (username, password) => {
    try {
        const response = await axios.post(`${API_BASE_URL}/auth/register`, { username, password });
        return response.data;
    } catch (error) {
        throw error.response?.data?.error || 'Registration failed';
    }
};

export const loginUser = async (username, password) => {
    try {
        const response = await axios.post(`${API_BASE_URL}/auth/login`, { username, password });
        return response.data.token; // Mengembalikan hanya token
    } catch (error) {
        throw error.response?.data?.error || 'Login failed';
    }
};