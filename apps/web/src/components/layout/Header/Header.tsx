import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Container } from '../../common/Container/Container';
import { Button } from '../../common/Button/Button';
import { LanguageSelector } from '../../common/LanguageSelector/LanguageSelector';
import './Header.css';

import { useLanguage } from '../../../contexts/LanguageContext';

export const Header: React.FC = () => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
    const closeMenu = () => setIsMenuOpen(false);

    const handleNavigation = (path: string) => {
        closeMenu();
        navigate(path);
    };

    return (
        <header className="header">
            <Container className="header__container">
                <Link to="/" className="header__brand" onClick={closeMenu}>
                    <img src="/images/logo-icon.png" alt="" className="header__logo-icon" />
                    <span className="header__brand-text">MORMORS KUNAFA</span>
                </Link>

                <button className="header__toggle" onClick={toggleMenu} aria-label="Toggle menu">
                    <span className={`header__hamburger ${isMenuOpen ? 'open' : ''}`}></span>
                </button>

                <nav className={`header__nav ${isMenuOpen ? 'header__nav--open' : ''}`}>
                    <LanguageSelector />
                    <Button variant="ghost" className="header__menu-btn" onClick={() => handleNavigation('/find-us')}>
                        {t('nav.hitta_hit')}
                    </Button>
                    <Button variant="ghost" className="header__menu-btn" onClick={() => handleNavigation('/menu')}>
                        {t('nav.meny')}
                    </Button>
                    <Button variant="ghost" className="header__menu-btn" onClick={() => handleNavigation('/cart')}>
                        {t('nav.cart')}
                    </Button>
                </nav>
            </Container>
        </header>
    );
};
