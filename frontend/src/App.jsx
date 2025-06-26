// src/App.jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import SessionsPage from './pages/SessionsPage';
import SendMessagePage from './pages/SendMessagePage';
import WebhooksPage from './pages/WebhooksPage';
import { useContext } from 'react';
import { AuthContext } from './contexts/AuthContext';
import { Toaster } from 'react-hot-toast'; // <-- Impor Toaster

const App = () => {
    const { isAuthenticated, loading } = useContext(AuthContext);

    if (loading) {
        return <p className="text-center text-lg mt-10">Loading authentication...</p>;
    }

    return (
        <>
            <Toaster
                position="top-right" // Posisi notifikasi (top-center, bottom-left, dll.)
                reverseOrder={false} // Urutan notifikasi (baru di atas atau di bawah)
                toastOptions={{
                    // Styling default untuk semua toast
                    className: '',
                    duration: 3000, // Durasi default (3 detik)
                    style: {
                        background: '#363636',
                        color: '#fff',
                    },
                    success: {
                        duration: 3000,
                        theme: {
                            primary: 'green',
                            secondary: 'black',
                        },
                    },
                    error: {
                        duration: 5000, // Error toast bisa lebih lama
                        theme: {
                            primary: 'red',
                            secondary: 'black',
                        },
                    },
                }}
            /> {/* <-- Tambahkan Toaster di sini */}
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route
                    path="/dashboard"
                    element={
                        isAuthenticated ? <DashboardPage /> : <Navigate to="/login" replace />
                    }
                >
                    <Route index element={<div className="p-4"><h2 className="text-2xl font-bold text-gray-800 mb-4">Dashboard Overview</h2><p className="text-gray-600">This is your main dashboard area. See your stats above.</p></div>} />
                    <Route path="sessions" element={<SessionsPage />} />
                    <Route path="send-message" element={<SendMessagePage />} />
                    <Route path="webhooks" element={<WebhooksPage />} />
                </Route>

                <Route path="/" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
            </Routes>
        </>
    );
};

export default App;