import React, { useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react'; // Install: npm install qrcode.react

function WhatsappSessionCard({ session, onDeleteSession, onSendMessage }) {
    const [messageInput, setMessageInput] = useState('');
    const [targetNumberInput, setTargetNumberInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [sendError, setSendError] = useState('');
    const [sendSuccess, setSendSuccess] = useState('');

    const statusColors = {
        'READY': 'bg-green-500',
        'QR_READY': 'bg-yellow-500',
        'LOADING': 'bg-blue-500',
        'DISCONNECTED': 'bg-red-500',
        'AUTH_FAILURE': 'bg-red-700',
        'ERROR': 'bg-gray-500',
        'STATE_OPENING': 'bg-purple-500',
        'STATE_PAIRING': 'bg-pink-500',
        'DESTROYED': 'bg-gray-400',
        'NOT_FOUND': 'bg-gray-300'
    };

    const handleSendMessage = async () => {
        if (!targetNumberInput || !messageInput) {
            setSendError('Target number and message cannot be empty.');
            return;
        }
        setIsSending(true);
        setSendError('');
        setSendSuccess('');
        try {
            await onSendMessage(session.secretToken, targetNumberInput, messageInput);
            setSendSuccess('Message sent successfully!');
            setMessageInput('');
            setTargetNumberInput('');
        } catch (err) {
            setSendError(err.message || 'Failed to send message.');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-800">
                    WA Session: <span className="text-blue-600">{session.phoneNumber}</span>
                </h3>
                <span className={`px-3 py-1 rounded-full text-white text-sm ${statusColors[session.status] || 'bg-gray-400'}`}>
                    {session.status}
                </span>
            </div>

            {session.info && (
                <p className="text-gray-600 mb-2">Connected as: <span className="font-medium">{session.info.pushname}</span></p>
            )}

            {session.qr && session.status === 'QR_READY' && (
                <div className="flex flex-col items-center my-4">
                    <p className="text-center text-gray-700 mb-2">Scan this QR Code:</p>
                    <div className="p-2 border border-gray-300 rounded-lg bg-white">
                        <QRCodeCanvas value={session.qr} size={180} level="H" />
                    </div>
                </div>
            )}

            {session.status === 'READY' && (
                <div className="mt-4 border-t pt-4">
                    <h4 className="text-lg font-semibold mb-3 text-gray-700">Send Message</h4>
                    <div className="mb-3">
                        <input
                            type="text"
                            placeholder="Target Number (e.g., 628123456789)"
                            className="w-full p-2 border rounded-md focus:ring focus:ring-blue-200"
                            value={targetNumberInput}
                            onChange={(e) => setTargetNumberInput(e.target.value)}
                        />
                    </div>
                    <div className="mb-3">
                        <textarea
                            placeholder="Your message"
                            rows="3"
                            className="w-full p-2 border rounded-md focus:ring focus:ring-blue-200"
                            value={messageInput}
                            onChange={(e) => setMessageInput(e.target.value)}
                        ></textarea>
                    </div>
                    <button
                        onClick={handleSendMessage}
                        disabled={isSending}
                        className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSending ? 'Sending...' : 'Send Message'}
                    </button>
                    {sendSuccess && <p className="text-green-500 text-sm mt-2 text-center">{sendSuccess}</p>}
                    {sendError && <p className="text-red-500 text-sm mt-2 text-center">{sendError}</p>}
                </div>
            )}

            {/* Display Session Token for debugging/copying */}
            {session.secretToken && (
                <div className="mt-4 border-t pt-4">
                    <h4 className="text-lg font-semibold text-gray-700 mb-2">Session Token</h4>
                    <p className="text-sm bg-gray-100 p-2 rounded-md break-all font-mono text-gray-700">{session.secretToken}</p>
                </div>
            )}


            <div className="mt-4 pt-4 border-t">
                <button
                    onClick={() => onDeleteSession(session.phoneNumber)}
                    className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition duration-200"
                >
                    Delete Session
                </button>
            </div>
        </div>
    );
}

export default WhatsappSessionCard;