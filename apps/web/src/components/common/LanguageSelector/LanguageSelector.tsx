import React from 'react';
import './LanguageSelector.css';

import { useLanguage } from '../../../contexts/LanguageContext';
import { Language } from '../../../translations/translations';

export const LanguageSelector: React.FC = () => {
    const { language, setLanguage } = useLanguage();

    const handleLanguageChange = (lang: Language) => {
        setLanguage(lang);
    };

    return (
        <div className="language-selector" role="group" aria-label="Language / Språk / اللغة">
            <button
                type="button"
                className={`lang-btn ${language === 'sv' ? 'active' : ''}`}
                onClick={() => handleLanguageChange('sv')}
                aria-pressed={language === 'sv'}
                aria-label="Svenska"
            >
                SV
            </button>
            <span className="lang-divider" aria-hidden="true">|</span>
            <button
                type="button"
                className={`lang-btn ${language === 'en' ? 'active' : ''}`}
                onClick={() => handleLanguageChange('en')}
                aria-pressed={language === 'en'}
                aria-label="English"
            >
                EN
            </button>
            <span className="lang-divider" aria-hidden="true">|</span>
            <button
                type="button"
                className={`lang-btn ${language === 'ar' ? 'active' : ''}`}
                onClick={() => handleLanguageChange('ar')}
                aria-pressed={language === 'ar'}
                aria-label="العربية"
            >
                AR
            </button>
        </div>
    );
};
