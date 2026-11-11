import { Router, Request, Response } from 'express';
import { listLocations } from '../db/locations.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store');
  try {
    const locations = await listLocations();
    res.json(locations);
  } catch (e) {
    console.error('[GET /api/locations]', e);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

export default router;
