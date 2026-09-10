import { API_CONFIG, apiRequest } from '@shared/api';
import type {
  Product,
  Order,
  PublicOrderStatus,
  Location,
  CreateOrderRequest,
  UpdateOrderStatusRequest,
  UpdateOrderTimeRequest,
  UpdateOrderNotesRequest,
  AdminSettings,
  AdminRole,
  PushSubscriptionRecord,
  AdminRefundOverview,
  CreateOrderRefundResult,
  PaymentSecurityAlert,
  DuplicatePaymentAlertDetail,
  VerifiedFoodInformationUpdate,
  CheckoutPaymentChoice,
  CreateOrderResponse,
} from '@shared/types';
import {
  CHECKOUT_CONTRACT_HEADER,
  CHECKOUT_CONTRACT_VERSION,
  isOrderStatusCapability,
  type CheckoutBackendContract,
} from '@shared/constants/checkoutContract';

const adminRequest = apiRequest;

// A readable CSRF cookie is only a local session marker; the backend still
// validates the HttpOnly session cookie on every request.
const getToken = (): string | null =>
  document.cookie.split(';').some((part) => part.trim().startsWith('mk_csrf='))
    ? 'cookie-session'
    : null;

async function authenticatedRequest<T>(
  endpoint: string,
  options?: RequestInit & { token?: string; timeout?: number }
): Promise<T> {
  const { token: _legacyToken, ...requestOptions } = options ?? {};
  return adminRequest<T>(endpoint, requestOptions);
}

const orderStatusTokenKey = (orderId: string): string => `order-status-token:${orderId}`;
const pendingCheckoutKey = 'pending-checkout-order';
const pendingCheckoutCreateKey = 'pending-checkout-create';
const pendingCheckoutLifetimeMs = 24 * 60 * 60 * 1000;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PendingCheckoutOrder = {
  orderId: string;
  paymentMethod: CheckoutPaymentChoice;
  contract: CheckoutBackendContract;
  paymentStarted: boolean;
  createdAt: number;
};

export type PendingCheckoutCreateAttempt = {
  idempotencyKey: string;
  createdAt: number;
};

function hasValidPendingTimestamp(createdAt: unknown): createdAt is number {
  return typeof createdAt === 'number'
    && Number.isSafeInteger(createdAt)
    && createdAt <= Date.now() + 5 * 60 * 1000
    && createdAt > Date.now() - pendingCheckoutLifetimeMs;
}

function isPendingCheckoutOrder(value: unknown): value is PendingCheckoutOrder {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<PendingCheckoutOrder>;
  return typeof candidate.orderId === 'string'
    && UUID_V4_PATTERN.test(candidate.orderId)
    && (candidate.paymentMethod === 'card' || candidate.paymentMethod === 'swish')
    && ['current', 'legacy', 'unknown'].includes(String(candidate.contract))
    && typeof candidate.paymentStarted === 'boolean'
    && hasValidPendingTimestamp(candidate.createdAt);
}

function isPendingCheckoutCreateAttempt(value: unknown): value is PendingCheckoutCreateAttempt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<PendingCheckoutCreateAttempt>;
  return typeof candidate.idempotencyKey === 'string'
    && UUID_V4_PATTERN.test(candidate.idempotencyKey)
    && hasValidPendingTimestamp(candidate.createdAt);
}

export function readPendingCheckoutCreateAttempt(): PendingCheckoutCreateAttempt | null {
  const raw = sessionStorage.getItem(pendingCheckoutCreateKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isPendingCheckoutCreateAttempt(parsed)) return parsed;
  } catch {
    // Remove malformed state below.
  }
  sessionStorage.removeItem(pendingCheckoutCreateKey);
  return null;
}

