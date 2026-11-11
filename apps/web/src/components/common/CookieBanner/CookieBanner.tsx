import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  acceptAll,
  acceptNecessaryOnly,
  closeConsentSettings,
  saveConsent,
} from '../../../consent/consent';
import { useConsent, useConsentSettingsOpen } from '../../../consent/useConsent';
import './CookieBanner.css';

export const CookieBanner: React.FC = () => {
  const { t } = useLanguage();
  const { pathname } = useLocation();
  const consent = useConsent();
  const settingsRequested = useConsentSettingsOpen();
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState(consent?.preferences ?? false);
  const [externalMedia, setExternalMedia] = useState(consent?.externalMedia ?? false);

  useEffect(() => {
    if (!settingsRequested) return;
    setPreferences(consent?.preferences ?? false);
    setExternalMedia(consent?.externalMedia ?? false);
    setShowDetails(true);
  }, [settingsRequested, consent]);

  if (pathname.startsWith('/admin')) return null;
  if (consent && !settingsRequested) return null;

  return (
    <div className="cookie-banner" role="dialog" aria-modal="false" aria-labelledby="cookie-banner-title">
      <div className="cookie-banner__inner">
        <h2 id="cookie-banner-title" className="cookie-banner__title">{t('cookies.title')}</h2>
        <p className="cookie-banner__text">
          {t('cookies.intro')}{' '}
          <Link to="/privacy" className="cookie-banner__link">{t('cookies.read_more')}</Link>
        </p>

        {showDetails && (
          <fieldset className="cookie-banner__options">
            <legend className="sr-only">{t('cookies.settings')}</legend>
            <label className="cookie-banner__option">
              <input type="checkbox" checked disabled />
              <span>
                <strong>{t('cookies.necessary.title')}</strong>
                <small>{t('cookies.necessary.desc')}</small>
              </span>
            </label>
            <label className="cookie-banner__option">
              <input
                type="checkbox"
                checked={preferences}
                onChange={(e) => setPreferences(e.target.checked)}
              />
              <span>
                <strong>{t('cookies.preferences.title')}</strong>
                <small>{t('cookies.preferences.desc')}</small>
              </span>
            </label>
            <label className="cookie-banner__option">
              <input
                type="checkbox"
                checked={externalMedia}
                onChange={(e) => setExternalMedia(e.target.checked)}
              />
              <span>
                <strong>{t('cookies.external.title')}</strong>
                <small>{t('cookies.external.desc')}</small>
              </span>
            </label>
          </fieldset>
        )}

        <div className="cookie-banner__actions">
          <button type="button" className="cookie-banner__btn" onClick={acceptNecessaryOnly}>
            {t('cookies.necessary_only')}
          </button>
          {showDetails ? (
            <button
              type="button"
              className="cookie-banner__btn"
              onClick={() => saveConsent({ preferences, externalMedia })}
            >
              {t('cookies.save')}
            </button>
          ) : (
            <button type="button" className="cookie-banner__btn" onClick={() => setShowDetails(true)}>
              {t('cookies.settings')}
            </button>
          )}
          <button type="button" className="cookie-banner__btn" onClick={acceptAll}>
            {t('cookies.accept_all')}
          </button>
          {consent && settingsRequested && (
            <button type="button" className="cookie-banner__close" onClick={closeConsentSettings}>
              {t('cookies.close')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
