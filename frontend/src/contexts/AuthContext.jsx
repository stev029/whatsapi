// src/context/AuthContext.jsx
import React, { createContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom'; // Kita akan gunakan ini untuk redirect

// 1. Buat Context
export const AuthContext = createContext(null);

// Fungsi sederhana untuk mendekode JWT (HANYA UNTUK DEVELOPMENT/DEBUGGING!)
// Di produksi, validasi token harus dilakukan di backend.
const decodeJwt = (token) => {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error("Error decoding JWT:", e);
        return null;
    }
};

// 2. Buat Provider Component
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null); // Menyimpan objek user { id, username }
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true); // Untuk menunjukkan apakah sedang memuat state otentikasi
    const navigate = useNavigate(); // Hook untuk navigasi programatis

    // Efek saat token berubah
    useEffect(() => {
        const initializeAuth = async () => {
            if (token) {
                const decodedToken = decodeJwt(token);
                if (decodedToken && decodedToken.id) {
                    // Asumsi payload JWT memiliki 'id' dan 'username'
                    setUser({ id: decodedToken.id, username: decodedToken.username });
                    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`; // Set default header
                } else {
                    console.warn("Invalid token found in localStorage. Logging out.");
                    logout(); // Token tidak valid, paksa logout
                }
            } else {
                setUser(null);
                delete axios.defaults.headers.common['Authorization']; // Hapus default header
            }
            setLoading(false);
        };

        initializeAuth();
    }, [token]);

    // Fungsi Login
    const login = useCallback(async (username, password) => {
        setLoading(true);
        try {
            const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/auth/login`, { username, password });
            const newToken = response.data.token;
            localStorage.setItem('token', newToken);
            setToken(newToken); // Ini akan memicu useEffect di atas
            // setUser akan diatur oleh useEffect setelah token di set
            navigate('/dashboard'); // Arahkan ke dashboard setelah login
            return { success: true };
        } catch (error) {
            console.error('Login failed:', error.response?.data || error.message);
            setUser(null);
            setToken(null);
            localStorage.removeItem('token');
            return { success: false, error: error.response?.data?.message || 'Login failed' };
        } finally {
            setLoading(false);
        }
    }, [navigate]);

    // Fungsi Logout
    const logout = useCallback(() => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('token');
        delete axios.defaults.headers.common['Authorization']; // Hapus default header
        navigate('/login'); // Arahkan ke halaman login
    }, [navigate]);

    // Fungsi Register (jika Anda memilikinya)
    const register = useCallback(async (username, password) => {
        setLoading(true);
        try {
            const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/auth/register`, { username, password });
            const newToken = response.data.token; // Asumsi register juga mengembalikan token
            localStorage.setItem('token', newToken);
            setToken(newToken);
            navigate('/dashboard');
            return { success: true };
        } catch (error) {
            console.error('Registration failed:', error.response?.data || error.message);
            return { success: false, error: error.response?.data?.message || 'Registration failed' };
        } finally {
            setLoading(false);
        }
    }, [navigate]);

    // Nilai yang akan disediakan oleh context
    const authContextValue = {
        user,
        token,
        loading,
        login,
        logout,
        register, // Sediakan fungsi register
        isAuthenticated: !!user && !!token // Helper untuk cek status otentikasi
    };

    return (
        <AuthContext.Provider value={authContextValue}>
            {children}
        </AuthContext.Provider>
    );
};