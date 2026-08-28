import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container } from '../../components/common/Container/Container';
import { useLanguage } from '../../contexts/LanguageContext';
import { locationApi } from '../../services/api';
import type { Location, OrderType } from '@shared/types';
import { needsPickupLocation, setStoredLocation } from '../../utils/selectedLocation';
import './SelectLocation.css';

export const SelectLocation: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { t } = useLanguage();
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const orderType = (sessionStorage.getItem('orderType') || '') as OrderType | '';
    const returnToCart = searchParams.get('from') === 'cart';

    useEffect(() => {
        if (orderType === 'delivery') {
            navigate('/menu', { replace: true });
            return;
        }
        if (!needsPickupLocation(orderType)) {
            navigate('/', { replace: true });
        }
    }, [navigate, orderType]);

    useEffect(() => {
        let cancelled = false;
        locationApi.getAll()
            .then((rows) => {
                if (!cancelled) setLocations(rows);
            })
            .catch(() => {
                if (!cancelled) setError(t('select_location.load_error'));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [t]);

    const handleSelect = (location: Location) => {
        setStoredLocation(location.id, location.slug);
        navigate(returnToCart ? '/cart' : '/menu');
    };

    return (
        <div className="select-location-page">
            <Container>
                <div className="select-location-card animate-in">
                    <h1 className="select-location-title">{t('select_location.title')}</h1>
                    <p className="select-location-subtitle">{t('select_location.subtitle')}</p>

                    {loading && <p className="select-location-status">{t('select_location.loading')}</p>}
                    {error && <p className="select-location-error">{error}</p>}

                    {!loading && !error && (
                        <div className="select-location-options">
                            {locations.map((location) => (
                                <button
                                    key={location.id}
                                    type="button"
                                    className="select-location-option"
                                    onClick={() => handleSelect(location)}
                                >
                                    <span className="select-location-option-name">{location.name}</span>
                                    {location.address.trim() ? (
                                        <span className="select-location-option-address">{location.address}</span>
                                    ) : null}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </Container>
        </div>
    );
};
