// src/context/AuthContext.jsx
import React, { createContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
<<<<<<< HEAD
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
=======
import axiosInstance from '../api/axios';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode'; // Impor jwtDecode

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    // Fungsi untuk mengecek validitas token
    const validateToken = useCallback(() => {
        const storedToken = localStorage.getItem('accessToken');
        const storedRefreshToken = localStorage.getItem('refreshToken');

        if (storedToken && storedRefreshToken) {
            try {
                const decodedToken = jwtDecode(storedToken);
                const currentTime = Date.now() / 1000;

                // Cek apakah access token masih valid
                if (decodedToken.exp > currentTime) {
                    setToken(storedToken);
                    setUser({ id: decodedToken.id, username: decodedToken.username });
                    setIsAuthenticated(true);
                    return true;
                } else {
                    // Access token expired, coba refresh
                    console.log('Access token expired, attempting to refresh...');
                    return false; // Beritahu bahwa token kedaluwarsa, perlu refresh
                }
            } catch (error) {
                console.error('Invalid access token:', error);
                // Token tidak valid, hapus dan paksa login
                clearAuthData();
                return false;
            }
        }
        clearAuthData();
        return false;
    }, []);

    const clearAuthData = useCallback(() => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        setUser(null);
        setToken(null);
        setIsAuthenticated(false);
    }, []);

    // Fungsi logout yang akan dipanggil dari mana saja
    const logout = useCallback(async () => {
        setLoading(true);
        try {
            // Panggil endpoint logout di backend
            await axiosInstance.post(`${import.meta.env.VITE_API_BASE_URL}/api/auth/logout`, { userId: user?.id }, {
                headers: { Authorization: `Bearer ${token}` } // Kirim token jika masih ada
            });
        } catch (error) {
            console.error('Logout failed on server:', error);
            // Tetap lanjutkan logout di frontend meskipun backend error
        } finally {
            clearAuthData();
            navigate('/login');
            setLoading(false);
        }
    }, [clearAuthData, navigate, user, token]);

    // Fungsi login
    const login = async (username, password) => {
        setLoading(true);
        try {
            const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/api/auth/login`, { username, password });
            const { token: accessToken, refreshToken, user: userData } = response.data;

            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('refreshToken', refreshToken);
            setToken(accessToken);
            setUser(userData);
            setIsAuthenticated(true);
            navigate('/dashboard');
            return { success: true };
        } catch (error) {
            console.error('Login failed:', error.response?.data?.message || error.message);
            clearAuthData(); // Pastikan data auth dibersihkan jika login gagal
            return { success: false, error: error.response?.data?.message || 'Login failed. Please try again.' };
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        const isValid = validateToken();
        if (!isValid && localStorage.getItem('refreshToken')) {
            // Jika access token expired tapi refresh token ada, kita bisa mencoba refresh token
            // Interceptor Axios akan menangani ini saat request pertama kali
            // Tidak perlu memanggil refresh di sini, biarkan interceptor yang bekerja
            // Kita hanya perlu memastikan state AuthContext benar (isAuthenticated=false)
            // agar request berikutnya memicu interceptor
            setIsAuthenticated(false);
            setUser(null);
            setToken(null);
        }
        setLoading(false);
    }, [validateToken]);

    // Expose logout function globally via window for interceptor
    useEffect(() => {
        // Ini adalah cara untuk "menginjeksi" fungsi logout ke dalam konteks global
        // sehingga interceptor di axios.js bisa memanggilnya
        window.forceLogout = logout;
        return () => {
            delete window.forceLogout;
        };
    }, [logout]);


    return (
        <AuthContext.Provider value={{ user, token, isAuthenticated, loading, login, logout }}>
>>>>>>> v1
            {children}
        </AuthContext.Provider>
    );
};