// src/components/Sidebar.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { HomeIcon, DeviceTabletIcon, PaperAirplaneIcon, GlobeAltIcon, ArrowLeftOnRectangleIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

const Sidebar = () => {
    const { logout, user } = useContext(AuthContext);

    const navItems = [
        { name: 'Dashboard', icon: HomeIcon, path: '/dashboard' },
        { name: 'Sessions', icon: DeviceTabletIcon, path: '/dashboard/sessions' },
        { name: 'Send Message', icon: PaperAirplaneIcon, path: '/dashboard/send-message' },
        { name: 'Webhooks', icon: GlobeAltIcon, path: '/dashboard/webhooks' },
    ];

    return (
        <div className="w-64 bg-gray-900 text-white flex flex-col h-screen fixed">
            <div className="flex items-center justify-center h-20 border-b border-gray-800">
                <h1 className="text-2xl font-bold text-blue-400">WhatsApp App</h1>
            </div>
            <nav className="flex-1 px-4 py-6 space-y-2">
                {navItems.map((item) => (
                    <NavLink
                        key={item.name}
                        to={item.path}
                        className={({ isActive }) =>
                            `flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200
                            ${isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`
                        }
                        end
                    >
                        <item.icon className="h-5 w-5 mr-3" />
                        {item.name}
                    </NavLink>
                ))}
            </nav>
            <div className="p-4 border-t border-gray-800">
                {user && (
                    <div className="flex items-center text-gray-300 mb-4">
                        <UserCircleIcon className="h-6 w-6 mr-3" />
                        <span className="text-sm font-medium">{user.username}</span>
                    </div>
                )}
                <button
                    onClick={logout}
                    className="flex items-center justify-center w-full px-4 py-2 rounded-md text-sm font-medium bg-red-600 hover:bg-red-700 transition-colors duration-200 text-white"
                >
                    <ArrowLeftOnRectangleIcon className="h-5 w-5 mr-3" />
                    Logout
                </button>
            </div>
        </div>
    );
};

export default Sidebar;