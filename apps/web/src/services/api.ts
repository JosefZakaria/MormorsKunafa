import { API_CONFIG, apiRequest } from '@shared/api';
import { getPublicSettings } from './publicSettings';

/** Listen-only access to the private order-signal channel, minted per admin by the backend. */
export type AdminRealtimeAccess = { url: string; apiKey: string; token: string; topic: string; expiresIn: number };
import type { DeliveryPricing } from '@shared/utils/deliveryPricing';
import type {
  Product,
  Order,
  Location,
  CreateOrderRequest,
  UpdateOrderStatusRequest,
  UpdateOrderTimeRequest,
  UpdateOrderNotesRequest,
  AdminSettings,
  AdminRole,
  PhoneOrderRequest,
  PushSubscriptionRecord,
} from '@shared/types';

// Admin credentials are sent only in the HttpOnly cookie. The CSRF token stays in memory.
const adminBaseUrl = import.meta.env.PROD ? '/api' : API_CONFIG.baseUrl;
let csrfToken: string | null = null;
export const clearAdminCsrf = () => { csrfToken = null; };

async function authenticatedRequest<T>(endpoint: string, options: RequestInit & { timeout?: number } = {}): Promise<T> {
  try {
    return await apiRequest<T>(endpoint, { ...options, baseUrl: adminBaseUrl, credentials: 'include',
      headers: { ...options.headers, ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) } });
  } catch (error) {
    if ((error as { status?: number }).status === 401) {
      clearAdminCsrf();
      window.dispatchEvent(new Event('admin-session-expired'));
    }
    throw error;
  }
}

interface AdminSessionResponse {
  csrfToken: string;
  admin: { id: string; email: string; name: string; role: AdminRole; locationId: string | null };
}