export function storePendingCheckoutCreateAttempt(
  idempotencyKey: string
): PendingCheckoutCreateAttempt {
  if (!UUID_V4_PATTERN.test(idempotencyKey)) {
    throw new Error('Beställningsförsöket har en ogiltig identifierare. Ingen beställning skickades.');
  }
  const pending: PendingCheckoutCreateAttempt = {
    idempotencyKey,
    createdAt: Date.now(),
  };
  try {
    sessionStorage.setItem(pendingCheckoutCreateKey, JSON.stringify(pending));
  } catch {
    throw new Error('Beställningsförsöket kunde inte bevaras lokalt. Ingen beställning skickades.');
  }
  return pending;
}

export function clearPendingCheckoutCreateAttempt(idempotencyKey?: string): void {
  if (idempotencyKey) {
    const pending = readPendingCheckoutCreateAttempt();
    if (pending?.idempotencyKey !== idempotencyKey) return;
  }
  sessionStorage.removeItem(pendingCheckoutCreateKey);
}

export function readPendingCheckoutOrder(): PendingCheckoutOrder | null {
  const raw = sessionStorage.getItem(pendingCheckoutKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isPendingCheckoutOrder(parsed)) return parsed;
  } catch {
    // Remove malformed state below.
  }
  sessionStorage.removeItem(pendingCheckoutKey);
  return null;
}

export function storePendingCheckoutOrder(
  orderId: string,
  paymentMethod: CheckoutPaymentChoice,
  contract: CheckoutBackendContract
): PendingCheckoutOrder {
  if (!UUID_V4_PATTERN.test(orderId)) throw new Error('Order response has an invalid identifier');
  const pending: PendingCheckoutOrder = {
    orderId,
    paymentMethod,
    contract,
    paymentStarted: false,
    createdAt: Date.now(),
  };
  sessionStorage.setItem(pendingCheckoutKey, JSON.stringify(pending));
  return pending;
}

export function markPendingCheckoutPaymentStarted(orderId: string): PendingCheckoutOrder | null {
  const pending = readPendingCheckoutOrder();
  if (!pending || pending.orderId !== orderId) return null;
  const next = { ...pending, paymentStarted: true };
  sessionStorage.setItem(pendingCheckoutKey, JSON.stringify(next));
  return next;
}

export function clearPendingCheckoutOrder(orderId: string): void {
  const pending = readPendingCheckoutOrder();
  if (pending?.orderId === orderId) sessionStorage.removeItem(pendingCheckoutKey);
}

export function storeOrderStatusToken(orderId: string, token: string): void {
  if (!UUID_V4_PATTERN.test(orderId) || !isOrderStatusCapability(token)) {
    throw new Error('Order response has an invalid status capability');
  }
  sessionStorage.setItem(orderStatusTokenKey(orderId), token);
}

export function hasOrderStatusToken(orderId: string): boolean {
  if (!UUID_V4_PATTERN.test(orderId)) return false;
  return isOrderStatusCapability(sessionStorage.getItem(orderStatusTokenKey(orderId)));
}

function orderStatusHeaders(orderId: string): Record<string, string> {
  const token = sessionStorage.getItem(orderStatusTokenKey(orderId));
  if (!isOrderStatusCapability(token)) throw new Error('Order status token is missing');
  return { 'X-Order-Status-Token': token };
}

function currentCheckoutHeaders(): Record<string, string> {
  return { [CHECKOUT_CONTRACT_HEADER]: CHECKOUT_CONTRACT_VERSION };
}

function paymentMutationHeaders(orderId: string): Record<string, string> {
  return { ...currentCheckoutHeaders(), ...orderStatusHeaders(orderId) };
}

