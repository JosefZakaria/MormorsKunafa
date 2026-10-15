import { getOrderIncomingAt } from '@shared/utils/scheduledTime';

/** Refresh at the next release boundary; polling remains the recovery path for overdue entries. */
export function scheduleOrderRelease(
  scheduledTimes: (string | undefined)[],
  refresh: () => void,
): () => void {
  const now = Date.now();
  const upcoming = scheduledTimes.map(getOrderIncomingAt).filter((at): at is number => at !== null && at > now);
  if (upcoming.length === 0) return () => {};
  const next = Math.min(...upcoming);
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    // Avoid the timer overflow that otherwise fires distant pre-orders immediately.
    timer = setTimeout(() => {
      if (Date.now() < next) schedule();
      else refresh();
    }, Math.min(2_147_483_647, Math.max(0, next - Date.now())));
  };
  schedule();
  return () => clearTimeout(timer);
}
