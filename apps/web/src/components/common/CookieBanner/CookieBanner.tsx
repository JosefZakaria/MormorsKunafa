import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../../contexts/LanguageContext';
import './CookieBanner.css';

const COOKIE_CONSENT_KEY = 'mormors_cookie_consent';

export const CookieBanner: React.FC = () => {
  const { t } = useLanguage();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'granted');
    setIsVisible(false);
  };

  const handleEssentialOnly = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'essential');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="cookie-banner" role="dialog" aria-label="Cookie Consent Banner">
      <div className="cookie-banner__content">
        <div className="cookie-banner__icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"></path>
            <path d="M8.5 8.5v.01"></path>
            <path d="M16 15.5v.01"></path>
            <path d="M12 12v.01"></path>
            <path d="M11 17v.01"></path>
            <path d="M7 14v.01"></path>
          </svg>
        </div>
        <div className="cookie-banner__text-container">
          <p className="cookie-banner__text">
            {t('cookie.banner_text')}{' '}
            <Link to="/privacy" className="cookie-banner__link">
              {t('cookie.learn_more')}
            </Link>
          </p>
        </div>
        <div className="cookie-banner__actions">
          <button onClick={handleEssentialOnly} className="cookie-banner__btn cookie-banner__btn--secondary">
            {t('cookie.essential_only')}
          </button>
          <button onClick={handleAcceptAll} className="cookie-banner__btn cookie-banner__btn--primary">
            {t('cookie.accept_all')}
          </button>
        </div>
      </div>
    </div>
  );
};