// Products API
export const productApi = {
  getAll: async (locationId?: string): Promise<Product[]> => {
    const query = locationId ? `?locationId=${encodeURIComponent(locationId)}` : '';
    return apiRequest<Product[]>(`/products${query}`);
  },

  getAllAdmin: async (): Promise<Product[]> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    return authenticatedRequest<Product[]>('/products', { token });
  },

  getById: async (id: string): Promise<Product> => {
    return apiRequest<Product>(`/products/${id}`);
  },

  updateStock: async (id: string, inStock: boolean, locationId: string): Promise<Product> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    
    return authenticatedRequest<Product>(`/products/${id}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ inStock, locationId }),
      token,
    });
  },

  updateFoodInformation: async (
    id: string,
    input: VerifiedFoodInformationUpdate
  ): Promise<Product> => {
    if (!getToken()) throw new Error('Not authenticated');
    return authenticatedRequest<Product>(`/products/${id}/food-information`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  revokeFoodInformation: async (id: string): Promise<Product> => {
    if (!getToken()) throw new Error('Not authenticated');
    return authenticatedRequest<Product>(`/products/${id}/food-information`, {
      method: 'DELETE',
    });
  },
  create: async (data: {
    name: string;
    price: number;
    description?: string;
    image?: string;
    variantPrices?: Record<string, number> | null;
  }): Promise<Product> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    return authenticatedRequest<Product>('/products', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    });
  },

  update: async (
    id: string,
    data: {
      name?: string;
      price?: number;
      description?: string;
      image?: string;
      variantPrices?: Record<string, number> | null;
      hidden?: boolean;
    }
  ): Promise<Product> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    return authenticatedRequest<Product>(`/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      token,
    });
  },

  reorder: async (orderedIds: string[]): Promise<Product[]> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    return authenticatedRequest<Product[]>('/products/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ orderedIds }),
      token,
    });
  },

  remove: async (id: string): Promise<void> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    await authenticatedRequest<{ ok: boolean }>(`/products/${id}`, {
      method: 'DELETE',
      token,
    });
  },
};

export const locationApi = {
  getAll: async (): Promise<Location[]> => {
    return apiRequest<Location[]>('/locations');
  },
};

// Orders API
export const orderApi = {
  create: async (data: CreateOrderRequest, idempotencyKey: string): Promise<CreateOrderResponse> => {
    return apiRequest('/orders', {
      method: 'POST',
      headers: { ...currentCheckoutHeaders(), 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(data),
    });
  },

  createCheckoutSession: async (orderId: string): Promise<{ url: string }> => {
    return apiRequest<{ url: string }>(`/orders/checkout-session/${orderId}`, {
      method: 'POST',
      headers: paymentMutationHeaders(orderId),
    });
  },

  /** After Stripe redirect — marks order paid if webhook has not run yet. */
  confirmStripeCheckout: async (orderId: string, sessionId: string): Promise<PublicOrderStatus> => {
    return apiRequest<PublicOrderStatus>('/orders/stripe-confirm', {
      method: 'POST',
      headers: paymentMutationHeaders(orderId),
      body: JSON.stringify({ orderId, sessionId }),
    });
  },

  createSwishPayment: async (orderId: string): Promise<{
    instructionId: string;
    status: string;
    paymentPageUrl?: string;
    amountOre: number;
    orderNumber: string;
  }> => {
    return apiRequest(`/orders/swish-payment/${orderId}`, {
      method: 'POST',
      headers: paymentMutationHeaders(orderId),
    });
  },

  getSwishPaymentStatus: async (orderId: string): Promise<{
    paymentStatus: string;
    swishStatus: string | null;
    paymentPageUrl?: string;
  }> => {
    return apiRequest(`/orders/swish-payment/${orderId}/status`, {
      headers: paymentMutationHeaders(orderId),
    });
  },

  getById: async (id: string): Promise<PublicOrderStatus> => {
    return apiRequest<PublicOrderStatus>(`/orders/${id}`, { headers: orderStatusHeaders(id) });
  },

  getPending: async (): Promise<Order[]> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    return authenticatedRequest<Order[]>('/orders/admin/pending', { token });
  },

  acceptOrder: async (id: string, extraMinutes?: number): Promise<Order> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    return authenticatedRequest<Order>(`/orders/admin/${id}/accept`, {
      method: 'PATCH',
      body: JSON.stringify({ extraMinutes: extraMinutes ?? 0 }),
      token,
    });
  },

  getActive: async (): Promise<Order[]> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    
    return authenticatedRequest<Order[]>('/orders/admin/active', { token });
  },

  getPreOrders: async (): Promise<Order[]> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    
    return authenticatedRequest<Order[]>('/orders/admin/pre-orders', { token });
  },

  getHistory: async (limit?: number, from?: string, to?: string): Promise<Order[]> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    const qp = new URLSearchParams();
    if (limit) qp.set('limit', String(limit));
    if (from) qp.set('from', from);
    if (to) qp.set('to', to);
    const qs = qp.toString();
    return authenticatedRequest<Order[]>(`/orders/admin/history${qs ? `?${qs}` : ''}`, { token });
  },

  cancelOrder: async (id: string, cancellationReason: string, password: string): Promise<Order> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    return authenticatedRequest<Order>(`/orders/admin/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ password, cancellationReason }),
      token,
    });
  },

  updateStatus: async (id: string, data: UpdateOrderStatusRequest): Promise<Order> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    
    return authenticatedRequest<Order>(`/orders/admin/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      token,
    });
  },

  updateTime: async (id: string, data: UpdateOrderTimeRequest): Promise<Order> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    
    return authenticatedRequest<Order>(`/orders/admin/${id}/time`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      token,
    });
  },

  updateInternalNotes: async (id: string, data: UpdateOrderNotesRequest): Promise<Order> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    return authenticatedRequest<Order>(`/orders/admin/${id}/notes`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      token,
    });
  },

  printReceipt: async (id: string): Promise<{ success: boolean; message: string }> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    
    return authenticatedRequest<{ success: boolean; message: string }>(`/orders/admin/${id}/print`, {
      method: 'POST',
      token,
    });
  },

  getPublicSettings: async (): Promise<AdminSettings> => {
    return apiRequest<AdminSettings>('/orders/settings');
  },
};

