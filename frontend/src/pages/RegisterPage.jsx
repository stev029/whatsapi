// src/pages/RegisterPage.jsx
import React, { useState, useContext } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AuthContext } from '../contexts/AuthContext'; // Anda mungkin tidak menggunakan ini untuk register, tapi ada baiknya diimpor

const RegisterPage = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [registerError, setRegisterError] = useState(null);
    const [loading, setLoading] = useState(false); // State untuk loading
    const navigate = useNavigate();

    // Opsional: Anda bisa menggunakan AuthContext.login() setelah register sukses
    // atau biarkan user login manual setelah register
    // const { login } = useContext(AuthContext);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setRegisterError(null);
        setLoading(true);

        if (password !== confirmPassword) {
            setRegisterError('Passwords do not match.');
            toast.error('Passwords do not match.'); // <-- Toast error
            setLoading(false);
            return;
        }

        try {
            const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/api/auth/register`, {
                username,
                password,
            });

            toast.success(response.data.message || 'Registration successful! Please log in.'); // <-- Toast sukses
            navigate('/login');
        } catch (error) {
            console.error('Registration failed:', error.response?.data || error);
            const errorMessage = error.response?.data?.message || 'Registration failed. Please try again.';
            setRegisterError(errorMessage);
            toast.error(errorMessage); // <-- Toast error
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
            <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
                <div className="text-center mb-6">
                    <h1 className="text-3xl font-bold text-gray-800 mb-2">Create New Account</h1>
                    <p className="text-gray-600">Join us to manage your WhatsApp sessions.</p>
                </div>

                {registerError && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                        <strong className="font-bold">Registration Failed!</strong>
                        <span className="block sm:inline ml-2">{registerError}</span>
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
                            placeholder="Choose a username"
                            required
                        />
                    </div>
                    <div className="mb-4">
                        <label htmlFor="password" className="block text-gray-700 text-sm font-semibold mb-2">Password:</label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="shadow-sm appearance-none border border-gray-300 rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
                            placeholder="••••••••"
                            required
                        />
                    </div>
                    <div className="mb-6">
                        <label htmlFor="confirmPassword" className="block text-gray-700 text-sm font-semibold mb-2">Confirm Password:</label>
                        <input
                            type="password"
                            id="confirmPassword"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="shadow-sm appearance-none border border-gray-300 rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
                            placeholder="••••••••"
                            required
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <button
                            type="submit"
                            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline w-full transition duration-300 transform hover:scale-105"
                            disabled={loading}
                        >
                            {loading ? 'Registering...' : 'Register'}
                        </button>
                    </div>
                </form>

                <div className="mt-6 text-center text-gray-600">
                    Already have an account? {' '}
                    <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-800 transition duration-200">
                        Login here
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default RegisterPage;