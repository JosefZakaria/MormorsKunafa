import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { translations, Language } from '../translations/translations';
import {
    readPersistentValue,
    STORAGE_KEYS,
    STORAGE_TTL_MS,
    writePersistentValue,
} from '../utils/browserStorage';

type LanguageContextType = {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
    dir: 'ltr' | 'rtl';
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [language, setLanguage] = useState<Language>(() => {
        return readPersistentValue(
            STORAGE_KEYS.language,
            (value): value is Language => value === 'sv' || value === 'en' || value === 'ar',
            STORAGE_TTL_MS.preference,
            (raw) => raw === 'sv' || raw === 'en' || raw === 'ar' ? raw : null
        ) ?? 'sv';
    });

    useEffect(() => {
        writePersistentValue(STORAGE_KEYS.language, language, STORAGE_TTL_MS.preference);
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
