/**
 * Shared Types
 * 
 * This module contains TypeScript types and interfaces that are shared
 * across the web frontend, mobile frontend, and backend.
 * 
 * IMPORTANT: Do not add any UI-specific code here.
 * Types should be pure data structures only.
 */

// Order Status Types (F.Order.2)
export type OrderStatus = 'ny' | 'mottagen' | 'påbörjad' | 'klar' | 'avbruten' | 'uthämtad' | 'levererad';

// Order Type
export type OrderType = 'eat-here' | 'takeaway' | 'delivery';

// Payment Method
export type PaymentMethod = 'app' | 'cash';
export type RefundStatus = 'none' | 'pending' | 'refunded' | 'failed';

// Product Interface
export interface Product {
  id: string;
  name: string;
  price: number; // in SEK (öre)
  description: string;
  image: string;
  inStock: boolean;
  createdAt: string;
  updatedAt: string;
}

// Order Item Interface
export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number; // price at time of order (in öre)
  modifications?: string[]; // ingredient additions/removals
}

// Delivery Information
export interface DeliveryInfo {
  city: string;
  address: string;
  postalCode: string;
  phone: string;
  email?: string;
}

// Customer contact info (used for all order types)
export interface CustomerInfo {
  name: string;
  phone: string;
  email?: string;
}

// Order Interface (F.Order.1)
export interface Order {
  id: string;
  orderNumber: string; // Display number like #1001
  items: OrderItem[];
  totalPrice: number; // in öre
  orderType: OrderType;
  status: OrderStatus;
  customerInfo?: CustomerInfo;
  deliveryInfo?: DeliveryInfo;
  scheduledTime?: string; // ISO string for pre-orders (F.Kund.5)
  defaultPreparationTime: number; // minutes (F.Admin.3)
  estimatedReadyTime: string; // ISO string
  createdAt: string;
  updatedAt: string;
  startedAt?: string; // When status changed to 'påbörjad'
  completedAt?: string; // When status changed to 'klar'
  cancellationReason?: string;
  cancelledAt?: string;
  refundStatus: RefundStatus;
  internalNotes?: string;
  paymentMethod: PaymentMethod;
  paymentStatus: 'pending' | 'paid';
}

// Admin User Interface (F.Admin.1)
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  lastLoginAt?: string;
}

// Admin Settings
export interface AdminSettings {
  defaultPreparationTime: number; // minutes (F.Admin.3)
  isPaused: boolean; // pause new orders
}

// Sales History Entry (F.Admin.6)
export interface SalesHistoryEntry {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  orderDate: string;
  orderType: OrderType;
}

// Create Order Request
export interface CreateOrderRequest {
  items: OrderItem[];
  orderType: OrderType;
  customerInfo?: CustomerInfo;
  deliveryInfo?: DeliveryInfo;
  /** Naive `YYYY-MM-DDTHH:mm:ss` (Europe/Stockholm) or ISO with Z/offset */
  scheduledTime?: string;
  paymentMethod: PaymentMethod;
}

// Update Order Status Request
export interface UpdateOrderStatusRequest {
  status: OrderStatus;
  estimatedReadyTime?: string;
  cancellationReason?: string;
}

// Update Order Time Request (F.Admin.3)
export interface UpdateOrderTimeRequest {
  estimatedReadyTime: string;
  preparationTime?: number; // Override default time
}

export interface UpdateOrderNotesRequest {
  internalNotes?: string;
}

// Admin Login Request
export interface AdminLoginRequest {
  email: string;
  password: string;
}

// Notification Types (F.Notis)
export type NotificationType = 
  | 'new_order'
  | 'pre_order_reminder' // 30 min before (F.Notis.2)
  | 'order_delayed' // (F.Notis.3)
  | 'order_ready'; // (F.Notis.4)

export interface Notification {
  id: string;
  type: NotificationType;
  orderId?: string;
  message: string;
  createdAt: string;
  read: boolean;
}
