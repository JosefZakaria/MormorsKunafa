import { API_CONFIG, apiRequest, authenticatedRequest } from '@shared/api';
import type {
  Product,
  Order,
  CreateOrderRequest,
  UpdateOrderStatusRequest,
  UpdateOrderTimeRequest,
  UpdateOrderNotesRequest,
  AdminSettings,
  PushSubscriptionRecord,
} from '@shared/types';

// Get auth token from localStorage (web-specific)
const getToken = (): string | null => {
  return localStorage.getItem('authToken');
};

// Products API
export const productApi = {
  getAll: async (): Promise<Product[]> => {
    return apiRequest<Product[]>('/products');
  },

  getById: async (id: string): Promise<Product> => {
    return apiRequest<Product>(`/products/${id}`);
  },

  updateStock: async (id: string, inStock: boolean): Promise<Product> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    
    return authenticatedRequest<Product>(`/products/${id}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ inStock }),
      token,
    });
  },
};

// Orders API
export const orderApi = {
  create: async (data: CreateOrderRequest): Promise<Order> => {
    return apiRequest<Order>('/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  createCheckoutSession: async (orderId: string): Promise<{ url: string }> => {
    return apiRequest<{ url: string }>(`/orders/checkout-session/${orderId}`, {
      method: 'POST',
    });
  },

  /** After Stripe redirect — marks order paid if webhook has not run yet. */
  confirmStripeCheckout: async (orderId: string, sessionId: string): Promise<Order> => {
    return apiRequest<Order>('/orders/stripe-confirm', {
      method: 'POST',
      body: JSON.stringify({ orderId, sessionId }),
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

  getById: async (id: string): Promise<Order> => {
    return apiRequest<Order>(`/orders/${id}`);
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

  deleteOrder: async (id: string, password: string): Promise<void> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    return authenticatedRequest<void>(`/orders/admin/${id}/delete`, {
      method: 'POST',
      body: JSON.stringify({ password }),
      token,
    });
  },

  deleteAllHistory: async (password: string): Promise<void> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    return authenticatedRequest<void>('/orders/admin/history/all/delete', {
      method: 'POST',
      body: JSON.stringify({ password }),
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

  getPublicSettings: async (): Promise<{ defaultPreparationTime: number; isPaused: boolean }> => {
    return apiRequest<{ defaultPreparationTime: number; isPaused: boolean }>('/orders/settings');
  },
};

// Admin API
export const adminApi = {
  login: async (email: string, password: string): Promise<{ token: string; admin: { id: string; email: string; name: string } }> => {
    return apiRequest<{ token: string; admin: { id: string; email: string; name: string } }>('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
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

  getRealtimeEventsUrl: (): string => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    const base = API_CONFIG.baseUrl.replace(/\/+$/, '');
    return `${base}/admin/events?token=${encodeURIComponent(token)}`;
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
