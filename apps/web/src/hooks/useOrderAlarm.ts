import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { Order } from '@shared/types';
import {
  checkAlarmAudio, getAlarmStatus, recoverAlarmAudio, setAlarmVolume,
  startOrderAlarm, stopAllAlarmAudio, stopOrderAlarm, subscribeAlarmStatus,
  testAlarm, stopAlarmTest,
} from '../utils/alarmPlayer';
import { normalizeAlarmVolume } from '../utils/alarmSignal';

const VOLUME_KEY = 'admin_alarm_volume_v2';
export const ALARM_PAUSE_MS = 30_000;

function readVolume(): number {
  try {
    const saved = localStorage.getItem(VOLUME_KEY);
    return saved === null ? 1 : normalizeAlarmVolume(Number(saved));
  } catch {
    return 1;
  }
}

export function useOrderAlarm(orders: Order[], enabled: boolean) {
  const player = useSyncExternalStore(subscribeAlarmStatus, getAlarmStatus);
  const [volume, setVolume] = useState(readVolume);
  const [pausedUntil, setPausedUntil] = useState<Map<string, number>>(() => new Map());
  const [now, setNow] = useState(Date.now);
  // The server's location-scoped paid/pending queue is authoritative. Loading a
  // page, receiving an SSE event or displaying a card is never acknowledgement.
  const soundingOrders = enabled ? orders.filter(order => (pausedUntil.get(order.id) ?? 0) <= now) : [];
  const activeOrder = soundingOrders.reduce<Order | null>((oldest, order) =>
    !oldest || order.createdAt < oldest.createdAt ? order : oldest, null);
  const shouldSound = activeOrder !== null;
  const pausedSeconds = enabled && !shouldSound && orders.length > 0
    ? Math.max(0, Math.ceil((Math.min(...orders.map(order => pausedUntil.get(order.id) ?? 0)) - now) / 1000))
    : 0;

  useEffect(() => { setAlarmVolume(volume); }, [volume]);

  useEffect(() => {
    if (shouldSound) startOrderAlarm();
    else stopOrderAlarm();
  }, [shouldSound]);

  useEffect(() => {
    const ids = new Set(orders.map(order => order.id));
    setPausedUntil(previous => {
      const next = new Map([...previous].filter(([id, until]) => enabled && ids.has(id) && until > now));
      return next.size === previous.size ? previous : next;
    });
  }, [orders, enabled, now]);

  useEffect(() => {
    if (pausedUntil.size === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pausedUntil.size]);

  useEffect(() => {
    const recover = () => {
      if (document.visibilityState !== 'visible') return;
      setNow(Date.now());
      recoverAlarmAudio();
    };
    // Android can interrupt an already unlocked context later in the shift.
    document.addEventListener('click', recover);
    document.addEventListener('visibilitychange', recover);
    window.addEventListener('focus', recover);
    window.addEventListener('pageshow', recover);
    const watchdog = setInterval(checkAlarmAudio, 2000);
    return () => {
      document.removeEventListener('click', recover);
      document.removeEventListener('visibilitychange', recover);
      window.removeEventListener('focus', recover);
      window.removeEventListener('pageshow', recover);
      clearInterval(watchdog);
      stopAllAlarmAudio();
    };
  }, []);

  const changeVolume = useCallback((value: number) => {
    const next = normalizeAlarmVolume(value);
    setVolume(next);
    setAlarmVolume(next);
    try { localStorage.setItem(VOLUME_KEY, String(next)); } catch { /* Works without storage. */ }
  }, []);

  const pause = () => {
    const currentTime = Date.now();
    setNow(currentTime);
    setPausedUntil(new Map(orders.map(order => [order.id, currentTime + ALARM_PAUSE_MS])));
  };

  return {
    activeOrder, orderCount: soundingOrders.length, pausedSeconds, pause,
    resume: () => setPausedUntil(new Map()),
    volume, changeVolume, test: testAlarm, stopTest: stopAlarmTest,
    audioReady: player.audioState === 'running' && !player.failed,
    isTesting: player.testing,
  };
}
