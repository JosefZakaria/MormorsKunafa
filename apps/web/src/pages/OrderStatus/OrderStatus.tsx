import React from 'react';
import { Container } from '../../components/common/Container/Container';
import './OrderStatus.css';

export const OrderStatus: React.FC = () => {
    // Mock state
    const status = 'on-time'; // 'on-time' | 'almost-ready' | 'delayed'
    const timeRemaining = '10:00';

    return (
        <div className="status-page">
            <Container className="status-container">
                <div className={`status-card status--${status}`}>
                    <h1 className="text-display-md status-title">Förbereder din beställning</h1>

                    <div className="timer-display">
                        <span className="timer-value">{timeRemaining}</span>
                        <span className="text-body-md timer-label">Minuter kvar</span>
                    </div>

                    <div className="status-steps">
                        <div className="step step--completed">
                            <span className="step-dot"></span>
                            <span>Mottagen</span>
                        </div>
                        <div className="step step--active">
                            <span className="step-dot"></span>
                            <span>Förbereder</span>
                        </div>
                        <div className="step">
                            <span className="step-dot"></span>
                            <span>Klar</span>
                        </div>
                    </div>

                    <p className="text-center status-message">
                        Vi förbereder din färska Kunafa!
                    </p>
                </div>
            </Container>
        </div>
    );
};
