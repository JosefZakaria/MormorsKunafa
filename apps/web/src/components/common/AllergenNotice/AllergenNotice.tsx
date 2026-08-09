import React from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import './AllergenNotice.css';

export const AllergenNotice: React.FC = () => {
  const { t } = useLanguage();

  return (
    <aside className="allergen-notice" aria-labelledby="allergen-notice-title">
      <h2 id="allergen-notice-title">{t('allergens.title')}</h2>
      <p>
        {t('allergens.before_order')}{' '}
        <a href="tel:0728682592">072-868 25 92</a>. {t('allergens.wait_for_answer')}
      </p>
    </aside>
  );
};
