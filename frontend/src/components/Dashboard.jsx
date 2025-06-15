import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    addWhatsappSession,
    getWhatsappSessionsStatus,
    sendWhatsappMessage,
    deleteWhatsappSession
} from '../api/whatsapp';
import WhatsappSessionCard from './WhatsappSessionCard';
import io from 'socket.io-client';

const SOCKET_SERVER_URL = 'http://localhost:3000'; // URL backend Socket.IO

function Dashboard({ userToken, onLogout }) {
    const navigate = useNavigate();
    const [phoneNumber, setPhoneNumber] = useState('');
    const [sessions, setSessions] = useState({}); // { phoneNumber: sessionData }
    const [addSessionError, setAddSessionError] = useState('');
    const [isLoadingSessions, setIsLoadingSessions] = useState(true);
    const [socket, setSocket] = useState(null);

    // Fungsi untuk memuat ulang semua sesi dari API
    const fetchSessions = useCallback(async () => {
        try {
            setIsLoadingSessions(true);
            const data = await getWhatsappSessionsStatus();
            setSessions(data);
        } catch (err) {
            console.error('Error fetching sessions:', err);
            setAddSessionError(err.message || 'Failed to fetch sessions.');
        } finally {
            setIsLoadingSessions(false);
        }
    }, []);

    useEffect(() => {
        if (!userToken) {
            navigate('/auth'); // Redirect jika tidak ada token
            return;
        }

        fetchSessions();

        // Inisialisasi Socket.IO
        const newSocket = io(SOCKET_SERVER_URL);
        setSocket(newSocket);

        // Event listener untuk Socket.IO
        newSocket.on('connect', () => console.log('Socket.IO connected.'));
        newSocket.on('disconnect', () => console.log('Socket.IO disconnected.'));

        newSocket.on('qr_code', (data) => {
            console.log('Received QR Code:', data);
            setSessions(prevSessions => ({
                ...prevSessions,
                [data.phoneNumber]: { ...prevSessions[data.phoneNumber], status: 'QR_READY', qr: data.qr, secretToken: data.secretToken }
            }));
        });

        newSocket.on('client_status', (data) => {
            console.log('Received Client Status:', data);
            setSessions(prevSessions => ({
                ...prevSessions,
                [data.phoneNumber]: { ...prevSessions[data.phoneNumber], status: data.status, qr: null, info: data.info || prevSessions[data.phoneNumber]?.info }
            }));
            if (data.status === 'READY' && data.secretToken) {
                // Pastikan secretToken diperbarui jika belum ada atau berubah
                setSessions(prevSessions => ({
                    ...prevSessions,
                    [data.phoneNumber]: { ...prevSessions[data.phoneNumber], secretToken: data.secretToken }
                }));
            }
            if (data.status === 'DESTROYED') {
                 setSessions(prevSessions => {
                    const newSessions = { ...prevSessions };
                    delete newSessions[data.phoneNumber];
                    return newSessions;
                });
            }
        });

        newSocket.on('new_message', (data) => {
            console.log('Received New Message:', data);
            // Anda bisa menambahkan notifikasi atau UI untuk pesan baru di sini
            alert(`New message from ${data.from} on ${data.phoneNumber}: ${data.message}`);
        });

        // Cleanup Socket.IO saat komponen di-unmount
        return () => newSocket.close();
    }, [userToken, navigate, fetchSessions]); // userToken dan navigate ditambahkan ke dependencies

    const handleAddSession = async (e) => {
        e.preventDefault();
        setAddSessionError('');
        try {
            const data = await addWhatsappSession(phoneNumber);
            // Update UI dengan sesi baru (status loading, qr)
            setSessions(prevSessions => ({
                ...prevSessions,
                [data.phoneNumber]: {
                    phoneNumber: data.phoneNumber,
                    status: 'LOADING',
                    secretToken: data.sessionToken, // Ini penting
                    qr: null,
                    info: null
                }
            }));
            setPhoneNumber('');
        } catch (err) {
            console.error('Error adding session:', err);
            setAddSessionError(err.message || 'Failed to add session.');
        }
    };

    const handleDeleteSession = async (phNumber) => {
        if (window.confirm(`Are you sure you want to delete session for ${phNumber}?`)) {
            try {
                await deleteWhatsappSession(phNumber);
                setSessions(prevSessions => {
                    const newSessions = { ...prevSessions };
                    delete newSessions[phNumber];
                    return newSessions;
                });
            } catch (err) {
                alert(err.message || 'Failed to delete session.');
            }
        }
    };

    const handleSendMessageToSession = async (sessionToken, targetNumber, message) => {
        try {
            await sendWhatsappMessage(sessionToken, targetNumber, message);
            // Sukses ditangani di WhatsappSessionCard
        } catch (err) {
            console.error('Error sending message:', err);
            throw err; // Lempar kembali agar WhatsappSessionCard bisa menangani errornya
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-4xl font-extrabold text-gray-900">WhatsApp BSP Dashboard</h1>
                <button
                    onClick={onLogout}
                    className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-md transition duration-200"
                >
                    Logout
                </button>
            </header>

            <section className="bg-white p-6 rounded-lg shadow-md mb-8">
                <h2 className="text-2xl font-bold mb-4 text-gray-800">Add New WhatsApp Session</h2>
                <form onSubmit={handleAddSession} className="flex gap-4">
                    <input
                        type="text"
                        placeholder="Enter Phone Number (e.g., 628123456789)"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="flex-grow p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                    />
                    <button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-md transition duration-200"
                    >
                        Add Session
                    </button>
                </form>
                {addSessionError && <p className="text-red-500 text-sm mt-2">{addSessionError}</p>}
            </section>

            <section>
                <h2 className="text-2xl font-bold mb-4 text-gray-800">Your WhatsApp Sessions</h2>
                {isLoadingSessions ? (
                    <p className="text-gray-600 text-lg">Loading sessions...</p>
                ) : Object.keys(sessions).length === 0 ? (
                    <p className="text-gray-600 text-lg">No WhatsApp sessions found. Add one above!</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {Object.values(sessions).map(session => (
                            <WhatsappSessionCard
                                key={session.phoneNumber}
                                session={session}
                                onDeleteSession={handleDeleteSession}
                                onSendMessage={handleSendMessageToSession}
                            />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

export default Dashboard;