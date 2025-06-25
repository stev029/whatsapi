/* eslint-disable no-unused-vars */
import axios from 'axios';
import { jwtDecode } from 'jwt-decode'; // Impor jwtDecode
// Jika jwt-decode belum terinstal: npm install jwt-decode

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

const axiosInstance = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Flag untuk mencegah banyak refresh token request secara bersamaan
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

// --- Request Interceptor ---
axiosInstance.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('accessToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// --- Response Interceptor ---
axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Jika respons adalah 401 atau 403 DAN ini bukan request refresh token itu sendiri
        // dan ada token yang kedaluwarsa atau tidak valid
        if (
            (error.response.status === 401 || error.response.status === 403) &&
            !originalRequest._retry && // Pastikan request belum di-retry
            (error.response.data.message === 'Token expired. Please re-authenticate.' ||
                error.response.data.message === 'Token is not valid.' ||
                error.response.data.message === 'No token, authorization denied.')
        ) {
            originalRequest._retry = true; // Set flag retry

            // Jika sudah ada proses refresh yang berjalan
            if (isRefreshing) {
                // Tambahkan request asli ke antrian untuk diulang nanti
                return new Promise(function (resolve, reject) {
                    failedQueue.push({ resolve, reject });
                })
                    .then(token => {
                        originalRequest.headers['Authorization'] = 'Bearer ' + token;
                        return axiosInstance(originalRequest); // Ulangi request dengan token baru
                    })
                    .catch(err => Promise.reject(err));
            }

            isRefreshing = true; // Set flag bahwa proses refresh sedang berjalan

            const refreshToken = localStorage.getItem('refreshToken');

            // Jika tidak ada refresh token atau refresh token kedaluwarsa/tidak valid, paksa logout
            if (!refreshToken || isTokenExpired(refreshToken)) {
                // Logika logout (panggil fungsi logout dari AuthContext)
                console.error("No refresh token or refresh token expired/invalid. Forcing logout.");
                // Ini akan dipanggil setelah Promise.reject
                // Panggil logout() dari AuthContext di App.jsx atau di tempat lain yang bisa mengaksesnya
                return Promise.reject(error); // Tetap reject original error
            }

            try {
                // Kirim request ke endpoint refresh token
                const response = await axios.post(`${API_BASE_URL}/api/auth/refresh-token`, { refreshToken });

                const { token: newAccessToken, newRefreshToken } = response.data;

                // Simpan token baru
                localStorage.setItem('accessToken', newAccessToken);
                if (newRefreshToken) { // Jika backend juga mengembalikan refresh token baru
                    localStorage.setItem('refreshToken', newRefreshToken);
                }

                // Set isRefreshing menjadi false dan proses antrian request yang gagal
                isRefreshing = false;
                processQueue(null, newAccessToken);

                // Ulangi request asli dengan token baru
                originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                return axiosInstance(originalRequest);

            } catch (refreshError) {
                // Jika refresh token gagal (misalnya, refresh token juga kedaluwarsa)
                isRefreshing = false;
                processQueue(refreshError, null); // Tolak semua request di antrian dengan error
                console.error('Failed to refresh token, forcing logout:', refreshError);
                // Logika logout (panggil fungsi logout dari AuthContext)
                // Ini akan dipanggil setelah Promise.reject
                return Promise.reject(refreshError);
            }
        }
        return Promise.reject(error); // Jika error bukan karena token atau sudah di-retry
    }
);

// Helper function untuk mengecek apakah token expired (client-side)
const isTokenExpired = (token) => {
    try {
        const decoded = jwtDecode(token);
        const currentTime = Date.now() / 1000; // dalam detik
        return decoded.exp < currentTime;
    } catch (error) {
        // Jika token tidak valid atau tidak bisa didecode
        return true;
    }
};


export default axiosInstance;