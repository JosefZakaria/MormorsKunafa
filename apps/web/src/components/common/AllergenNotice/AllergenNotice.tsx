import React from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import './AllergenNotice.css';

export const AllergenNotice: React.FC = () => {
  const { t } = useLanguage();

  return (
    <aside className="allergen-notice" aria-labelledby="allergen-notice-title">
      <h2 id="allergen-notice-title">{t('allergens.title')}</h2>
      <p>{t('allergens.before_order')}</p>
    </aside>
  );
};
