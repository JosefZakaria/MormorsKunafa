import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import productsRouter from './routes/products.js';

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use('/api/products', productsRouter);

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

function tryListen(p: number): void {
  const server = app.listen(p, () => {
    console.log(`Backend listening on http://localhost:${p}`);
  });
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${p} in use, trying ${p + 1}...`);
      tryListen(p + 1);
    } else {
      throw err;
    }
  });
}
tryListen(port);
