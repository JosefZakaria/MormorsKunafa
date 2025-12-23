import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container } from '../../components/common/Container/Container';
import { Button } from '../../components/common/Button/Button';
import { useLanguage } from '../../contexts/LanguageContext';
import './Delivery.css';

export const Delivery: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useLanguage();
    const [city, setCity] = useState('');
    const [address, setAddress] = useState('');
    const [postalCode, setPostalCode] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Here we could save the details to context/localStorage
        console.log('Delivery details:', { city, address, postalCode, phone, email });
        navigate('/menu?mode=delivery');
    };

    return (
        <div className="delivery-page">
            <Container>
                <div className="delivery-card animate-in">
                    <h1 className="delivery-title">{t('delivery.title')}</h1>
                    <p className="delivery-subtitle">{t('delivery.subtitle')}</p>

                    <form onSubmit={handleSubmit} className="delivery-form">
                        <div className="form-group">
                            <label htmlFor="city" className="form-label">{t('delivery.city_label')}</label>
                            <select
                                id="city"
                                className="form-control form-select"
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                required
                            >
                                <option value="" disabled>{t('delivery.city_placeholder')}</option>
                                <option value="malmo">{t('cities.malmo')}</option>
                                <option value="goteborg">{t('cities.goteborg')}</option>
                                <option value="stockholm">{t('cities.stockholm')}</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label htmlFor="address" className="form-label">{t('delivery.address_label')}</label>
                            <input
                                type="text"
                                id="address"
                                className="form-control"
                                placeholder={t('delivery.address_placeholder')}
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="postal-code" className="form-label">{t('delivery.postal_code_label')}</label>
                            <input
                                type="text"
                                id="postal-code"
                                className="form-control"
                                placeholder={t('delivery.postal_code_placeholder')}
                                value={postalCode}
                                onChange={(e) => setPostalCode(e.target.value)}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="phone" className="form-label">{t('delivery.phone_label')}</label>
                            <input
                                type="tel"
                                id="phone"
                                className="form-control"
                                placeholder={t('delivery.phone_placeholder')}
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="email" className="form-label">{t('delivery.email_label')}</label>
                            <input
                                type="email"
                                id="email"
                                className="form-control"
                                placeholder={t('delivery.email_placeholder')}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        <Button variant="primary" size="lg" fullWidth type="submit" className="delivery-submit-btn">
                            {t('delivery.submit_btn')}
                        </Button>
                    </form>
                </div>
            </Container>
        </div>
    );
};
