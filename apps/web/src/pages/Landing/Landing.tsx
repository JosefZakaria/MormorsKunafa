import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container } from '../../components/common/Container/Container';
import { Button } from '../../components/common/Button/Button';
import { LanguageSelector } from '../../components/common/LanguageSelector/LanguageSelector';
import { useLanguage } from '../../contexts/LanguageContext';
import { orderApi } from '../../services/api';
import type { Location, OrderType } from '@shared/types';
import { HOJA_LOCATION_ID, MOLLEVANGEN_LOCATION_ID } from '@shared/types';
import { DEFAULT_DAY_HOURS } from '@shared/utils/openingHours';
import { clearStoredLocation, needsPickupLocation } from '../../utils/selectedLocation';
import './Landing.css';

type OrderTypeFlags = {
    isPaused: boolean;
    eatHereEnabled: boolean;
    takeawayEnabled: boolean;
    deliveryEnabled: boolean;
};

const DEFAULT_ORDER_TYPE_FLAGS: OrderTypeFlags = {
    isPaused: false,
    eatHereEnabled: true,
    takeawayEnabled: true,
    deliveryEnabled: true,
};

const ORDER_TYPE_LABEL_KEY: Record<OrderType, string> = {
    'eat-here': 'landing.eat_here',
    takeaway: 'landing.takeaway',
    delivery: 'landing.delivery',
};

function isOrderTypeEnabled(type: OrderType, flags: OrderTypeFlags): boolean {
    if (flags.isPaused) return false;
    if (type === 'eat-here') return flags.eatHereEnabled;
    if (type === 'takeaway') return flags.takeawayEnabled;
    return flags.deliveryEnabled;
}

const IconEatHere = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
        <path d="M7 2v20" />
        <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </svg>
);

const IconTakeaway = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
);

const IconDelivery = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
        <path d="M15 18h2" />
        <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
    </svg>
);

const DEFAULT_HERO_DESKTOP = '/images/kunafa-ashta.jpg';
const DEFAULT_HERO_MOBILE = '/images/ny-kunafa-bild.jpg';

const FALLBACK_PLACES: Location[] = [
    {
        id: HOJA_LOCATION_ID,
        slug: 'hoja',
        name: 'Höja',
        address: 'Karolingatan 1, 212 34 Malmö',
        fulfillsDelivery: true,
        eatHereEnabled: true,
        takeawayEnabled: true,
        isPaused: false,
    },
    {
        id: MOLLEVANGEN_LOCATION_ID,
        slug: 'mollevangen',
        name: 'Möllevången',
        address: 'Bergsgatan 14, 211 34 Malmö',
        fulfillsDelivery: false,
        eatHereEnabled: true,
        takeawayEnabled: true,
        isPaused: false,
    },
];

