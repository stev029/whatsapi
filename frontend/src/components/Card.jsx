// src/components/Card.jsx
import React from 'react';

const Card = ({ title, children, className = '' }) => {
    return (
        <div className={`bg-white p-6 rounded-lg shadow-md ${className}`}>
            {title && (
                <h3 className="text-xl font-semibold text-gray-800 mb-4 border-b pb-2">
                    {title}
                </h3>
            )}
            {children}
        </div>
    );
};

export default Card;