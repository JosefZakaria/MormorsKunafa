import React from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../../common/Container/Container';
import './Footer.css';

import { useLanguage } from '../../../contexts/LanguageContext';

export const Footer: React.FC = () => {
    const { t } = useLanguage();
    return (
        <footer className="footer">
            <Container>
                <div className="footer__content">
                    <div className="footer__brand">
                        <div className="footer__logo-wrapper">
                            <img src="/images/logo-footer.png" alt="" className="footer__logo-icon" />
                            <h3 className="footer__title">MORMORS KUNAFA</h3>
                        </div>
                        <p className="footer__text">{t('footer.tagline')}</p>
                    </div>
                    <div className="footer__links">
                        <span className="footer__copyright">{t('footer.copyright')}</span>
                        <Link to="/admin/login" className="footer__admin-link" aria-label="Admin Login">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                        </Link>
                    </div>
                </div>
            </Container>
        </footer>
    );
};
