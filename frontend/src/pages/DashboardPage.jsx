// src/pages/DashboardPage.jsx
import React, { useContext } from 'react';
import { Outlet, useLocation } from 'react-router-dom'; // Outlet untuk nested routes
import Sidebar from '../components/Sidebar';
import Card from '../components/Card';
import StatCard from '../components/StatCard';
import { AuthContext } from '../contexts/AuthContext'; // Import AuthContext
import { DeviceTabletIcon, ChatBubbleBottomCenterTextIcon, BellAlertIcon } from '@heroicons/react/24/outline'; // Ikon untuk StatCard
import axiosInstance from '../api/axios';
import { useState, useEffect } from 'react';

const DashboardPage = () => {
    const { user, token } = useContext(AuthContext); // Ambil user dari context
    const location = useLocation();
    const [stats, setStats] = useState({
        totalSessions: 0,
        readySessions: 0,
        pendingMessages: 0,
    });
    const [loadingStats, setLoadingStats] = useState(true);
    const [errorStats, setErrorStats] = useState(null);

    useEffect(() => {
        const fetchStats = async () => {
            if (!token) return;
            setLoadingStats(true);
            setErrorStats(null);
            try {
                // Asumsi ada endpoint di backend untuk statistik dashboard
                const response = await axiosInstance.get(`${import.meta.env.VITE_API_BASE_URL}/whatsapp/status`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setStats(response.data);
            } catch (err) {
                console.error('Error fetching dashboard stats:', err);
                setErrorStats('Failed to load dashboard stats.');
            } finally {
                setLoadingStats(false);
            }
        };
        fetchStats();
    }, [token]);

    const getPageTitle = () => {
        switch (location.pathname) {
            case '/dashboard': return 'Overview';
            case '/dashboard/sessions': return 'WhatsApp Sessions';
            case '/dashboard/send-message': return 'Send Message';
            case '/dashboard/webhooks': return 'Webhook Management';
            default: return 'Dashboard';
        }
    };

    return (
        <div className="flex bg-gray-100 min-h-screen">
            <Sidebar />
            <div className="flex-1 ml-64 p-8"> {/* ml-64 untuk mengkompensasi lebar sidebar */}
                <header className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-800">{getPageTitle()}</h1>
                    {user && (
                        <p className="text-gray-600 mt-1">
                            Welcome back, <span className="font-semibold text-blue-600">{user.username}</span>!
                        </p>
                    )}
                </header>

                {location.pathname === '/dashboard' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                        <StatCard
                            title="Total Sessions"
                            value={loadingStats ? '...' : stats.totalSessions}
                            icon={DeviceTabletIcon}
                            color="text-blue-500"
                        />
                        <StatCard
                            title="Ready Sessions"
                            value={loadingStats ? '...' : stats.readySessions}
                            icon={ChatBubbleBottomCenterTextIcon}
                            color="text-green-500"
                        />
                        <StatCard
                            title="Pending Messages"
                            value={loadingStats ? '...' : stats.pendingMessages}
                            icon={BellAlertIcon}
                            color="text-yellow-500"
                        />
                        {errorStats && (
                            <div className="col-span-full bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
                                {errorStats}
                            </div>
                        )}
                    </div>
                )}

                {/* Outlet akan merender komponen yang sesuai dengan nested route */}
                <Outlet />
            </div>
        </div>
    );
};

export default DashboardPage;