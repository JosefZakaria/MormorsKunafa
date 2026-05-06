import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Phone, Clock } from 'lucide-react';
import './Footer.css';

import { useLanguage } from '../../../contexts/LanguageContext';
import { LanguageSelector } from '../../common/LanguageSelector/LanguageSelector';

const TEL_LINK = 'tel:0728682592';
const INSTAGRAM_URL = 'https://instagram.com/mormorskunafa';
// Google Maps embed for Karolingatan 1, 212 34 Malmö (placeholder – replace with your own embed from Google Maps → Share → Embed)
const MAP_EMBED_SRC =
    'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2250.558385447066!2d13.000932315316!3d55.595279680517!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x4653a1592751aac9%3A0x0!2sKarolingatan%201%2C%20212%2034%20Malm%C3%B6!5e0!3m2!1ssv!2sse';

export const Footer: React.FC = () => {
    const { t } = useLanguage();
    const { pathname } = useLocation();
    const hideLanguage = pathname === '/';

    return (
        <footer className="footer">
            <div className="footer__content">
                <div className="footer__grid">
                    <section className="footer__column" aria-labelledby="footer-find-us">
                        <h3 id="footer-find-us" className="footer__column-title">
                            {t('footer.find_us')}
                        </h3>
                        <div className="footer__map-wrap">
                            <iframe
                                src={MAP_EMBED_SRC}
                                title={t('footer.find_us')}
                                width="100%"
                                height="250"
                                allowFullScreen
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                                className="footer__map"
                            />
                        </div>
                    </section>
                    <section className="footer__column footer__column--middle" aria-labelledby="footer-contact-hours">
                        <h3 id="footer-contact-hours" className="footer__column-title">
                            {t('footer.contact')}
                        </h3>
                        <a href={TEL_LINK} className="footer__item footer__link">
                            <Phone className="footer__icon" aria-hidden />
                            <span className="footer__detail">{t('footer.phone')}</span>
                        </a>
                        <a
                            href={INSTAGRAM_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="footer__item footer__link"
                            aria-label="Instagram"
                        >
                            <span className="footer__icon footer__icon--instagram" aria-hidden>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
                            </span>
                            <span className="footer__detail">Instagram</span>
                        </a>
                        <h4 className="footer__subheading">{t('footer.opening_hours')}</h4>
                        <div className="footer__item">
                            <Clock className="footer__icon" aria-hidden />
                            <span className="footer__detail">{t('footer.hours')}</span>
                        </div>
                    </section>
                    <section className="footer__column" aria-labelledby="footer-about">
                        <h3 id="footer-about" className="footer__column-title">
                            {t('footer.about_us')}
                        </h3>
                        <p className="footer__about-text">{t('footer.about_text')}</p>
                    </section>
                </div>
            </div>
            {!hideLanguage && (
                <div className="footer__lang">
                    <LanguageSelector />
                </div>
            )}
            <div className="footer__sub">
                <span className="footer__copyright">{t('footer.copyright')}</span>
                <Link to="/admin/login" className="footer__admin-link" aria-label="Admin Login">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                </Link>
            </div>
        </footer>
    );
};
