import { parseApiTimestamp } from '@shared/utils/parseApiTimestamp';

export function getOrderCountdown(
  isoTime: string | undefined | null,
  now = Date.now(),
): { text: string; isOverdue: boolean } {
  const target = parseApiTimestamp(isoTime);
  if (!target) return { text: '--', isOverdue: false };

  const diff = target.getTime() - now;
  const isOverdue = diff < 0;
  const totalSeconds = Math.floor(Math.abs(diff) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];

  if (days > 0) parts.push(`${days} dygn`);
  if (days > 0 || hours > 0) parts.push(`${hours} H`);
  if (days > 0 || hours > 0 || minutes > 0) parts.push(`${minutes} M`);
  parts.push(`${seconds} S`);

  return { text: `${isOverdue ? '-' : ''}${parts.join(' ')}`, isOverdue };
}
