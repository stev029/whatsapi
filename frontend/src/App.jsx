// frontend/src/App.jsx
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';

function App() {
    const [userToken, setUserToken] = useState(localStorage.getItem('token'));

    useEffect(() => {
        // Cek token saat aplikasi dimuat
        const storedToken = localStorage.getItem('token');
        if (storedToken) {
            setUserToken(storedToken);
        }
    }, []);

    const handleLogin = (token) => {
        setUserToken(token);
        localStorage.setItem('token', token); // Simpan token di localStorage
    };

    const handleLogout = () => {
        setUserToken(null);
        localStorage.removeItem('token'); // Hapus token dari localStorage
    };

    return (
        <Router>
            <Routes>
                <Route
                    path="/auth"
                    element={userToken ? <Navigate to="/dashboard" /> : <Auth onLogin={handleLogin} />}
                />
                <Route
                    path="/dashboard"
                    element={userToken ? <Dashboard userToken={userToken} onLogout={handleLogout} /> : <Navigate to="/auth" />}
                />
                <Route path="/" element={<Navigate to={userToken ? "/dashboard" : "/auth"} />} />
            </Routes>
        </Router>
    );
}

export default App;