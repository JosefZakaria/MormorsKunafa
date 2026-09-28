import { spawnSync } from 'node:child_process';
import webpush from 'web-push';

// Only this synthetic test build receives a generated public key. The private
// half is discarded; provider transports remain stubbed by the browser harness.
const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', 'build:web'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_WEB_PUSH_VAPID_PUBLIC_KEY: webpush.generateVAPIDKeys().publicKey },
  windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
