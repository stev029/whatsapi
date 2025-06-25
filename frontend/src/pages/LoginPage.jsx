// src/pages/LoginPage.jsx
import React, { useState, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { Link } from 'react-router-dom'; // Untuk link ke register jika ada

const LoginPage = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState(null); // Menyimpan pesan error
    const { login, loading } = useContext(AuthContext); // Ambil fungsi login dan status loading dari AuthContext

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoginError(null); // Reset error sebelum mencoba login

        // Panggil fungsi login dari AuthContext
        const result = await login(username, password);

        if (!result.success) {
            // Jika login gagal, set pesan error
            setLoginError(result.error);
        }
        // Jika login berhasil, redirect akan ditangani oleh AuthContext (navigate('/dashboard'))
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
            <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
                <div className="text-center mb-6">
                    <h1 className="text-3xl font-bold text-gray-800 mb-2">Welcome Back!</h1>
                    <p className="text-gray-600">Sign in to manage your WhatsApp sessions.</p>
                </div>

                {loginError && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                        <strong className="font-bold">Login Failed!</strong>
                        <span className="block sm:inline ml-2">{loginError}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label htmlFor="username" className="block text-gray-700 text-sm font-semibold mb-2">Username:</label>
                        <input
                            type="text"
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="shadow-sm appearance-none border border-gray-300 rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
                            placeholder="Enter your username"
                            required
                        />
                    </div>
                    <div className="mb-6">
                        <label htmlFor="password" className="block text-gray-700 text-sm font-semibold mb-2">Password:</label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="shadow-sm appearance-none border border-gray-300 rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
                            placeholder="••••••••"
                            required
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <button
                            type="submit"
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline w-full transition duration-300 transform hover:scale-105"
                            disabled={loading} // Tombol dinonaktifkan saat proses loading
                        >
                            {loading ? 'Logging In...' : 'Login'}
                        </button>
                    </div>
                </form>

                <div className="mt-6 text-center text-gray-600">
                    Don't have an account? {' '}
                    <Link to="/register" className="font-semibold text-blue-600 hover:text-blue-800 transition duration-200">
                        Register here
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;