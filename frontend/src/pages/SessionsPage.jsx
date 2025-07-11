// src/pages/SessionsPage.jsx
import React, { useState, useEffect, useContext, useCallback } from 'react'; // Tambahkan useCallback
import axiosInstance from '../api/axios';
import { io } from 'socket.io-client';
import { AuthContext } from '../contexts/AuthContext';
import Card from '../components/Card';
import { QrCodeIcon, KeyIcon, ArrowPathIcon } from '@heroicons/react/24/outline'; // Impor ikon baru
import { QRCodeCanvas } from 'qrcode.react';
import toast from 'react-hot-toast'

const SessionsPage = () => {
    const { user, token } = useContext(AuthContext);

    const [phoneNumber, setPhoneNumber] = useState('');
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [qrCode, setQrCode] = useState(null);
    const [pairingCode, setPairingCode] = useState(null);
    const [usePairingCode, setUsePairingCode] = useState(false);
    const [webhookUrl, setWebhookUrl] = useState('');
    const [selectedSessionForWebhook, setSelectedSessionForWebhook] = useState(null);

    // State untuk mengelola QR/Pairing Code yang sedang ditampilkan
    const [displayQrCodeFor, setDisplayQrCodeFor] = useState(null); // Menyimpan nomor telepon sesi yang QR-nya sedang ditampilkan
    const [displayPairingCodeFor, setDisplayPairingCodeFor] = useState(null); // Menyimpan nomor telepon sesi yang Pairing Code-nya sedang ditampilkan

    const [floatingQrCode, setFloatingQrCode] = useState(null);
    const [floatingPairingCode, setFloatingPairingCode] = useState(null);
    const [floatingForSession, setFloatingForSession] = useState(null);
    const [floatingType, setFloatingType] = useState(null); // 'qr' atau 'pairing'

    const [, setSocket] = useState(null);

    // Fetch sessions function (menggunakan useCallback untuk stabilitas)
    const fetchSessions = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // Gunakan axiosInstance di sini
            const response = await axiosInstance.get(`/whatsapp/status`);
            setSessions(response.data);
        } catch (err) {
            console.error('Error fetching sessions:', err);
            // Penting: Jika interceptor memicu logout, AuthContext akan mengubah isAuthenticated
            // dan me-redirect. Jadi, kita tidak perlu logout() di setiap catch error.
            setError(err.response?.data?.error || 'Failed to fetch WhatsApp sessions.');
            // if (err.response && err.response.status === 401) { logout(); } // Hapus baris ini
        } finally {
            setLoading(false);
        }
    }, []); // Dependensi: hanya kosongkan jika `axiosInstance` tidak berubah

    useEffect(() => {
        if (!token || !user?.id) {
            setLoading(false); // Pastikan loading false jika tidak ada token/user
            return;
        }

        const newSocket = io(import.meta.env.VITE_API_BASE_URL, {
            auth: { token: token },
            transports: ['websocket', 'polling'],
        });
        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log('Connected to Socket.IO server');
        });

        newSocket.on('qr_code', (data) => {
            console.log('QR Code received:', data);
            if (data.userId === user.id && data.phoneNumber === floatingForSession && floatingType === 'qr') {
                setFloatingQrCode(data.qr);
                setFloatingPairingCode(null);
            } else if (data.userId === user.id && data.phoneNumber === phoneNumber && !floatingForSession) {
                setQrCode(data.qr);
                setPairingCode(null);
            }
        });

        newSocket.on('pairing_code', (data) => {
            console.log('Pairing Code received:', data);
            if (data.userId === user.id && data.phoneNumber === floatingForSession && floatingType === 'pairing') {
                setFloatingPairingCode(data.code);
                setFloatingQrCode(null);
            } else if (data.userId === user.id && data.phoneNumber === phoneNumber && !floatingForSession) {
                setPairingCode(data.code);
                setQrCode(null);
            }
        });

        newSocket.on('client_status', (data) => {
            console.log('Client status update:', data);
            if (data.userId === user.id) {
                setSessions(prevSessions => ([...prevSessions, { phoneNumber: data.phoneNumber, status: data.status, info: data.info }]));
                // Jika sesi siap atau gagal, sembunyikan QR/Pairing code yang sedang ditampilkan
                if (data.status === 'READY' || data.status === 'AUTH_FAILURE' || data.status === 'DESTROYED') {
                    if (data.phoneNumber === floatingForSession) {
                        setFloatingQrCode(null);
                        setFloatingPairingCode(null);
                        setFloatingForSession(null);
                        setFloatingType(null);
                    }
                    if (data.status === 'READY') {
                        setPhoneNumber(''); // Clear input for new session if it became ready
                    }
                    fetchSessions(); // Refresh daftar sesi
                }
            }
        });

        newSocket.on('disconnect', () => {
            console.log('Disconnected from Socket.IO server');
        });

        newSocket.on('connect_error', (err) => {
            console.error('Socket.IO connection error:', err.message, err.stack);
            setError(`Socket connection error: ${err.message}`);
        });

        fetchSessions(); // Panggil fetchSessions di sini juga

        return () => {
            newSocket.disconnect();
        };
    }, [token, user, fetchSessions, displayQrCodeFor, displayPairingCodeFor, floatingForSession, floatingType]); // Tambahkan dependensi display state dan phoneNumber

    const startSession = async () => {
        setError(null);
        if (!phoneNumber) {
            const errMsg = 'Phone number cannot be empty.';
            setError(new Error(errMsg));
            toast.error(errMsg); // <-- Toast error
            return;
        }
        try {
            setQrCode(null);
            setPairingCode(null);
            setDisplayQrCodeFor(null);
            setDisplayPairingCodeFor(null);
            await axiosInstance.post(`/whatsapp/start-session`, { phoneNumber, usePairingCode });
            toast.success(`Session initiation request sent for ${phoneNumber}. Please wait for QR/Pairing Code.`); // <-- Toast sukses
            // Tidak perlu fetchSessions di sini, biarkan socket updates yang menangani
        } catch (err) {
            console.error('Error starting session:', err.response?.data || err);
            const errMsg = err.response?.data?.error || 'Failed to start session.';
            setError(new Error(errMsg));
            toast.error(errMsg); // <-- Toast error
        }
    };

    const deleteSession = async (numberToDelete) => {
        if (window.confirm(`Are you sure you want to delete session for ${numberToDelete}?`)) {
            setError(null);
            try {
                await axiosInstance.delete(`/whatsapp/delete-session/${numberToDelete}`);
                toast.success(`Session for ${numberToDelete} deleted.`); // <-- Toast sukses
                fetchSessions();
            } catch (err) {
                console.error('Error deleting session:', err.response?.data || err);
                const errMsg = err.response?.data?.error || 'Failed to delete session.';
                setError(new Error(errMsg));
                toast.error(errMsg); // <-- Toast error
            }
        }
    };

    const handleSetWebhook = async (number) => {
        setError(null);
        try {
            const response = await axiosInstance.post(`/whatsapp/set-webhook`, {
                phoneNumber: number,
                webhookUrl: webhookUrl || null
            });
            toast.success(response.data.message); // <-- Toast sukses
            setSelectedSessionForWebhook(null);
            setWebhookUrl('');
            fetchSessions();
        } catch (err) {
            console.error('Error setting webhook URL:', err.response?.data || err);
            const errMsg = err.response?.data?.error || 'Failed to set webhook URL. Check URL format (http/https).';
            setError(new Error(errMsg));
            toast.error(errMsg); // <-- Toast error
        }
    };

    const handleWebhookInputChange = (e, sessionPhoneNumber) => {
        setSelectedSessionForWebhook(sessionPhoneNumber);
        setWebhookUrl(e.target.value);
    };

    const requestSessionCode = async (phoneNumber, usePairingCodeOption) => {
        setError(null);
        const loadingToastId = toast.loading(`Requesting ${usePairingCodeOption ? 'Pairing Code' : 'QR Code'} for ${phoneNumber}...`); // Toast loading
        try {
            setDisplayQrCodeFor(null);
            setDisplayPairingCodeFor(null);
            setFloatingQrCode(null);
            setFloatingPairingCode(null);
            setFloatingForSession(phoneNumber);
            setFloatingType(usePairingCodeOption ? 'pairing' : 'qr');

            await axiosInstance.post(`/whatsapp/request-code`, { phoneNumber, usePairingCode: usePairingCodeOption });
            toast.success(`${usePairingCodeOption ? 'Pairing Code' : 'QR Code'} request sent.`, { id: loadingToastId }); // Update loading to success
        } catch (err) {
            console.error('Error requesting session code:', err.response?.data || err);
            const errMsg = err.response?.data?.error || `Failed to request ${usePairingCodeOption ? 'pairing' : 'QR'} code.`;
            setError(new Error(errMsg));
            toast.error(errMsg, { id: loadingToastId }); // Update loading to error
            setFloatingQrCode(null);
            setFloatingPairingCode(null);
            setFloatingForSession(null);
            setFloatingType(null);
        }
    };

    if (loading) return <p className="text-center text-lg mt-10">Loading sessions...</p>;
    if (error) return <p className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mx-auto max-w-2xl mb-4" role="alert">{error.message}</p>;

    return (
        <div className="space-y-6">
            <Card title="Add New WhatsApp Session">
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <input
                        type="text"
                        placeholder="Phone Number (e.g., 6281234567890)"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="flex-grow px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            id="usePairingCode"
                            checked={usePairingCode}
                            onChange={(e) => setUsePairingCode(e.target.checked)}
                            className="form-checkbox h-5 w-5 text-blue-600"
                        />
                        <label htmlFor="usePairingCode" className="text-gray-700">Use Pairing Code</label>
                    </div>
                    <button onClick={startSession} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition duration-300 w-full md:w-auto">
                        Start Session
                    </button>
                </div>

                {(qrCode && displayQrCodeFor === null) && ( // Tampilkan QR untuk sesi baru jika belum ada display specific
                    <div className="text-center p-6 bg-blue-50 rounded-lg shadow-inner mt-6">
                        <h4 className="text-xl font-semibold text-blue-800 mb-4">Scan QR Code</h4>
                        <QRCodeCanvas value={qrCode} className="w-48 h-48 mx-auto border border-gray-300 p-2 bg-white rounded-md mb-4" />
                        <p className="text-gray-700">Open WhatsApp on your phone, go to Linked Devices, and scan this QR code.</p>
                    </div>
                )}

                {(pairingCode && displayPairingCodeFor === null) && ( // Tampilkan Pairing Code untuk sesi baru
                    <div className="text-center p-6 bg-purple-50 rounded-lg shadow-inner mt-6">
                        <h4 className="text-xl font-semibold text-purple-800 mb-4">Enter Pairing Code</h4>
                        <p className="text-4xl font-bold tracking-widest text-purple-600 bg-purple-100 p-4 rounded-lg inline-block mb-4">
                            {pairingCode}
                        </p>
                        <p className="text-gray-700">
                            Open WhatsApp on your phone, go to <span className="font-semibold">Settings &gt; Linked Devices &gt; Link a Device &gt; Link with phone number instead</span>, then enter this code.
                        </p>
                    </div>
                )}
            </Card>

            <Card title="Your Active Sessions">
                {sessions.length === 0 ? (
                    <p className="text-gray-600">No active sessions found.</p>
                ) : (
                    <ul className="space-y-4">
                        {sessions.map(session => (
                            <li key={session.phoneNumber} className="bg-gray-50 p-4 rounded-lg shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3 relative">
                                <div className="flex-grow">
                                    <span className="font-semibold text-lg text-gray-800">{session.phoneNumber}</span>
                                    <span className={`ml-3 px-2 py-1 rounded-full text-xs font-bold ${session.status === 'READY' ? 'bg-green-200 text-green-800' :
                                        session.status === 'CONNECTING' || session.status === 'QR_READY' || session.status === 'PAIRING_READY' ? 'bg-yellow-200 text-yellow-800' :
                                            'bg-red-200 text-red-800' // Untuk AUTH_FAILURE, DESTROYED, dll.
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
                                            Webhook: {session.webhookUrl}
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-col md:flex-row items-start md:items-center gap-2 mt-3 md:mt-0">
                                    {/* Tombol untuk menampilkan QR/Pairing Code ulang */}
                                    {(session.status === 'CONNECTING' || session.status === 'QR_READY' || session.status === 'PAIRING_READY') && (
                                        <>
                                            <button
                                                onClick={() => requestSessionCode(session.phoneNumber, false)}
                                                className="bg-purple-600 hover:bg-purple-700 text-white py-1 px-3 rounded-md text-sm transition duration-300 flex items-center w-full md:w-auto justify-center relative overflow-visible"
                                            >
                                                <QrCodeIcon className="h-4 w-4 mr-1" /> Show QR
                                                {floatingQrCode && floatingForSession === session.phoneNumber && floatingType === 'qr' && (
                                                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 bg-white border border-gray-300 rounded-md shadow-lg p-4 z-10">
                                                        <h5 className="text-md font-semibold text-purple-800 mb-2">Scan QR Code</h5>
                                                        <QRCodeCanvas value={floatingQrCode} level='H' className="w-48 h-48 mx-auto bg-white" />
                                                    </div>
                                                )}
                                            </button>
                                            <button
                                                onClick={() => requestSessionCode(session.phoneNumber, true)}
                                                className="bg-indigo-600 hover:bg-indigo-700 text-white py-1 px-3 rounded-md text-sm transition duration-300 flex items-center w-full md:w-auto justify-center relative overflow-visible"
                                            >
                                                <KeyIcon className="h-4 w-4 mr-1" /> Show Code
                                                {floatingPairingCode && floatingForSession === session.phoneNumber && floatingType === 'pairing' && (
                                                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 bg-white border border-gray-300 rounded-md shadow-lg p-4 z-10 text-center">
                                                        <h5 className="text-md font-semibold text-indigo-800 mb-2">Pairing Code</h5>
                                                        <p className="text-2xl font-bold tracking-widest text-indigo-600 bg-indigo-100 p-2 rounded-md inline-block">
                                                            {floatingPairingCode}
                                                        </p>
                                                    </div>
                                                )}
                                            </button>
                                            <button
                                                onClick={() => fetchSessions()}
                                                className="bg-gray-600 hover:bg-gray-700 text-white py-1 px-3 rounded-md text-sm transition duration-300 flex items-center w-full md:w-auto justify-center"
                                                title="Refresh Session Status"
                                            >
                                                <ArrowPathIcon className="h-4 w-4" />
                                            </button>
                                        </>
                                    )}
                                    <input
                                        type="text"
                                        placeholder="Webhook URL (empty to remove)"
                                        value={selectedSessionForWebhook === session.phoneNumber ? webhookUrl : (session.webhookUrl || '')}
                                        onChange={(e) => handleWebhookInputChange(e, session.phoneNumber)}
                                        className="px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm w-full md:w-64"
                                    />
                                    <button
                                        onClick={() => handleSetWebhook(session.phoneNumber)}
                                        className="bg-green-600 hover:bg-green-700 text-white py-1 px-3 rounded-md text-sm transition duration-300 w-full md:w-auto"
                                    >
                                        Set Webhook
                                    </button>
                                    <button
                                        onClick={() => deleteSession(session.phoneNumber)}
                                        className="bg-red-600 hover:bg-red-700 text-white py-1 px-3 rounded-md text-sm transition duration-300 w-full md:w-auto"
                                    >
                                        Delete
                                    </button>
                                </div>
                                {/* Tampilkan QR/Pairing Code untuk sesi tertentu */}
                                {displayQrCodeFor === session.phoneNumber && qrCode && (
                                    <div className="text-center p-6 bg-blue-50 rounded-lg shadow-inner mt-4 w-full">
                                        <h4 className="text-xl font-semibold text-blue-800 mb-4">Scan QR Code for {session.phoneNumber}</h4>
                                        <QRCodeCanvas value={qrCode} className="w-48 h-48 mx-auto border border-gray-300 p-2 bg-white rounded-md mb-4" />
                                        <p className="text-gray-700">Scan this QR to link your device.</p>
                                    </div>
                                )}
                                {displayPairingCodeFor === session.phoneNumber && pairingCode && (
                                    <div className="text-center p-6 bg-purple-50 rounded-lg shadow-inner mt-4 w-full">
                                        <h4 className="text-xl font-semibold text-purple-800 mb-4">Enter Pairing Code for {session.phoneNumber}</h4>
                                        <p className="text-4xl font-bold tracking-widest text-purple-600 bg-purple-100 p-4 rounded-lg inline-block mb-4">
                                            {pairingCode}
                                        </p>
                                        <p className="text-gray-700">Enter this code in WhatsApp linked devices.</p>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
        </div>
    );
};

export default SessionsPage;