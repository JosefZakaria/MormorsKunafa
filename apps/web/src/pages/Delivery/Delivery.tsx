import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck } from 'lucide-react';
import { Container } from '../../components/common/Container/Container';
import { Button } from '../../components/common/Button/Button';
import { useLanguage } from '../../contexts/LanguageContext';
import './Delivery.css';

export const Delivery: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useLanguage();
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [address, setAddress] = useState('');
    const [postalCode, setPostalCode] = useState('');
    const [ort, setOrt] = useState('');
    const [phone, setPhone] = useState('');
    const cameFromCart = !!localStorage.getItem('cartReturnTo');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedFirstName = firstName.trim();
        const trimmedLastName = lastName.trim();
        const trimmedPhone = phone.trim();
        const trimmedEmail = email.trim();
        const trimmedAddress = address.trim();
        const trimmedPostalCode = postalCode.trim();
        const trimmedOrt = ort.trim();

        if (!trimmedFirstName || !trimmedLastName || !trimmedAddress || !trimmedPostalCode || !trimmedOrt || !trimmedPhone) {
            return;
        }

        const info = {
            name: `${trimmedFirstName} ${trimmedLastName}`,
            email: trimmedEmail,
            address: trimmedAddress,
            postalCode: trimmedPostalCode,
            city: trimmedOrt,
            phone: trimmedPhone,
        };
        localStorage.setItem('deliveryInfo', JSON.stringify(info));
        sessionStorage.setItem('orderType', 'delivery');

        const returnToCart = localStorage.getItem('cartReturnTo');
        if (returnToCart) {
            localStorage.removeItem('cartReturnTo');
            navigate('/cart');
        } else {
            navigate('/menu');
        }
    };

    return (
        <div className="delivery-page">
            <Container className="delivery-page__container">
                <div className="delivery-card animate-in">
                    <h1 className="delivery-title">{t('delivery.title')}</h1>
                    <p className="delivery-subtitle">{t('delivery.subtitle')}</p>

                    <div className="delivery-time">
                        <Truck className="delivery-time__icon" aria-hidden />
                        <span>{t('delivery.delivery_time')}</span>
                    </div>

                    <form onSubmit={handleSubmit} className="delivery-form">
                        <div className="delivery-form__row delivery-form__row--half">
                            <div className="form-group">
                                <label htmlFor="first-name" className="form-label">{t('delivery.first_name')}</label>
                                <input
                                    type="text"
                                    id="first-name"
                                    className="form-control"
                                    placeholder={t('delivery.first_name_placeholder')}
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="last-name" className="form-label">{t('delivery.last_name')}</label>
                                <input
                                    type="text"
                                    id="last-name"
                                    className="form-control"
                                    placeholder={t('delivery.last_name_placeholder')}
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="delivery-form__row">
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
                        </div>

                        <div className="delivery-form__row delivery-form__row--half">
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
                                <label htmlFor="ort" className="form-label">{t('delivery.ort_label')}</label>
                                <input
                                    type="text"
                                    id="ort"
                                    className="form-control"
                                    placeholder={t('delivery.ort_placeholder')}
                                    value={ort}
                                    onChange={(e) => setOrt(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="delivery-form__row">
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
                        </div>

                        <div className="delivery-form__row">
                            <div className="form-group">
                                <label htmlFor="email" className="form-label">{t('delivery.email_label')}</label>
                                <input
                                    type="email"
                                    id="email"
                                    className="form-control"
                                    placeholder={t('delivery.email_placeholder')}
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <Button variant="primary" size="lg" fullWidth type="submit" className="delivery-submit-btn">
                            {cameFromCart ? 'Gå till betalning' : t('delivery.submit_btn')}
                        </Button>
                    </form>
                </div>
            </Container>
        </div>
    );
};
