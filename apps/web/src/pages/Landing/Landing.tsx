import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Container } from '../../components/common/Container/Container';
import { Button } from '../../components/common/Button/Button';
import './Landing.css';

import { useLanguage } from '../../contexts/LanguageContext';

export const Landing: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useLanguage();

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

                        <div className="landing__actions">
                            <Button
                                variant="primary"
                                size="lg"
                                fullWidth
                                className="animate-in delay-200"
                                onClick={() => navigate('/select-location?mode=dine-in')}
                            >
                                {t('landing.eat_here')}
                            </Button>
                            <Button
                                variant="primary"
                                size="lg"
                                fullWidth
                                className="animate-in delay-300"
                                onClick={() => navigate('/select-location?mode=takeaway')}
                            >
                                {t('landing.takeaway')}
                            </Button>
                            <Button
                                variant="primary"
                                size="lg"
                                fullWidth
                                className="animate-in delay-400"
                                onClick={() => navigate('/delivery')}
                            >
                                {t('landing.delivery')}
                            </Button>
                        </div>


                    </div>
                </Container>
            </div>
        </div>
    );
};
