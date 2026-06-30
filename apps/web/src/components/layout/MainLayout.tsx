import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header/Header';
import { Footer } from './Footer/Footer';
import './MainLayout.css';

export const MainLayout: React.FC = () => {
    const { pathname } = useLocation();
    const hideFooter =
        pathname.startsWith('/menu') ||
        pathname.startsWith('/cart');
    const isLanding = pathname === '/';

    return (
        <div className="layout">
            <Header />
            <main className={`layout__main ${hideFooter ? 'layout__main--no-footer' : ''} ${isLanding ? 'layout__main--landing' : ''}`}>
                <Outlet />
            </main>
            {!hideFooter && <Footer />}
        </div>
    );
};
