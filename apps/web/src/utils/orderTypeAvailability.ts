import type { Location, OrderType } from '@shared/types';

export function locationAcceptsOrderType(location: Location, orderType: OrderType | ''): boolean {
    if (location.isPaused) return false;
    if (orderType === 'eat-here') return location.eatHereEnabled;
    if (orderType === 'takeaway') return location.takeawayEnabled;
    return false;
}

export function anyLocationAcceptsOrderType(locations: Location[], orderType: OrderType | ''): boolean {
    if (orderType !== 'eat-here' && orderType !== 'takeaway') return false;
    return locations.some((location) => locationAcceptsOrderType(location, orderType));
}
