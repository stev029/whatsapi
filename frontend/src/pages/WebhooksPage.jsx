// src/pages/WebhooksPage.jsx
import React, { useState, useEffect, useContext } from 'react';
import axiosInstance from '../api/axios';
import { AuthContext } from '../contexts/AuthContext';
import Card from '../components/Card';
import { io } from 'socket.io-client'; // Tetap perlu socket untuk notifikasi

const WebhooksPage = () => {
    const { token, logout, user } = useContext(AuthContext);
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [webhookUrl, setWebhookUrl] = useState('');
    const [selectedSessionForWebhook, setSelectedSessionForWebhook] = useState(null);

    const [, setSocket] = useState(null);

    useEffect(() => {
        if (!token || !user?.id) return;

        const newSocket = io(import.meta.env.VITE_API_BASE_URL, {
            auth: { token: token },
            transports: ['websocket', 'polling'],
        });
        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log('Connected to Socket.IO server from WebhooksPage');
        });

        newSocket.on('new_message', (data) => {
            console.log('New message received (WebhooksPage):', data);
            alert(`Pesan baru dari ${data.from} untuk ${data.phoneNumber}: ${data.message}`);
        });

        newSocket.on('disconnect', () => {
            console.log('Disconnected from Socket.IO server from WebhooksPage');
        });

        newSocket.on('connect_error', (err) => {
            console.error('Socket.IO connection error (WebhooksPage):', err.message, err.stack);
            setError(`Socket connection error: ${err.message}`);
        });

        fetchSessions();

        return () => {
            newSocket.disconnect();
        };
    }, [token, user]);

    const fetchSessions = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await axiosInstance.get(`${import.meta.env.VITE_API_BASE_URL}/whatsapp/status`);
            setSessions(response.data);
        } catch (err) {
            console.error('Error fetching sessions:', err);
            setError(err.response?.data?.error || 'Failed to fetch WhatsApp sessions.');
            if (err.response && err.response.status === 401) {
                logout();
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSetWebhook = async (number) => {
        setError(null);
        if (!webhookUrl) {
            if (!window.confirm('Are you sure you want to remove the webhook URL for this session?')) {
                return;
            }
        }
        try {
            const response = await axiosInstance.post(`${import.meta.env.VITE_API_BASE_URL}/whatsapp/set-webhook`, {
                phoneNumber: number,
                webhookUrl: webhookUrl || null
            });
            alert(response.data.message);
            setSelectedSessionForWebhook(null); // Reset setelah setting webhook
            setWebhookUrl(''); // Bersihkan input
            fetchSessions();
        } catch (err) {
            console.error('Error setting webhook URL:', err.response?.data || err);
            setError(err.response?.data?.error || 'Failed to set webhook URL. Check URL format (http/https).');
            if (err.response && err.response.status === 401) {
                logout();
            }
        }
    };

    const handleWebhookInputChange = (e, sessionPhoneNumber) => {
        setSelectedSessionForWebhook(sessionPhoneNumber);
        setWebhookUrl(e.target.value);
    };

    if (loading) return <p className="text-center text-lg mt-10">Loading sessions for webhook management...</p>;
    if (error) return <p className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mx-auto max-w-2xl mb-4" role="alert">{error.message}</p>;

    return (
        <Card title="Manage Session Webhooks">
            {sessions.length === 0 ? (
                <p className="text-gray-600">No active sessions found to manage webhooks.</p>
            ) : (
                <ul className="space-y-4">
                    {sessions.map(session => (
                        <li key={session.phoneNumber} className="bg-gray-50 p-4 rounded-lg shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                            <div className="flex-grow">
                                <span className="font-semibold text-lg text-gray-800">{session.phoneNumber}</span>
                                <span className={`ml-3 px-2 py-1 rounded-full text-xs font-bold ${
                                    session.status === 'READY' ? 'bg-green-200 text-green-800' :
                                    session.status === 'CONNECTING' ? 'bg-yellow-200 text-yellow-800' :
                                    session.status === 'QR_READY' || session.status === 'PAIRING_READY' ? 'bg-indigo-200 text-indigo-800' :
                                    'bg-red-200 text-red-800'
                                }`}>
                                    {session.status}
                                </span>
                                {session.info && (
                                    <span className="block text-sm text-gray-600 mt-1">
                                        ({session.info.pushname || 'N/A'} - {session.info.number || 'N/A'})
                                    </span>
                                )}
                                {session.webhookUrl && (
                                    <span className="block text-xs text-blue-600 mt-1 truncate max-w-full">
                                        Current Webhook: <span className="font-mono">{session.webhookUrl}</span>
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-col md:flex-row items-start md:items-center gap-2 mt-3 md:mt-0">
                                <input
                                    type="text"
                                    placeholder="Webhook URL (empty to remove)"
                                    value={selectedSessionForWebhook === session.phoneNumber ? webhookUrl : (session.webhookUrl || '')}
                                    onChange={(e) => handleWebhookInputChange(e, session.phoneNumber)}
                                    className="px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm w-full md:w-64"
                                />
                                <button
                                    onClick={() => handleSetWebhook(session.phoneNumber)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded-md text-sm transition duration-300 w-full md:w-auto"
                                >
                                    Set Webhook
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
};

export default WebhooksPage;