import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header/Header';
import { Footer } from './Footer/Footer';
import './MainLayout.css';

export const MainLayout: React.FC = () => {
    const { pathname } = useLocation();
    const hideFooter =
        pathname.startsWith('/menu') ||
        pathname.startsWith('/cart') ||
        pathname.startsWith('/delivery');

    return (
        <div className="layout">
            <Header />
            <main className={`layout__main ${hideFooter ? 'layout__main--no-footer' : ''}`}>
                <Outlet />
            </main>
            {!hideFooter && <Footer />}
        </div>
    );
};
