import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import productsRouter from './routes/products.js';
import ordersRouter from './routes/orders.js';
import adminRouter from './routes/admin.js';
import { handleStripeWebhook } from './routes/stripeWebhook.js';
import { handleSwishCallback } from './routes/swishCallback.js';

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'https://mormorskunafa-frontend.vercel.app',
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
  res.json({ ok: true });
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = Number(process.env.PORT) || 3001;
  app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
  });
}

export default app;
