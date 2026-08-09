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
import { assertJwtConfiguration, requireCsrfProtection } from './middleware/auth.js';
import { assertRateLimitConfiguration, createRateLimiter } from './middleware/rateLimit.js';

const app = express();
// Vercel overwrites the forwarding chain; use exactly its nearest proxy hop.
app.set('trust proxy', process.env.VERCEL ? 1 : false);
assertJwtConfiguration();
assertRateLimitConfiguration();
configureWebPush();

const paymentCallbackLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  prefix: 'payment-callback',
});

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

// Security headers middleware
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

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

app.post('/api/stripe/webhook', paymentCallbackLimiter, express.raw({ type: 'application/json' }), (req, res) => {
  void handleStripeWebhook(req, res);
});
app.post('/api/swish/callback', paymentCallbackLimiter, express.json(), (req, res) => {
  void handleSwishCallback(req, res);
});
app.use(express.json());

app.use('/api/admin', requireCsrfProtection);
app.use('/api/orders/admin', requireCsrfProtection);
app.use('/api/products', requireCsrfProtection);
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/admin', adminRouter);

app.get('/api/health', (_req, res) => {
  const hasSupabase = Boolean(
    process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );

  if (!hasSupabase) {
    if (process.env.NODE_ENV === 'production') {
      res.status(503).json({ ok: false, status: 'unhealthy' });
    } else {
      res.status(503).json({
        ok: false,
        error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in deployment environment',
      });
    }
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    res.json({ ok: true, status: 'healthy' });
    return;
  }

  const hasJwt = Boolean(process.env.JWT_SECRET?.trim());
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
