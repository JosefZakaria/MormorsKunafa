import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container } from '../../components/common/Container/Container';
import { Button } from '../../components/common/Button/Button';
import { useLanguage } from '../../contexts/LanguageContext';
import './SelectLocation.css';

export const SelectLocation: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const mode = searchParams.get('mode') || 'dine-in';
    const { t } = useLanguage();
    const [city, setCity] = useState('malmo');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        navigate(`/menu?mode=${mode}&city=${city}`);
    };

    return (
        <div className="select-location-page">
            <Container>
                <div className="select-location-card animate-in">
                    <h1 className="select-location-title">{t('select_location.title')}</h1>

                    <form onSubmit={handleSubmit} className="select-location-form">
                        <div className="form-group">
                            <select
                                className="location-select"
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                            >
                                <option value="malmo">{t('cities.malmo')}</option>
                            </select>
                        </div>

                        <Button
                            variant="primary"
                            size="lg"
                            fullWidth
                            type="submit"
                            className="select-location-btn"
                        >
                            {t('select_location.continue')}
                        </Button>
                    </form>
                </div>
            </Container>
        </div>
    );
};
