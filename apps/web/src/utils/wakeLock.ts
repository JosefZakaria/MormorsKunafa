/**
 * Utility to manage Screen Wake Lock API.
 * Prevents the device screen from dimming or locking when the app is active.
 */

let wakeLock: WakeLockSentinel | null = null;

/**
 * Requests a screen wake lock if supported by the browser.
 */
export async function requestWakeLock(): Promise<boolean> {
  if ('wakeLock' in navigator) {
    try {
      if (wakeLock && !wakeLock.released) {
        return true;
      }
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Screen Wake Lock active');
      
      // Handle sudden release (e.g. page visibility change)
      wakeLock.addEventListener('release', () => {
        console.log('Screen Wake Lock was released');
      });
      return true;
    } catch (err) {
      console.error('Failed to request Screen Wake Lock:', err);
      return false;
    }
  } else {
    console.warn('Screen Wake Lock API not supported in this browser');
    return false;
  }
}

/**
 * Releases the active screen wake lock.
 */
export async function releaseWakeLock(): Promise<void> {
  if (wakeLock) {
    try {
      await wakeLock.release();
      wakeLock = null;
    } catch (err) {
      console.error('Failed to release Screen Wake Lock:', err);
    }
  }
}
