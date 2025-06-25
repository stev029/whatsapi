// src/pages/SendMessagePage.jsx
import React, { useState, useEffect, useContext } from 'react';
import axiosInstance from '../api/axios';
import { AuthContext } from '../contexts/AuthContext';
import Card from '../components/Card';
import { io } from 'socket.io-client'; // Tetap perlu socket untuk notifikasi pesan masuk

const SendMessagePage = () => {
    const { token, logout, user } = useContext(AuthContext);
    const [sessions, setSessions] = useState([]);
    const [selectedSender, setSelectedSender] = useState('');
    const [targetNumber, setTargetNumber] = useState('');
    const [messageText, setMessageText] = useState('');
    const [error, setError] = useState(null);
    const [loadingSessions, setLoadingSessions] = useState(true);

    const [, setSocket] = useState(null);

    useEffect(() => {
        if (!token || !user?.id) return;

        const newSocket = io(import.meta.env.VITE_API_BASE_URL, {
            auth: { token: token },
            transports: ['websocket', 'polling'],
        });
        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log('Connected to Socket.IO server from SendMessagePage');
        });

        newSocket.on('new_message', (data) => {
            console.log('New message received (SendMessagePage):', data);
            alert(`Pesan baru dari ${data.from} untuk ${data.phoneNumber}: ${data.message}`);
        });

        newSocket.on('disconnect', () => {
            console.log('Disconnected from Socket.IO server from SendMessagePage');
        });

        newSocket.on('connect_error', (err) => {
            console.error('Socket.IO connection error (SendMessagePage):', err.message, err.stack);
            setError(`Socket connection error: ${err.message}`);
        });

        fetchSessions();

        return () => {
            newSocket.disconnect();
        };
    }, [token, user]);


    const fetchSessions = async () => {
        setLoadingSessions(true);
        setError(null);
        try {
            const response = await axiosInstance.get(`${import.meta.env.VITE_API_BASE_URL}/whatsapp/status`);
            setSessions(response.data.filter(s => s.status === 'READY')); // Hanya tampilkan sesi READY
            console.log('Fetched sessions:', response.data)
        } catch (err) {
            console.error('Error fetching sessions:', err);
            setError(err.response?.data?.error || 'Failed to fetch WhatsApp sessions for sending messages.');
            if (err.response && err.response.status === 401) {
                logout();
            }
        } finally {
            setLoadingSessions(false);
        }
    };

    const sendMessage = async () => {
        setError(null);
        if (!selectedSender) {
            setError('Please select a sender session.');
            return;
        }

        if (!targetNumber || !messageText) {
            setError('Target number and message cannot be empty.');
            return;
        }

        // Cari sesi yang dipilih untuk mendapatkan token rahasianya
        const selectedSession = sessions.find(s => s.phoneNumber === selectedSender);
        if (!selectedSession || !selectedSession.secretToken) {
            setError('Could not find the session token. Please re-select the sender.');
            return;
        }

        try {
            await axiosInstance.post(`${import.meta.env.VITE_API_BASE_URL}/whatsapp/send-message`, {
                senderPhoneNumber: selectedSender,
                targetNumber,
                message: messageText
            }, { headers: { "X-Session-Token": selectedSession.secretToken } });
            alert('Message sent successfully!');
            setMessageText('');
            setTargetNumber('');
        } catch (err) {
            console.error('Error sending message:', err.response?.data || err);
            setError(err.response?.data?.error || 'Failed to send message.');
            if (err.response && err.response.status === 401) {
                logout();
            }
        }
    };

    if (loadingSessions) return <p className="text-center text-lg mt-10">Loading available sessions...</p>;
    if (error) return <p className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mx-auto max-w-2xl mb-4" role="alert">{error.message}</p>;

    return (
        <Card title="Send New WhatsApp Message">
            <div className="space-y-4">
                <div>
                    <label htmlFor="senderSelect" className="block text-gray-700 text-sm font-bold mb-2">Sender (Your WhatsApp Number):</label>
                    <select
                        id="senderSelect"
                        value={selectedSender}
                        onChange={(e) => setSelectedSender(e.target.value)}
                        className="block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={sessions.length === 0}
                    >
                        <option value="">{sessions.length > 0 ? 'Select a ready session' : 'No ready sessions available'}</option>
                        {sessions.map(s => (
                            <option key={s.phoneNumber} value={s.phoneNumber}>
                                {s.phoneNumber} ({s.info?.pushname || 'N/A'})
                            </option>
                        ))}
                    </select>
                    {sessions.length === 0 && (
                        <p className="text-sm text-red-500 mt-2">No active READY sessions found. Please start a session first.</p>
                    )}
                </div>
                <div>
                    <label htmlFor="targetNumber" className="block text-gray-700 text-sm font-bold mb-2">Target Number (e.g., 62812...):</label>
                    <input
                        type="text"
                        id="targetNumber"
                        placeholder="Recipient's WhatsApp Number"
                        value={targetNumber}
                        onChange={(e) => setTargetNumber(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div>
                    <label htmlFor="messageText" className="block text-gray-700 text-sm font-bold mb-2">Message:</label>
                    <textarea
                        id="messageText"
                        placeholder="Your message here..."
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        rows="6"
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                    ></textarea>
                </div>
                <button
                    onClick={sendMessage}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition duration-300"
                    disabled={!selectedSender || !targetNumber || !messageText}
                >
                    Send Message
                </button>
            </div>
        </Card>
    );
};

export default SendMessagePage;