function mapsEmbedUrl(address: string): string {
    return `https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
}

function mapsDirectionsUrl(address: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

const LOCALE_MAP: Record<string, string> = { sv: 'sv-SE', en: 'en-GB', ar: 'ar' };

export const Landing: React.FC = () => {
    const navigate = useNavigate();
    const { t, language } = useLanguage();
    const [flags, setFlags] = useState<OrderTypeFlags>(DEFAULT_ORDER_TYPE_FLAGS);
    const [heroDesktop, setHeroDesktop] = useState(DEFAULT_HERO_DESKTOP);
    const [heroMobile, setHeroMobile] = useState(DEFAULT_HERO_MOBILE);
    const [pausedPopup, setPausedPopup] = useState<OrderType | 'all' | null>(null);
    const [places, setPlaces] = useState<Location[]>(FALLBACK_PLACES);

    useEffect(() => {
        sessionStorage.removeItem('orderType');
        clearStoredLocation();
        orderApi.getPublicSettings()
            .then((settings) => {
                if (!settings) return;
                setFlags({
                    isPaused: Boolean(settings.isPaused),
                    eatHereEnabled: settings.locations?.length
                        ? settings.locations.some((location) => !location.isPaused && location.eatHereEnabled)
                        : settings.eatHereEnabled !== false,
                    takeawayEnabled: settings.locations?.length
                        ? settings.locations.some((location) => !location.isPaused && location.takeawayEnabled)
                        : settings.takeawayEnabled !== false,
                    deliveryEnabled: settings.deliveryEnabled !== false,
                });
                if (settings.heroImageDesktop) setHeroDesktop(settings.heroImageDesktop);
                if (settings.heroImageMobile) setHeroMobile(settings.heroImageMobile);
                if (settings.locations?.length) setPlaces(settings.locations);
            })
            .catch((err) => {
                console.error('Failed to fetch public settings:', err);
            });
    }, []);

    const handleSelectOrderType = (type: OrderType) => {
        if (flags.isPaused) {
            setPausedPopup('all');
            return;
        }
        if (!isOrderTypeEnabled(type, flags)) {
            setPausedPopup(type);
            return;
        }
        sessionStorage.setItem('orderType', type);
        clearStoredLocation();
        if (needsPickupLocation(type)) {
            navigate('/select-location');
            return;
        }
        navigate('/menu');
    };

    const pausedPopupMessage = pausedPopup === 'all'
        ? t('landing.orders_paused_message')
        : pausedPopup
            ? t('landing.order_type_paused_message').replace('{type}', t(ORDER_TYPE_LABEL_KEY[pausedPopup]))
            : '';

    // Lokaliserade veckodagsnamn (Jan 1 2024 = måndag) – datadrivet, undviker hårdkodning per språk.
    const weekdays = [1, 2, 3, 4, 5, 6, 7].map((d) => {
        const name = new Intl.DateTimeFormat(LOCALE_MAP[language] || 'sv-SE', { weekday: 'long' }).format(new Date(2024, 0, d));
        return name.charAt(0).toUpperCase() + name.slice(1);
    });
    const hoursLabel = `${DEFAULT_DAY_HOURS.open.slice(0, 2)}–${DEFAULT_DAY_HOURS.close.slice(0, 2)}`;
    const mappedPlaces = places.filter((place) => place.address.trim());

    return (
        <div className="landing">
            {/* HERO */}
            <section className="landing__hero" id="top">
                <picture className="landing__hero-media">
                    <source media="(max-width: 968px)" srcSet={heroMobile} />
                    <img
                        src={heroDesktop}
                        alt=""
                        className="landing__hero-img"
                    />
                </picture>
                {/* Orderknappar – samma position som tidigare (överlappar hero-kanten) */}
                <div id="start-order-button-group-placeholder">
                    <div className="landing__actions">
                        <Button
                            variant="primary"
                            size="lg"
                            className={`landing__btn animate-in delay-200${isOrderTypeEnabled('eat-here', flags) ? '' : ' landing__btn--paused'}`}
                            aria-disabled={!isOrderTypeEnabled('eat-here', flags)}
                            onClick={() => handleSelectOrderType('eat-here')}
                        >
                            <span className="landing__btn-icon"><IconEatHere /></span>
                            <span className="landing__btn-label">{t('landing.eat_here')}</span>
                        </Button>
                        <Button
                            variant="primary"
                            size="lg"
                            className={`landing__btn animate-in delay-300${isOrderTypeEnabled('takeaway', flags) ? '' : ' landing__btn--paused'}`}
                            aria-disabled={!isOrderTypeEnabled('takeaway', flags)}
                            onClick={() => handleSelectOrderType('takeaway')}
                        >
                            <span className="landing__btn-icon"><IconTakeaway /></span>
                            <span className="landing__btn-label">{t('landing.takeaway')}</span>
                        </Button>
                        <Button
                            variant="primary"
                            size="lg"
                            className={`landing__btn animate-in delay-400${isOrderTypeEnabled('delivery', flags) ? '' : ' landing__btn--paused'}`}
                            aria-disabled={!isOrderTypeEnabled('delivery', flags)}
                            onClick={() => handleSelectOrderType('delivery')}
                        >
                            <span className="landing__btn-icon"><IconDelivery /></span>
                            <span className="landing__btn-label">{t('landing.delivery')}</span>
                        </Button>
                    </div>
                </div>
            </section>

            {/* MORMORS FAVORITER */}
            <section className="landing-section favorites" id="favoriter">
                <Container>
                    <h2 className="text-display-md section-title text-center">{t('landing.favorites.title')}</h2>
                    <p className="section-intro section-intro--center">{t('landing.favorites.intro')}</p>
                    <div className="favorites__grid">
                        {[
                            { key: '1', img: '/images/finmald-kunafa.jpg' },
                            { key: '2', img: '/images/krispig-kunafa.jpg' },
                        ].map(({ key, img }) => (
                            <article className="favorites__card" key={key}>
                                <div 
                                    className="favorites__img-wrap" 
                                    onClick={() => navigate('/menu')}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            navigate('/menu');
                                        }
                                    }}
                                    aria-label={t(`landing.favorites.${key}.name`)}
                                >
                                    <img src={img} alt={t(`landing.favorites.${key}.name`)} className="favorites__img" />
                                </div>
                                <div className="favorites__row">
                                    <h3 className="favorites__name">{t(`landing.favorites.${key}.name`)}</h3>
                                    <button className="favorites__link" onClick={() => navigate('/menu')}>
                                        {t('landing.favorites.to_menu')} →
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                    <div className="favorites__cta">
                        <Button variant="primary" size="lg" onClick={() => navigate('/menu')}>
                            {t('landing.favorites.cta')}
                        </Button>
                    </div>
                </Container>
            </section>

            {/* VÅR HISTORIA */}
            <section className="landing-section story" id="historia">
                <Container className="story__container">
                    <div className="story__text">
                        <span className="section-eyebrow section-eyebrow--dark">{t('landing.story.eyebrow')}</span>
                        <h2 className="text-display-md section-title section-title--dark">{t('landing.story.title')}</h2>
                        <p className="story__p">{t('landing.story.p1')}</p>
                        <p className="story__p">{t('landing.story.p2')}</p>
                    </div>
                    <div className="story__media">
                        <div className="story__logo-wrap">
                            <img src="/images/mormor-kunafa-circle.png" alt="Mormors Kunafa" className="story__logo" />
                        </div>
                        <span className="story__badge">{t('landing.story.badge')}</span>
                    </div>
                </Container>
            </section>

            {/* OMDÖMEN */}
            <section className="landing-section reviews" id="omdomen">
                <Container>
                    <div className="reviews__head">
                        <div>
                            <span className="section-eyebrow">{t('landing.reviews.eyebrow')}</span>
                            <h2 className="text-display-md section-title">{t('landing.reviews.title')}</h2>
                        </div>
                    </div>
                    <div className="reviews__grid">
                        <div className="reviews__rating-card">
                            <span className="reviews__rating">{t('landing.reviews.rating')}</span>
                            <span className="reviews__stars">★★★★★</span>
                            <span className="reviews__rating-sub">{t('landing.reviews.rating_sub')}</span>
                        </div>
                        {['1', '2'].map((key) => (
                            <blockquote className="reviews__card" key={key}>
                                <p className="reviews__text">{t(`landing.reviews.${key}.text`)}</p>
                                <footer className="reviews__author">
                                    <span className="reviews__author-name">{t(`landing.reviews.${key}.author`)}</span>
                                    <span className="reviews__author-src">{t(`landing.reviews.${key}.source`)}</span>
                                </footer>
                            </blockquote>
                        ))}
                    </div>
                    <a
                        className="reviews__read-all"
                        href="https://www.google.com/maps/place/Mormors+kunafa+-+%D9%83%D9%86%D8%A7%D9%81%D8%A9+%D8%B3%D8%AA%D9%91%D9%8A%E2%80%AD/@55.5820588,13.0625334,17z/data=!4m8!3m7!1s0x4653a15c6b7ed9b3:0x32480d49c25c58db!8m2!3d55.5820588!4d13.0651137!9m1!1b1!16s%2Fg%2F11v3mzlyl0"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        ★★★★★ {t('landing.reviews.read_all')} →
                    </a>
                </Container>
            </section>

            {/* HITTA HIT */}
            <section className="landing-section findus" id="hitta-hit">
                <Container>
                    <span className="section-eyebrow">{t('nav.hitta_hit')}</span>
                    <h2 className="text-display-md section-title">{t('landing.findus.title')}</h2>
                    <div className="findus__grid">
                        <div className="findus__cards">
                            <div className="findus__card">
                                <h3 className="findus__card-title">{t('findus.open_hours_title')}</h3>
                                <p className="findus__hours-all">{t('landing.findus.hours_all')}</p>
                                <ul className="findus__days">
                                    {weekdays.map((day) => (
                                        <li className="findus__day" key={day}>
                                            <span>{day}</span>
                                            <span className="findus__day-time">{hoursLabel}</span>
                                        </li>
                                    ))}
                                </ul>
                                <p className="findus__note">{t('landing.findus.note')}</p>
                            </div>
                            <div className="findus__card">
                                <h3 className="findus__card-title">{t('findus.address_title')}</h3>
                                {places.map((place) => (
                                    <div className="findus__place" key={place.id}>
                                        <p className="findus__value">{place.name}</p>
                                        {place.address.trim() ? (
                                            <>
                                                <p className="findus__place-address">{place.address}</p>
                                                <a
                                                    href={mapsDirectionsUrl(place.address)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="findus__directions"
                                                >
                                                    {t('findus.directions_btn')}
                                                </a>
                                            </>
                                        ) : null}
                                    </div>
                                ))}
                                <div className="findus__info">
                                    <span className="findus__label">{t('landing.findus.phone_label')}</span>
                                    <a href="tel:0728682592" className="findus__value findus__value--link">{t('footer.phone')}</a>
                                </div>
                                <div className="findus__actions">
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="findus__order-btn"
                                        onClick={() => navigate('/menu')}
                                    >
                                        {t('landing.findus.order_btn')}
                                        <span className="landing__hero-btn-arrow" aria-hidden>→</span>
                                    </Button>
                                    <a href="tel:0728682592" className="findus__call">{t('landing.findus.call_btn')}</a>
                                </div>
                            </div>
                        </div>
                        <div className="findus__maps">
                            {mappedPlaces.map((place) => (
                                <div className="findus__map-wrap" key={place.id}>
                                    <span className="findus__map-label">{place.name}</span>
                                    <iframe
                                        src={mapsEmbedUrl(place.address)}
                                        title={`${place.name} — ${place.address}`}
                                        className="findus__map"
                                        loading="lazy"
                                        allowFullScreen
                                        referrerPolicy="no-referrer-when-downgrade"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </Container>
            </section>

            <div className="landing__language">
                <LanguageSelector />
            </div>

            {pausedPopup && (
                <div className="landing-popup-overlay animate-in" role="dialog" aria-modal="true" aria-labelledby="landing-paused-title">
                    <div className="landing-popup-content">
                        <div className="landing-popup-icon">⚠️</div>
                        <h3 id="landing-paused-title" className="text-heading-md" style={{ marginBottom: '1rem' }}>
                            {t('landing.order_type_paused_title')}
                        </h3>
                        <p className="text-body-lg" style={{ marginBottom: '2rem' }}>
                            {pausedPopupMessage}
                        </p>
                        <Button variant="primary" onClick={() => setPausedPopup(null)} fullWidth>
                            {t('landing.order_type_paused_ok')}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
