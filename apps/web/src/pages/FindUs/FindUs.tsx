import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Container } from '../../components/common/Container/Container';
import './FindUs.css';
import L from 'leaflet';

// Fix for default marker icon in react-leaflet which is often missing in build
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

import { useLanguage } from '../../contexts/LanguageContext';
import { formatOpeningHoursLines } from '@shared/utils/openingHours';

export const FindUs: React.FC = () => {
    const { t, language } = useLanguage();
    const hoursLines = formatOpeningHoursLines(language);
    const restaurantLocation: [number, number] = [55.58198, 13.065039];

    return (
        <div className="find-us animate-in">
            <Container>
                <div className="find-us__header">
                    <h1 className="find-us__title">{t('findus.title')}</h1>
                </div>

                <div className="find-us__info-card">
                    <div className="find-us__details">
                        <h2 className="find-us__section-title">{t('findus.address_title')}</h2>
                        <p className="find-us__text">
                            Mormors Kunafa<br />
                            Karolingatan 1<br />
                            212 34 Malmö
                        </p>
                    </div>

                    <div className="find-us__details">
                        <h2 className="find-us__section-title">{t('findus.open_hours_title')}</h2>
                        <p className="find-us__text">
                            {hoursLines.join(' · ')}
                        </p>
                    </div>
                </div>

                <button
                    className="find-us__directions-btn"
                    onClick={() => {
                        if (navigator.geolocation) {
                            navigator.geolocation.getCurrentPosition((position) => {
                                const { latitude, longitude } = position.coords;
                                const destLat = restaurantLocation[0];
                                const destLon = restaurantLocation[1];
                                window.open(`https://www.openstreetmap.org/directions?engine=graphhopper_car&route=${latitude}%2C${longitude}%3B${destLat}%2C${destLon}`, '_blank');
                            }, () => alert("Kunde inte hämta din plats. Kontrollera dina inställningar."));
                        } else {
                            alert("Din webbläsare stödjer inte geolokalisering.");
                        }
                    }}
                >
                    {t('findus.directions_btn')}
                </button>

                <div className="find-us__map-wrapper">
                    <MapContainer center={restaurantLocation} zoom={15} scrollWheelZoom={false} className="find-us__map">
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <Marker position={restaurantLocation}>
                            <Popup>
                                <strong>Mormors Kunafa</strong><br />
                                Karolingatan 1<br />
                                212 34 Malmö, Sverige
                            </Popup>
                        </Marker>
                    </MapContainer>
                </div>
            </Container>
        </div>
    );
};
