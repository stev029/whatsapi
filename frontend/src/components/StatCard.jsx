// src/components/StatCard.jsx
import React from 'react';

const StatCard = ({ title, value, icon: Icon, color = 'text-blue-500' }) => {
    return (
        <div className="bg-white p-6 rounded-lg shadow-md flex items-center justify-between">
            <div>
                <p className="text-sm font-medium text-gray-500">{title}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
            </div>
            {Icon && <Icon className={`h-10 w-10 ${color}`} />}
        </div>
    );
};

export default StatCard;