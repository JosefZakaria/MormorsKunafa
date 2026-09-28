import { access, rm } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

export default async function teardown() {
  const runId = process.env.MK_BROWSER_RUN_ID;
  assert.match(runId ?? '', /^[a-f0-9-]{36}$/);
  const response = await fetch('http://127.0.0.1:4179/__test/shutdown', {
    method:'POST', headers:{'x-test-run':runId}, signal:AbortSignal.timeout(5000),
  });
  assert.equal(response.status,202);
  const marker=path.resolve(`.cache/security-test/browser-${runId}.complete`);
  for (let attempt=0;attempt<80;attempt++) {
    if (await access(marker).then(()=>true,()=>false)) { await rm(marker); return; }
    await setTimeout(500);
  }
  throw new Error('Synthetic server did not confirm PostgreSQL shutdown');
}
