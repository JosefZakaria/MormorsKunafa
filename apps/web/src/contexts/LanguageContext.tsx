import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { translations, Language } from '../translations/translations';

type LanguageContextType = {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
    dir: 'ltr' | 'rtl';
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [language, setLanguage] = useState<Language>(() => {
        const saved = localStorage.getItem('language');
        return (saved as Language) || 'sv';
    });

    useEffect(() => {
        localStorage.setItem('language', language);
    }, [language]);

    const t = (key: string): string => {
        // @ts-ignore
        return translations[language][key] || key;
    };

    const dir = language === 'ar' ? 'rtl' : 'ltr';

    useEffect(() => {
        document.documentElement.dir = dir;
        document.documentElement.lang = language;
    }, [dir, language]);

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t, dir }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};
