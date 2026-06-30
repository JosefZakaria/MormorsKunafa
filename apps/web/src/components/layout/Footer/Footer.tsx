import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Footer.css';

import { useLanguage } from '../../../contexts/LanguageContext';
import { LanguageSelector } from '../../common/LanguageSelector/LanguageSelector';

const TEL_LINK = 'tel:0728682592';

export const Footer: React.FC = () => {
    const { t } = useLanguage();
    const { pathname } = useLocation();
    const hideLanguage = pathname === '/';
    const year = new Date().getFullYear();

    return (
        <footer className="footer">
            <div className="footer__content">
                <div className="footer__grid">
                    <div className="footer__brand-col">
                        <img src="/images/logo-icon.png" alt="Mormors Kunafa" className="footer__logo" />
                        <p className="footer__tagline">{t('footer.tagline')}</p>
                    </div>

                    <div className="footer__col" aria-labelledby="footer-contact">
                        <h3 id="footer-contact" className="footer__col-title">{t('footer.contact')}</h3>
                        <span className="footer__item">{t('landing.findus.address')}</span>
                        <a href={TEL_LINK} className="footer__item footer__link">{t('footer.phone')}</a>
                    </div>
                </div>
            </div>

            <div className="footer__sub">
                {!hideLanguage && (
                    <div className="footer__lang">
                        <LanguageSelector />
                    </div>
                )}
                <div className="footer__bottom-center">
                    <span className="footer__copyright">© {year} Mormors Kunafa</span>
                    <Link to="/admin/login" className="footer__admin-link" aria-label="Admin Login">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                    </Link>
                </div>
            </div>
        </footer>
    );
};
