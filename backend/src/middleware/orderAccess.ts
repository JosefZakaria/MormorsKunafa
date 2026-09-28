import type { Request, Response, NextFunction } from 'express';
import { getRequestAdmin } from './auth.js';
import { getOrderById } from '../db/orderRepository.js';
import { loadAdminScope, orderRowVisibleToScope } from '../services/locationScope.js';
import { logUnexpectedError } from '../utils/safeErrorMetadata.js';
import { singleRouteParam } from '../utils/routeParam.js';

/** Run after requireAdmin and before any order detail read or mutation. */
export async function requireOrderAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const admin = getRequestAdmin(req);
  if (!admin) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const order = await getOrderById(singleRouteParam(req.params.id));
    const scope = await loadAdminScope(admin.adminId);
    if (!order || !orderRowVisibleToScope(scope, order.order)) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    next();
  } catch (error) {
    logUnexpectedError('order access verification', error);
    res.status(503).json({ error: 'Order access unavailable' });
  }
}
