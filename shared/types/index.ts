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

// Payment Method — `app` is legacy (treated as card on the server)
export type PaymentMethod = 'card' | 'swish' | 'cash' | 'app';

export type CheckoutPaymentChoice = 'card' | 'swish';
export type RefundStatus = 'none' | 'pending' | 'refunded' | 'failed';

export type LocationSlug = 'hoja' | 'mollevangen';
export type AdminRole = 'owner' | 'location';

/** Höja — original bakery, fulfills home delivery. Matches DB seed. */
export const HOJA_LOCATION_ID = '2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f601';
/** Möllevången. Matches DB seed. */
export const MOLLEVANGEN_LOCATION_ID = '2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f602';

export interface Location {
  id: string;
  slug: LocationSlug;
  name: string;
  address: string;
  fulfillsDelivery: boolean;
  eatHereEnabled: boolean;
  takeawayEnabled: boolean;
  isPaused: boolean;
}

// Product Interface
export interface Product {
  id: string;
  name: string;
  price: number; // in SEK (öre)
  description: string;
  image: string;
  inStock: boolean;
  /** When true, the product stays in admin but is omitted from the customer menu. */
  hidden: boolean;
  /** Display order on the public menu (lower first). */
  sortOrder: number;
  /** Option label → price in öre (e.g. "250 gram": 8900). Bread uses key "st". */
  variantPrices?: Record<string, number>;
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
  name?: string;
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
  /** Set for eat-here / takeaway. Null for delivery. */
  locationId?: string | null;
}

// Admin User Interface (F.Admin.1)
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  /** Set when role is `location`. Null for owners. */
  locationId?: string | null;
  createdAt: string;
  lastLoginAt?: string;
}

// Admin Settings (also returned by public GET /orders/settings)
export interface AdminSettings {
  defaultPreparationTime: number; // minutes (F.Admin.3)
  /** Global emergency stop — blocks every new order, including delivery. */
  isPaused: boolean;
  /** Derived: at least one location currently accepts eat-here. */
  eatHereEnabled: boolean;
  /** Derived: at least one location currently accepts takeaway. */
  takeawayEnabled: boolean;
  /** Global home-delivery flag. */
  deliveryEnabled: boolean;
  /** Per-location pause and in-store type flags. */
  locations: Location[];
  /** Landing hero image for desktop / wide viewports. */
  heroImageDesktop: string;
  /** Landing hero image for mobile / narrow viewports. */
  heroImageMobile: string;
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
  customerInfo: CustomerInfo;
  deliveryInfo?: DeliveryInfo;
  /** Naive `YYYY-MM-DDTHH:mm:ss` (Europe/Stockholm) or ISO with Z/offset */
  scheduledTime?: string;
  paymentMethod: PaymentMethod;
  /** Required for eat-here / takeaway. Ignored for delivery. */
  locationId?: string;
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

export interface PushSubscriptionRecord {
  id: string;
  endpoint: string;
  deviceLabel?: string | null;
  userAgent?: string | null;
  createdAt: string;
  updatedAt: string;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastFailureReason?: string | null;
}

export interface OrderCreatedRealtimeEvent {
  event_id: string;
  event_type: 'ORDER_CREATED';
  order_id: string;
  order_number: string;
  created_at: string;
  order_type: OrderType;
  location_id: string | null;
}
