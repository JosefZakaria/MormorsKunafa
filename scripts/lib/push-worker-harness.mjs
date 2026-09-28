import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Executes the shipped worker, with only browser/transport boundaries substituted.
export async function pushWorkerHarness(fetch) {
  const handlers = {}, notifications = [], navigations = [];
  vm.runInNewContext(await readFile(new URL('../../apps/web/public/sw.js', import.meta.url), 'utf8'), {
    fetch,
    self: {
      addEventListener: (name, handler) => { handlers[name] = handler; },
      registration: { showNotification: async (title, options) => {
        notifications.push(JSON.parse(JSON.stringify({ title, ...options })));
      } },
      clients: { matchAll: async () => [], openWindow: async url => navigations.push(url) },
    },
  });
  return {
    notifications, navigations,
    async push(payload = {}) {
      let finished;
      handlers.push({ data: { json: () => payload }, waitUntil: promise => { finished = promise; } });
      await finished;
    },
    async click(data) {
      let finished;
      handlers.notificationclick({ notification: { data, close() {} }, waitUntil: promise => { finished = promise; } });
      await finished;
    },
  };
}