// Admin API
export const adminApi = {
  login: async (email: string, password: string): Promise<{
    admin: { id: string; email: string; name: string; role: AdminRole; locationId: string | null };
  }> => {
    return apiRequest<{
        admin: { id: string; email: string; name: string; role: AdminRole; locationId: string | null };
    }>('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  getRefundOverview: async (id: string): Promise<AdminRefundOverview> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    return authenticatedRequest<AdminRefundOverview>(`/orders/admin/${id}/refunds`, { token });
  },

  createRefund: async (id: string, data: {
    password: string;
    confirmation: string;
    items: Array<{ orderItemId: string; quantity: number }>;
  }, idempotencyKey: string): Promise<CreateOrderRefundResult> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    return authenticatedRequest<CreateOrderRefundResult>(`/orders/admin/${id}/refunds`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(data),
      token,
      timeout: 30_000,
    });
  },

  reconcileRefund: async (orderId: string, refundId: string, data: {
    password: string;
    confirmation: string;
  }): Promise<CreateOrderRefundResult> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    return authenticatedRequest<CreateOrderRefundResult>(
      `/orders/admin/${orderId}/refunds/${refundId}/reconcile`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        token,
        timeout: 30_000,
      }
    );
  },

  getSession: async (): Promise<{ admin: { id: string; email: string; name: string; role: AdminRole; locationId: string | null } }> => {
    return adminRequest('/admin/session');
  },

  logout: async (): Promise<void> => {
    return adminRequest('/admin/logout', { method: 'POST' });
  },

  getSettings: async (): Promise<AdminSettings> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    
    return authenticatedRequest<AdminSettings>('/admin/settings', { token });
  },

  updateSettings: async (settings: Partial<AdminSettings>): Promise<AdminSettings> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    
    return authenticatedRequest<AdminSettings>('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
      token,
    });
  },

  updateLocation: async (
    id: string,
    patch: Partial<Pick<Location, 'isPaused' | 'eatHereEnabled' | 'takeawayEnabled'>>
  ): Promise<Location> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    return authenticatedRequest<Location>(`/admin/locations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
      token,
    });
  },

  uploadImage: async (
    kind: 'product' | 'hero-desktop' | 'hero-mobile',
    file: File,
    productId?: string
  ): Promise<{ url: string; settings?: AdminSettings; product?: Product }> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    const body = new FormData();
    body.append('file', file);
    body.append('kind', kind);
    if (productId) body.append('productId', productId);

    return authenticatedRequest('/admin/uploads', {
      method: 'POST',
      body,
      token,
      timeout: 60_000,
    });
  },

  getNotifications: async (limit?: number): Promise<any[]> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    
    const params = limit ? `?limit=${limit}` : '';
    return authenticatedRequest<any[]>(`/admin/notifications${params}`, { token });
  },

  markNotificationAsRead: async (id: string): Promise<void> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    
    return authenticatedRequest<void>(`/admin/notifications/${id}/read`, {
      method: 'PATCH',
      token,
    });
  },

  getPushSubscriptions: async (): Promise<PushSubscriptionRecord[]> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    return authenticatedRequest<PushSubscriptionRecord[]>('/admin/push-subscriptions', { token });
  },

  savePushSubscription: async (
    subscription: PushSubscription,
    deviceLabel?: string
  ): Promise<PushSubscriptionRecord> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    return authenticatedRequest<PushSubscriptionRecord>('/admin/push-subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        subscription,
        deviceLabel,
      }),
      token,
    });
  },

  removePushSubscription: async (id: string): Promise<void> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    return authenticatedRequest<void>(`/admin/push-subscriptions/${id}`, {
      method: 'DELETE',
      token,
    });
  },

  createRealtimeTicket: async (): Promise<{ ticket: string; expiresInSeconds: number }> => {
    return authenticatedRequest('/admin/events/ticket', { method: 'POST' });
  },

  getPaymentAlerts: async (): Promise<PaymentSecurityAlert[]> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    return authenticatedRequest<PaymentSecurityAlert[]>('/admin/payment-alerts', { token });
  },

  getPaymentAlertDetail: async (eventId: string): Promise<DuplicatePaymentAlertDetail> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    return authenticatedRequest<DuplicatePaymentAlertDetail>(
      `/admin/payment-alerts/${encodeURIComponent(eventId)}`,
      { token }
    );
  },

  refundDuplicatePayment: async (
    eventId: string,
    body: { password: string; confirmation: string },
    idempotencyKey: string
  ): Promise<DuplicatePaymentAlertDetail> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    return authenticatedRequest<DuplicatePaymentAlertDetail>(
      `/admin/payment-alerts/${encodeURIComponent(eventId)}/refund`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(body),
        token,
      }
    );
  },

  getRealtimeEventsUrl: (ticket: string): string => {
    const base = API_CONFIG.baseUrl.replace(/\/+$/, '');
    return `${base}/admin/events?ticket=${encodeURIComponent(ticket)}`;
  },

  getStatistics: async (password: string, startDate?: string, endDate?: string): Promise<{
    hasCustomRange: boolean;
    products: Array<{
      name: string;
      soldDay: number;
      soldWeek: number;
      soldMonth: number;
      soldYear: number;
      soldTotal: number;
      soldCustom: number;
      revenueDayOre: number;
      revenueWeekOre: number;
      revenueMonthOre: number;
      revenueYearOre: number;
      revenueTotalOre: number;
      revenueCustomOre: number;
    }>;
    totals: {
      ordersDay: number;
      ordersWeek: number;
      ordersMonth: number;
      ordersYear: number;
      ordersTotal: number;
      ordersCustom: number;
      ordersCancelledDay: number;
      ordersCancelledWeek: number;
      ordersCancelledMonth: number;
      ordersCancelledYear: number;
      ordersCancelledTotal: number;
      ordersCancelledCustom: number;
      itemsDay: number;
      itemsWeek: number;
      itemsMonth: number;
      itemsYear: number;
      itemsTotal: number;
      itemsCustom: number;
      revenueDayOre: number;
      revenueWeekOre: number;
      revenueMonthOre: number;
      revenueYearOre: number;
      revenueTotalOre: number;
      revenueCustomOre: number;
    };
  }> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    return authenticatedRequest(`/admin/statistics`, {
      method: 'POST',
      body: JSON.stringify({ password, startDate, endDate }),
      token,
    });
  },
};
