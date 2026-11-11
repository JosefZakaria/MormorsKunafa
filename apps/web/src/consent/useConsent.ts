import { useSyncExternalStore } from 'react';
import { getConsent, isSettingsOpen, subscribeConsent } from './consent';

export function useConsent() {
  return useSyncExternalStore(subscribeConsent, getConsent, getConsent);
}

export function useConsentSettingsOpen() {
  return useSyncExternalStore(subscribeConsent, isSettingsOpen, isSettingsOpen);
}