// Products API
export const productApi = {
  getAll: async (locationId?: string): Promise<Product[]> => {
    const query = locationId ? `?locationId=${encodeURIComponent(locationId)}` : '';
    return apiRequest<Product[]>(`/products${query}`);
  },

  getAllAdmin: async (): Promise<Product[]> => {
    return authenticatedRequest<Product[]>('/products');
  },

  getById: async (id: string): Promise<Product> => {
    return apiRequest<Product>(`/products/${id}`);
  },

  updateStock: async (id: string, inStock: boolean, locationId: string): Promise<Product> => {
    return authenticatedRequest<Product>(`/products/${id}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ inStock, locationId }),
    });
  },

  create: async (data: {
    name: string;
    price: number;
    description?: string;
    image?: string;
    variantPrices?: Record<string, number> | null;
  }): Promise<Product> => {
    return authenticatedRequest<Product>('/products', {
      method: 'POST',
      body: JSON.stringify(data),
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
    return authenticatedRequest<Product>(`/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  reorder: async (orderedIds: string[]): Promise<Product[]> => {
    return authenticatedRequest<Product[]>('/products/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ orderedIds }),
    });
  },

  remove: async (id: string): Promise<void> => {
    await authenticatedRequest<{ ok: boolean }>(`/products/${id}`, {
      method: 'DELETE',
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
  getDeliveryPricing: async (): Promise<DeliveryPricing> => {
    return apiRequest<DeliveryPricing>('/orders/delivery-pricing');
  },
  create: async (data: CreateOrderRequest): Promise<Order & { statusToken?: string }> => {
    return apiRequest<Order & { statusToken?: string }>('/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  createCheckoutSession: async (orderId: string, statusToken?: string): Promise<{ url: string }> => {
    return apiRequest<{ url: string }>(`/orders/checkout-session/${orderId}`, {
      method: 'POST',
      headers: statusToken ? { 'X-Order-Token': statusToken } : {},
    });
  },

  /** After Stripe redirect — marks order paid if webhook has not run yet. */
  confirmStripeCheckout: async (orderId: string, sessionId: string, statusToken?: string): Promise<Order> => {
    return apiRequest<Order>('/orders/stripe-confirm', {
      method: 'POST',
      body: JSON.stringify({ orderId, sessionId }),
      headers: statusToken ? { 'X-Order-Token': statusToken } : {},
    });
  },

  createSwishPayment: async (
    orderId: string,
    body?: { phone?: string }
  ): Promise<{
    instructionId: string;
    status: string;
    paymentPageUrl?: string;
    token?: string;
    amountOre: number;
    orderNumber: string;
  }> => {
    return apiRequest(`/orders/swish-payment/${orderId}`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    });
  },

  getSwishPaymentStatus: async (
    orderId: string
  ): Promise<{
    paymentStatus: string;
    swishStatus: string | null;
    paymentPageUrl?: string;
    token?: string;
  }> => {
    return apiRequest(`/orders/swish-payment/${orderId}/status`);
  },

  getById: async (id: string, statusToken?: string): Promise<Order> => {
    return apiRequest<Order>(`/orders/${id}`, {
      headers: statusToken ? { 'X-Order-Token': statusToken } : {},
    });
  },

  getPending: async (): Promise<Order[]> => {
    return authenticatedRequest<Order[]>('/orders/admin/pending');
  },

  acceptOrder: async (id: string, extraMinutes?: number): Promise<Order> => {
    return authenticatedRequest<Order>(`/orders/admin/${id}/accept`, {
      method: 'PATCH',
      body: JSON.stringify({ extraMinutes: extraMinutes ?? 0 }),
    });
  },

  getActive: async (): Promise<Order[]> => {
    return authenticatedRequest<Order[]>('/orders/admin/active');
  },

  getPreOrders: async (): Promise<Order[]> => {
    return authenticatedRequest<Order[]>('/orders/admin/pre-orders');
  },

  getHistory: async (limit?: number, from?: string, to?: string): Promise<Order[]> => {
    const qp = new URLSearchParams();
    if (limit) qp.set('limit', String(limit));
    if (from) qp.set('from', from);
    if (to) qp.set('to', to);
    const qs = qp.toString();
    return authenticatedRequest<Order[]>(`/orders/admin/history${qs ? `?${qs}` : ''}`);
  },

  cancelOrder: async (id: string, cancellationReason: string, password: string): Promise<Order> => {
    return authenticatedRequest<Order>(`/orders/admin/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ password, cancellationReason }),
    });
  },

  updateStatus: async (id: string, data: UpdateOrderStatusRequest): Promise<Order> => {
    return authenticatedRequest<Order>(`/orders/admin/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  updateTime: async (id: string, data: UpdateOrderTimeRequest): Promise<Order> => {
    return authenticatedRequest<Order>(`/orders/admin/${id}/time`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  updateInternalNotes: async (id: string, data: UpdateOrderNotesRequest): Promise<Order> => {
    return authenticatedRequest<Order>(`/orders/admin/${id}/notes`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  printReceipt: async (id: string): Promise<{ success: boolean; message: string }> => {
    return authenticatedRequest<{ success: boolean; message: string }>(`/orders/admin/${id}/print`, {
      method: 'POST',
    });
  },

  getPublicSettings: async (): Promise<AdminSettings> => {
    return getPublicSettings();
  },
};

// Admin API
export const adminApi = {
  createPhoneOrder: async (data: PhoneOrderRequest): Promise<Order> => {
    return authenticatedRequest<Order>('/orders/admin/phone-orders', {
      method: 'POST', body: JSON.stringify(data),
    });
  },
  getDeliveryPricing: async (): Promise<DeliveryPricing> => {
    return authenticatedRequest<DeliveryPricing>('/admin/delivery-pricing');
  },

  updateDeliveryPricing: async (pricing: DeliveryPricing): Promise<DeliveryPricing> => {
    return authenticatedRequest<DeliveryPricing>('/admin/delivery-pricing', {
      method: 'PATCH', body: JSON.stringify(pricing),
    });
  },

  login: async (email: string, password: string): Promise<AdminSessionResponse> => {
    const result = await apiRequest<AdminSessionResponse>('/admin/login', {
      method: 'POST', body: JSON.stringify({ email, password }), credentials: 'include',
      baseUrl: adminBaseUrl, headers: { 'X-Admin-Request': '1' },
    });
    csrfToken = result.csrfToken;
    return result;
  },

  getSession: async (): Promise<AdminSessionResponse> => {
    const result = await authenticatedRequest<AdminSessionResponse>('/admin/session');
    csrfToken = result.csrfToken;
    return result;
  },

  logout: async (): Promise<void> => {
    try { await authenticatedRequest('/admin/logout', { method: 'POST' }); }
    catch (error) { if ((error as { status?: number }).status !== 401) throw error; }
    clearAdminCsrf();
  },

  getSettings: async (): Promise<AdminSettings> => {
    return authenticatedRequest<AdminSettings>('/admin/settings');
  },

  updateSettings: async (settings: Partial<AdminSettings>): Promise<AdminSettings> => {
    return authenticatedRequest<AdminSettings>('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
  },

  updateLocation: async (
    id: string,
    patch: Partial<Pick<Location, 'isPaused' | 'eatHereEnabled' | 'takeawayEnabled' | 'openingHours'>>
  ): Promise<Location> => {
    return authenticatedRequest<Location>(`/admin/locations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  uploadImage: async (
    kind: 'product' | 'hero-desktop' | 'hero-mobile',
    file: File,
    productId?: string
  ): Promise<{ url: string; settings?: AdminSettings; product?: Product }> => {
    const body = new FormData();
    body.append('file', file);
    body.append('kind', kind);
    if (productId) body.append('productId', productId);

    return authenticatedRequest('/admin/uploads', {
      method: 'POST',
      body,
      timeout: 60_000,
    });
  },

  getNotifications: async (limit?: number): Promise<any[]> => {
    const params = limit ? `?limit=${limit}` : '';
    return authenticatedRequest<any[]>(`/admin/notifications${params}`);
  },

  markNotificationAsRead: async (id: string): Promise<void> => {
    return authenticatedRequest<void>(`/admin/notifications/${id}/read`, {
      method: 'PATCH',
    });
  },

  getPushSubscriptions: async (): Promise<PushSubscriptionRecord[]> => {
    return authenticatedRequest<PushSubscriptionRecord[]>('/admin/push-subscriptions');
  },

  savePushSubscription: async (
    subscription: PushSubscription,
    deviceLabel?: string
  ): Promise<PushSubscriptionRecord> => {
    return authenticatedRequest<PushSubscriptionRecord>('/admin/push-subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        subscription,
        deviceLabel,
      }),
    });
  },

  removePushSubscription: async (id: string): Promise<void> => {
    return authenticatedRequest<void>(`/admin/push-subscriptions/${id}`, {
      method: 'DELETE',
    });
  },

  getRealtimeToken: async (): Promise<AdminRealtimeAccess> => {
    return authenticatedRequest<AdminRealtimeAccess>('/admin/realtime-token');
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
    return authenticatedRequest(`/admin/statistics`, {
      method: 'POST',
      body: JSON.stringify({ password, startDate, endDate }),
    });
  },
};
