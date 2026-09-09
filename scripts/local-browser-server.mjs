import express from 'express';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { withTestDatabase, repositoryRoot } from './lib/local-test-database.mjs';
import { initializeSyntheticDatabase, createSyntheticApp, TEST_ORIGIN } from './lib/synthetic-api.mjs';
import { createWebVercelConfig } from '../apps/web/config/vercel-config.mjs';

const runId = process.env.MK_BROWSER_RUN_ID;
assert.match(runId ?? '', /^[a-f0-9-]{36}$/);
await withTestDatabase(async db => {
  await initializeSyntheticDatabase(db);
  const { app: backend, sessions } = await createSyntheticApp(db);
  const app=express();
  app.use((req,res,next)=>req.path.startsWith('/api/') ? backend(req,res,next) : next());
  const webConfig=createWebVercelConfig({VERCEL_ENV:'production'});
  app.use((_req,res,next)=> {
    for (const {key,value} of webConfig.headers[0].headers) res.setHeader(key,value);
    next();
  });
  // These controls exist exclusively in this local test process, never the app.
  app.post('/__test/pay/:id', (req,res) => {
    const session = sessions.get(req.params.id);
    if (!session) { res.status(404).end(); return; }
    session.status='complete'; session.payment_status='paid';
    res.json({url:session.success_url.replace('{CHECKOUT_SESSION_ID}',session.id)});
  });
  let stop;
  app.post('/__test/shutdown', (req,res) => {
    if (req.get('x-test-run') !== runId) { res.status(403).end(); return; }
    res.status(202).end();
    res.once('finish',()=>stop());
  });
  app.use(express.static(path.join(repositoryRoot,'apps/web/dist')));
  app.get('*', (_req,res)=>res.sendFile(path.join(repositoryRoot,'apps/web/dist/index.html')));
  const server = app.listen(4179,'127.0.0.1', ()=>console.log(`Synthetic test server ${TEST_ORIGIN}`));
  await new Promise((resolve,reject)=> {
    stop = ()=>{server.closeAllConnections();server.close(resolve);};
    server.once('error',reject);
    for (const signal of ['SIGINT','SIGTERM']) process.once(signal,stop);
  });
});
await writeFile(path.join(repositoryRoot,`.cache/security-test/browser-${runId}.complete`),'stopped');
