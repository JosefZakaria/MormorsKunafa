import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container } from '../../components/common/Container/Container';
import { Button } from '../../components/common/Button/Button';
import './Landing.css';

import { useLanguage } from '../../contexts/LanguageContext';

const IconEatHere = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
        <path d="M7 2v20" />
        <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </svg>
);

const IconTakeaway = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
);

const IconDelivery = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
        <path d="M15 18h2" />
        <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
    </svg>
);

export const Landing: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useLanguage();

    useEffect(() => {
        sessionStorage.removeItem('orderType');
    }, []);

    return (
        <div className="landing">
            <div className="landing__hero">
                <Container className="landing__container">
                    <div className="landing__content">
                        <h1 className="text-display-lg landing__title animate-in">
                            {t('landing.title')}
                        </h1>
                        <p className="landing__subtitle animate-in delay-100">
                            {t('landing.subtitle')}
                        </p>
                    </div>
                </Container>
                <div id="start-order-button-group-placeholder">
                    <div className="landing__actions">
                        <Button
                            variant="primary"
                            size="lg"
                            className="landing__btn animate-in delay-200"
                            onClick={() => { sessionStorage.setItem('orderType', 'eat-here'); navigate('/menu'); }}
                        >
                            <span className="landing__btn-icon"><IconEatHere /></span>
                            <span className="landing__btn-label">{t('landing.eat_here')}</span>
                        </Button>
                        <Button
                            variant="primary"
                            size="lg"
                            className="landing__btn animate-in delay-300"
                            onClick={() => { sessionStorage.setItem('orderType', 'takeaway'); navigate('/menu'); }}
                        >
                            <span className="landing__btn-icon"><IconTakeaway /></span>
                            <span className="landing__btn-label">{t('landing.takeaway')}</span>
                        </Button>
                        <Button
                            variant="primary"
                            size="lg"
                            className="landing__btn animate-in delay-400"
                            onClick={() => { sessionStorage.setItem('orderType', 'delivery'); navigate('/delivery'); }}
                        >
                            <span className="landing__btn-icon"><IconDelivery /></span>
                            <span className="landing__btn-label">{t('landing.delivery')}</span>
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
