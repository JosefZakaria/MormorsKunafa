import React from 'react';
import './Card.css';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick }) => {
    return (
        <div
            className={`card ${className} ${onClick ? 'card--interactive' : ''}`}
            onClick={onClick}
        >
            {children}
        </div>
    );
};
