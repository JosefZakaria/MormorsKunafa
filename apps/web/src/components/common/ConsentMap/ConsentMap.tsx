import React, { useState } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getConsent, saveConsent } from '../../../consent/consent';
import { useConsent } from '../../../consent/useConsent';

interface ConsentMapProps {
  src: string;
  title: string;
  className?: string;
  directionsUrl: string;
}

/** Google Maps embed that only loads after consent to external media. */
export const ConsentMap: React.FC<ConsentMapProps> = ({ src, title, className, directionsUrl }) => {
  const { t } = useLanguage();
  const consent = useConsent();
  const [revealedOnce, setRevealedOnce] = useState(false);

  if (consent?.externalMedia || revealedOnce) {
    return (
      <iframe
        src={src}
        title={title}
        className={className}
        loading="lazy"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
      />
    );
  }

  const showMap = () => {
    const current = getConsent();
    // Remember the choice only if the visitor has already answered the banner.
    if (current) saveConsent({ preferences: current.preferences, externalMedia: true });
    else setRevealedOnce(true);
  };

  return (
    <div className={`${className ?? ''} consent-map-placeholder`}>
      <p>{t('cookies.map.blocked')}</p>
      <button type="button" className="consent-map-placeholder__btn" onClick={showMap}>
        {t('cookies.map.show')}
      </button>
      <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="consent-map-placeholder__link">
        {t('cookies.map.open_external')}
      </a>
    </div>
  );
};
