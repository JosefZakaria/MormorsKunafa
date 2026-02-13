import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Info } from 'lucide-react';
import { Container } from '../../components/common/Container/Container';
import { Button } from '../../components/common/Button/Button';
import { useLanguage } from '../../contexts/LanguageContext';
import './Delivery.css';

const DELIVERY_ITEMS: { key: string; keyAr: string }[] = [
    { key: 'delivery.info_lund', keyAr: 'delivery.info_lund_ar' },
    { key: 'delivery.info_malmo', keyAr: 'delivery.info_malmo_ar' },
    { key: 'delivery.info_goteborg', keyAr: 'delivery.info_goteborg_ar' },
    { key: 'delivery.info_stockholm', keyAr: 'delivery.info_stockholm_ar' },
    { key: 'delivery.info_other', keyAr: 'delivery.info_other_ar' },
];

export const Delivery: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useLanguage();
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [address, setAddress] = useState('');
    const [postalCode, setPostalCode] = useState('');
    const [ort, setOrt] = useState('');
    const [phone, setPhone] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.log('Delivery details:', { firstName, lastName, address, postalCode, ort, phone });
        navigate('/menu?mode=delivery');
    };

    return (
        <div className="delivery-page">
            <Container className="delivery-page__container">
                <div className="delivery-columns">
                    <div className="delivery-column delivery-column--form">
                        <div className="delivery-card animate-in">
                            <h1 className="delivery-title">{t('delivery.title')}</h1>
                            <p className="delivery-subtitle">{t('delivery.subtitle')}</p>

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

                                <Button variant="primary" size="lg" fullWidth type="submit" className="delivery-submit-btn">
                                    {t('delivery.submit_btn')}
                                </Button>
                            </form>
                        </div>
                    </div>

                    <div className="delivery-column delivery-column--info">
                        <div className="delivery-info">
                            <h2 className="delivery-info__title">{t('delivery.info_title')}</h2>
                            <ul className="delivery-info__list">
                                {DELIVERY_ITEMS.map(({ key, keyAr }) => (
                                    <li key={key} className="delivery-info__item">
                                        <Truck className="delivery-info__icon" aria-hidden />
                                        <span className="delivery-info__item-content">
                                            <span className="delivery-info__item-main">{t(key)}</span>
                                            <span className="delivery-info__item-sub" lang="ar">{t(keyAr)}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            <div className="delivery-info__note-box">
                                <Info className="delivery-info__note-icon" aria-hidden />
                                <p className="delivery-info__note">{t('delivery.info_note')}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </Container>
        </div>
    );
};
