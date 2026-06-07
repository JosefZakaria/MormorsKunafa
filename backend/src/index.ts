import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import productsRouter from './routes/products.js';
import ordersRouter from './routes/orders.js';
import adminRouter from './routes/admin.js';
import { handleStripeWebhook } from './routes/stripeWebhook.js';
import { handleSwishCallback } from './routes/swishCallback.js';
import { getPublicWebAppUrlDiagnostics } from './utils/publicWebAppUrl.js';
import { configureWebPush, isWebPushConfigured } from './services/pushNotifications.js';

const app = express();
configureWebPush();

function allowedFrontendOrigins(): string[] {
  const defaults = ['https://mormorskunafa.se', 'https://www.mormorskunafa.se'];
  const fromEnv = [
    process.env.FRONTEND_URL,
    process.env.FRONTEND_URLS,
    process.env.PUBLIC_WEB_APP_URL,
  ]
    .filter(Boolean)
    .join(',');

  const origins = new Set<string>(defaults);
  for (const part of fromEnv.split(',')) {
    const trimmed = part.trim().replace(/\/$/, '');
    if (trimmed) origins.add(trimmed);
  }
  return [...origins];
}

const frontendOrigins = allowedFrontendOrigins();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || frontendOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      console.warn('[CORS] Blocked origin:', origin, 'Allowed:', frontendOrigins);
      callback(null, false);
    },
    credentials: true,
  })
);

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  void handleStripeWebhook(req, res);
});
app.post('/api/swish/callback', express.json(), (req, res) => {
  void handleSwishCallback(req, res);
});
app.use(express.json());

app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/admin', adminRouter);

app.get('/api/health', (_req, res) => {
  const hasSupabase = Boolean(
    process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
  const hasJwt = Boolean(process.env.JWT_SECRET?.trim());
  if (!hasSupabase) {
    res.status(503).json({
      ok: false,
      error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in deployment environment',
    });
    return;
  }
  const web = getPublicWebAppUrlDiagnostics();
  res.json({
    ok: true,
    supabase: true,
    jwtConfigured: hasJwt,
    webPushConfigured: isWebPushConfigured(),
    stripeWebhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
    publicWebAppUrl: web.effectiveUrl,
    deployWarnings: web.warnings,
  });
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = Number(process.env.PORT) || 3001;
  app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
  });
}

export default app;
