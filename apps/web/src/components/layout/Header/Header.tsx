import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { Container } from '../../common/Container/Container';
import { Button } from '../../common/Button/Button';
import './Header.css';

import { useLanguage } from '../../../contexts/LanguageContext';
import { useCart } from '../../../contexts/CartContext';

export const Header: React.FC = () => {
    const { t } = useLanguage();
    const { getItemCount } = useCart();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const cartItemCount = getItemCount();
    const isOverDark = pathname === '/' || pathname.startsWith('/menu');
    const isOnCart = pathname.startsWith('/cart');

    const handleNavigation = (path: string) => {
        navigate(path);
    };

    // Presentation-only: smooth-scroll to a section on the landing page.
    const goToSection = (id: string) => {
        if (pathname !== '/') {
            navigate('/');
            window.setTimeout(() => {
                document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
            }, 120);
        } else {
            document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
        }
    };

    return (
        <header className={`header ${isOverDark ? 'header--over-hero' : ''} ${isOnCart ? 'header--on-cart' : ''}`}>
            <Container className="header__container">
                <Link to="/" className="header__brand">
                    <img src="/images/logo-icon.png" alt="" className="header__logo-icon" />
                    <span className="header__brand-text">MORMORS KUNAFA</span>
                </Link>

                <nav className="header__nav">
                    <Button variant="ghost" className="header__menu-btn" onClick={() => goToSection('hitta-hit')}>
                        {t('nav.hitta_hit')}
                    </Button>
                    <Button variant="ghost" className="header__menu-btn" onClick={() => handleNavigation('/menu')}>
                        {t('nav.meny')}
                    </Button>
                </nav>

                <Button
                    variant="ghost"
                    className="header__menu-btn header__menu-btn--cart"
                    onClick={() => handleNavigation('/cart')}
                    aria-label={t('nav.cart')}
                >
                    <ShoppingCart className="header__cart-icon" aria-hidden="true" strokeWidth={1.75} />
                    {cartItemCount > 0 && (
                        <span className="header__cart-badge">{cartItemCount}</span>
                    )}
                </Button>
            </Container>
        </header>
    );
};
