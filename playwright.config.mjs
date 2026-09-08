import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve('.cache/playwright');
process.env.MK_BROWSER_RUN_ID = randomUUID();
export default defineConfig({
  globalTeardown:'./scripts/browser-teardown.mjs',
  testDir:'./tests/browser', timeout:60000, workers:1, retries:0,
  use:{baseURL:'http://127.0.0.1:4179', trace:'retain-on-failure', serviceWorkers:'block'},
  projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 7']}}],
  webServer:{command:'node scripts/local-browser-server.mjs',url:'http://127.0.0.1:4179/api/health',reuseExistingServer:false,timeout:120000},
});
