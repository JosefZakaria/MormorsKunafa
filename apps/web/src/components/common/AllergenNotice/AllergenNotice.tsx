import React from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import './AllergenNotice.css';

const ALLERGEN_PHONE_DISPLAY = '072-868 25 92';
const ALLERGEN_PHONE_HREF = 'tel:0728682592';

export const AllergenNotice: React.FC = () => {
  const { t } = useLanguage();

  return (
    <aside className="allergen-notice" aria-labelledby="allergen-notice-title">
      <h2 id="allergen-notice-title">{t('allergens.title')}</h2>
      <p>
        {t('allergens.before_order')}{' '}
        <a href={ALLERGEN_PHONE_HREF}>{ALLERGEN_PHONE_DISPLAY}</a>{' '}
        (<strong>{t('allergens.phone_hours')}</strong>).{' '}
        {t('allergens.wait_for_answer')}
      </p>
    </aside>
  );
};
