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
        <div className="language-selector">
            <button
                className={`lang-btn ${language === 'sv' ? 'active' : ''}`}
                onClick={() => handleLanguageChange('sv')}
            >
                SV
            </button>
            <span className="lang-divider">|</span>
            <button
                className={`lang-btn ${language === 'en' ? 'active' : ''}`}
                onClick={() => handleLanguageChange('en')}
            >
                EN
            </button>
            <span className="lang-divider">|</span>
            <button
                className={`lang-btn ${language === 'ar' ? 'active' : ''}`}
                onClick={() => handleLanguageChange('ar')}
            >
                AR
            </button>
        </div>
    );
};
