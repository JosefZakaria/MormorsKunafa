import { DateTime } from 'luxon';
import { validateScheduledOrderTime } from '../shared/utils/openingHours.js';
import { MAX_PREORDER_DAYS } from '../shared/utils/scheduledTime.js';
import { parseOrderScheduledAt } from './stockholmWallTime.js';

export function validateOrderSchedule(input: string | undefined, leadMinutes: number, now = new Date()):
  { valid: true; scheduledAt: Date | null } | { valid: false; error: string } {
  const scheduledAt = input ? parseOrderScheduledAt(input) : null;
  if (input && !scheduledAt) return { valid: false, error: 'Ogiltig förbeställningstid. Välj datum och tid igen.' };
  if (scheduledAt) {
    const lastDay = DateTime.fromJSDate(now).setZone('Europe/Stockholm').plus({ days: MAX_PREORDER_DAYS }).endOf('day');
    if (scheduledAt.getTime() <= now.getTime() || scheduledAt.getTime() > lastDay.toMillis()) {
      return { valid: false, error: `Välj en framtida tid inom ${MAX_PREORDER_DAYS} dagar.` };
    }
  }
  // Explicit offsets must not make a closed Stockholm hour look like an open
  // wall-clock hour to the shared picker validation.
  const stockholmInput = scheduledAt
    ? DateTime.fromJSDate(scheduledAt).setZone('Europe/Stockholm').toFormat("yyyy-MM-dd'T'HH:mm")
    : undefined;
  const hours = validateScheduledOrderTime(stockholmInput, leadMinutes, now);
  return hours.valid ? { valid: true, scheduledAt } : hours;
}
