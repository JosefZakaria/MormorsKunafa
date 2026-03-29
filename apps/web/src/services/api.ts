import { apiRequest, authenticatedRequest } from '@shared/api';
import type { Product, Order, CreateOrderRequest, OrderStatus, UpdateOrderStatusRequest, UpdateOrderTimeRequest, AdminSettings } from '@shared/types';

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

  getHistory: async (limit?: number): Promise<Order[]> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    
    const params = limit ? `?limit=${limit}` : '';
    return authenticatedRequest<Order[]>(`/orders/admin/history${params}`, { token });
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

  printReceipt: async (id: string): Promise<{ success: boolean; message: string }> => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    
    return authenticatedRequest<{ success: boolean; message: string }>(`/orders/admin/${id}/print`, {
      method: 'POST',
      token,
    });
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
};
