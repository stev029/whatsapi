// src/App.jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage'; // Mengganti Dashboard lama
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import SessionsPage from './pages/SessionsPage'; // Halaman baru
import SendMessagePage from './pages/SendMessagePage'; // Halaman baru
import WebhooksPage from './pages/WebhooksPage'; // Halaman baru
import { useContext } from 'react';
import { AuthContext } from './contexts/AuthContext';

const App = () => {
  const { isAuthenticated, loading } = useContext(AuthContext);

  if (loading) {
    return <div className="flex justify-center items-center h-screen text-xl text-gray-700">Loading authentication...</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        path="/dashboard"
        element={
          isAuthenticated ? <DashboardPage /> : <Navigate to="/login" replace />
        }
      >
        {/* Nested Routes untuk DashboardPage */}
        <Route index element={<div className="p-4"><h2 className="text-2xl font-bold text-gray-800 mb-4">Dashboard Overview</h2><p className="text-gray-600">This is your main dashboard area. See your stats above.</p></div>} /> {/* Default content untuk /dashboard */}
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="send-message" element={<SendMessagePage />} />
        <Route path="webhooks" element={<WebhooksPage />} />
      </Route>

      {/* Redirect default ke login atau dashboard berdasarkan status otentikasi */}
      <Route path="/" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
    </Routes>
  );
};

export default App;