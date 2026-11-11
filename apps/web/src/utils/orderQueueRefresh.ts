/**
 * One request at a time for a queue. Wake/SSE/manual refreshes during a request
 * schedule one follow-up instead of discarding a useful response or racing it.
 * Each queue gets its own refresher, so secondary lists cannot delay new orders.
 * minIntervalMs skips unforced refreshes until that long after the last successful load.
 */
export function createOrderQueueRefresh<T>(
  load: () => Promise<T>,
  apply: (value: T) => void,
  reportError: (error: unknown) => void,
  minIntervalMs = 0,
) {
  let disposed = false;
  let loadedAt = -Infinity;
  let refreshAgain = false;
  let inFlight: Promise<void> | null = null;

  const run = async () => {
    do {
      refreshAgain = false;
      try {
        const value = await load();
        loadedAt = Date.now();
        if (!disposed) apply(value);
      } catch (error) {
        loadedAt = -Infinity; // retry on the next poll
        if (!disposed) reportError(error);
      }
    } while (refreshAgain && !disposed);
  };

  return {
    refresh(force = false): Promise<void> {
      if (disposed) return Promise.resolve();
      if (!force && !inFlight && Date.now() - loadedAt < minIntervalMs) return Promise.resolve();
      if (inFlight) {
        if (force) refreshAgain = true;
        return inFlight;
      }
      inFlight = run().finally(() => { inFlight = null; });
      return inFlight;
    },
    dispose(): void {
      disposed = true;
      refreshAgain = false;
    },
  };
}
