/**
 * HashmiMart domain model.
 * Mirrors the Firestore collections described in PRD §11.
 */

export type Role =
  | "super_admin"
  | "catalog_manager"
  | "order_manager"
  | "support_agent"
  | "analyst";

export interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  active: boolean;
  permissionsOverride?: Permission[];
  createdAt: string;
  lastLoginAt?: string;
}

export type Permission =
  | "dashboard.view"
  | "products.view"
  | "products.write"
  | "products.publish"
  | "categories.view"
  | "categories.write"
  | "orders.view"
  | "orders.write"
  | "orders.refund"
  | "voice.view"
  | "voice.write"
  | "inventory.view"
  | "inventory.write"
  | "customers.view"
  | "customers.write"
  | "vendors.view"
  | "vendors.write"
  | "marketing.view"
  | "marketing.write"
  | "analytics.view"
  | "notifications.view"
  | "notifications.write"
  | "support.view"
  | "admins.view"
  | "admins.write"
  | "settings.view"
  | "settings.write"
  | "audit.view";

/* ------------------------------------------------------------------ */
/* Media                                                               */
/* ------------------------------------------------------------------ */

export type MediaProvider = "pixabay" | "pexels" | "unsplash" | "upload" | "library";

export interface MediaSource {
  provider: MediaProvider;
  providerId: string | null;
  sourcePageUrl: string | null;
  author: string | null;
  authorUrl?: string | null;
  attributionText: string | null;
  /**
   * Unsplash API terms require hotlinking rather than re-hosting, so media from
   * such a provider is marked and never copied into HashmiMart storage.
   */
  hotlinkOnly: boolean;
  licenseNote?: string | null;
}

export interface MediaAsset {
  url: string;
  storageId: string | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  bytes?: number | null;
}

export interface MediaPalette {
  dominant: string | null;
  vibrant: string | null;
  muted: string | null;
  light: string | null;
  dark: string | null;
  /** Softened background actually rendered behind the product card. */
  cardBg: string;
  /** Deep navy or white, chosen by contrast against cardBg. */
  textColor: string;
}

export interface MediaProcessing {
  backgroundRemoved: boolean;
  model: string | null;
  modelVersion: string | null;
  processedAt: string | null;
  /** Set when removal was attempted and failed; original is kept intact. */
  failureReason?: string | null;
  /**
   * How the background was dealt with: flooded away from a plain backdrop,
   * segmented by the model, or deliberately left because there was none.
   */
  method?: "flat" | "model" | "none" | null;
  /**
   * What the clean-up layers did. Kept so a cutout that looks wrong months
   * later can be explained without re-running anything.
   */
  refinement?: {
    /** Half-transparent share of the subject, before and after clean-up. */
    raggedBefore: number;
    raggedAfter: number;
    specksRemoved: number;
    holesOpened: number;
    decontaminated: number;
    backdropHex: string | null;
  } | null;
  /** A soft contact shadow was baked into the cutout. */
  shadow?: boolean;
}

export interface ProductMedia {
  source: MediaSource;
  original: MediaAsset;
  cutout: MediaAsset | null;
  palette: MediaPalette;
  processing: MediaProcessing;
  gallery?: MediaAsset[];
}

/** Normalized provider search result — never carries a key or secret field. */
export interface ProviderImageResult {
  id: string;
  provider: Exclude<MediaProvider, "upload" | "library">;
  thumbUrl: string;
  previewUrl: string;
  fullUrl: string;
  width: number | null;
  height: number | null;
  author: string | null;
  authorUrl: string | null;
  sourcePageUrl: string;
  attributionText: string;
  hotlinkOnly: boolean;
  /** Unsplash requires this to be pinged on a download-like action. */
  downloadTrackingUrl?: string | null;
  tags?: string[];
}

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

export type UnitType = "pc" | "kg" | "g" | "L" | "ml" | "dozen" | "pack";

/** Carried forward from the existing HashmiMart storefront. */
export type ShoppingMode = "retail" | "wholesale";

export type ProductStatus = "draft" | "active" | "archived";

export interface ProductUnit {
  type: UnitType;
  quantity: number;
  label: string;
}

export interface ProductPricing {
  price: number;
  compareAtPrice?: number | null;
  cost?: number | null;
  currency: "PKR";
  taxBehavior: "inclusive" | "exclusive" | "exempt";
}

export interface ProductInventory {
  track: boolean;
  stockOnHand: number;
  reserved: number;
  lowStockThreshold: number;
  allowOutOfStockVisibility: boolean;
}

export interface ProductMerchandising {
  featured: boolean;
  bestseller: boolean;
  isNew: boolean;
  deal: boolean;
  sortScore: number;
  searchKeywords: string[];
}

export interface ProductAvailability {
  status: ProductStatus;
  publishedAt?: string | null;
  scheduledPublishAt?: string | null;
  vendorIds: string[];
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string;
  barcode?: string | null;
  brand?: string | null;
  description?: string | null;
  categoryId: string;
  subcategoryId?: string | null;
  shoppingMode: ShoppingMode;
  /** Bulk quantity ladder, carried forward from the existing storefront. */
  wholesaleOptions?: number[];
  tags: string[];
  searchTokens: string[];
  emojiFallback?: string | null;
  unit: ProductUnit;
  pricing: ProductPricing;
  inventory: ProductInventory;
  media: ProductMedia | null;
  merchandising: ProductMerchandising;
  availability: ProductAvailability;
  seo?: {
    shareTitle?: string | null;
    shareDescription?: string | null;
  };
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description?: string | null;
  icon?: string | null;
  media: ProductMedia | null;
  sortOrder: number;
  status: "active" | "hidden";
  productCount: number;
  activeProductCount: number;
  hiddenProductCount: number;
  lowStockCount: number;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "refunded";

export type OrderSource = "cart" | "voice";

export type PaymentMethod = "cash_on_delivery" | "jazzcash" | "card" | "bank_transfer";

export type PaymentStatus = "unpaid" | "paid" | "refunded" | "partially_refunded";

export interface OrderItem {
  productId: string;
  /** Snapshot — historical orders must not change when a product is edited. */
  name: string;
  sku: string;
  unitLabel: string;
  imageUrl: string | null;
  emojiFallback?: string | null;
  price: number;
  compareAtPrice?: number | null;
  quantity: number;
  lineTotal: number;
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tax: number;
  grandTotal: number;
}

export interface CustomerSnapshot {
  uid: string | null;
  fullName: string;
  phone: string;
  email?: string | null;
  society: string | null;
}

export interface AddressSnapshot {
  line1: string;
  line2?: string | null;
  society: string | null;
  city: string;
  notes?: string | null;
}

export interface OrderEvent {
  id: string;
  type: "status" | "note" | "payment" | "refund" | "inventory";
  from?: OrderStatus | null;
  to?: OrderStatus | null;
  note?: string | null;
  reason?: string | null;
  actorUid: string;
  actorName: string;
  createdAt: string;
}

export interface Order {
  id: string;
  displayId: string;
  customer: CustomerSnapshot;
  address: AddressSnapshot;
  items: OrderItem[];
  totals: OrderTotals;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  source: OrderSource;
  status: OrderStatus;
  vendorId?: string | null;
  couponCode?: string | null;
  estimatedDeliveryMinutes?: number | null;
  notes?: string | null;
  cancelReason?: string | null;
  refundAmount?: number | null;
  stockReserved: boolean;
  voiceOrderId?: string | null;
  createdAt: string;
  updatedAt: string;
  events: OrderEvent[];
}

/* ------------------------------------------------------------------ */
/* Voice orders                                                        */
/* ------------------------------------------------------------------ */

export type VoiceReviewStatus = "unreviewed" | "in_review" | "converted" | "rejected";

export interface VoiceDetectedItem {
  id: string;
  rawText: string;
  matchedProductId: string | null;
  matchedProductName: string | null;
  quantity: number;
  unitLabel: string | null;
  /** 0..1 — anything below the review threshold is flagged, never auto-confirmed. */
  confidence: number;
  corrected: boolean;
}

export interface VoiceOrder {
  id: string;
  displayId: string;
  customer: CustomerSnapshot;
  audioUrl: string | null;
  audioDurationSeconds: number | null;
  /** Coarse waveform samples (0..1) for the player; null when unavailable. */
  waveform: number[] | null;
  transcript: string | null;
  transcriptLanguage?: string | null;
  detectedItems: VoiceDetectedItem[];
  reviewStatus: VoiceReviewStatus;
  linkedOrderId: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  retentionExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

export type MovementType =
  | "manual_add"
  | "manual_remove"
  | "manual_set"
  | "order_reserve"
  | "order_release"
  | "order_fulfil"
  | "import";

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  type: MovementType;
  delta: number;
  before: number;
  after: number;
  reason: string;
  orderId?: string | null;
  actorUid: string;
  actorName: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Customers, vendors, delivery areas                                  */
/* ------------------------------------------------------------------ */

export interface CustomerAddress {
  id: string;
  label: string;
  line1: string;
  line2?: string | null;
  society: string | null;
  city: string;
  isDefault: boolean;
}

export interface Customer {
  uid: string;
  fullName: string;
  email: string | null;
  phone: string;
  society: string | null;
  addresses: CustomerAddress[];
  orderCount: number;
  lifetimeValue: number;
  lastOrderAt: string | null;
  wishlistProductIds: string[];
  status: "active" | "blocked";
  createdAt: string;
  notes?: string | null;
}

/** Delivery area — carried forward from the existing HashmiMart storefront. */
export interface Society {
  id: string;
  name: string;
  city: string;
  deliveryFee: number;
  freeDeliveryThreshold: number | null;
  estimatedMinutes: number;
  active: boolean;
  sortOrder: number;
}

export interface Vendor {
  id: string;
  name: string;
  status: "active" | "paused" | "disabled";
  contactName: string | null;
  phone: string | null;
  email: string | null;
  serviceAreaSocietyIds: string[];
  openingHours: string | null;
  logoUrl: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Merchandising                                                       */
/* ------------------------------------------------------------------ */

export type CouponType = "fixed" | "percentage" | "free_delivery";

export interface Coupon {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  minOrderValue: number | null;
  maxDiscount: number | null;
  usageLimitTotal: number | null;
  usageLimitPerCustomer: number | null;
  usedCount: number;
  scopeCategoryIds: string[];
  scopeProductIds: string[];
  startsAt: string;
  endsAt: string | null;
  status: "scheduled" | "active" | "expired" | "disabled";
  createdAt: string;
}

export interface Offer {
  id: string;
  name: string;
  discountType: "percentage" | "fixed";
  value: number;
  productIds: string[];
  categoryIds: string[];
  startsAt: string;
  endsAt: string | null;
  status: "scheduled" | "active" | "expired" | "disabled";
  createdAt: string;
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  palette: MediaPalette | null;
  ctaLabel: string | null;
  ctaLink: string | null;
  audience: "all" | "new_customers" | "returning_customers";
  placement: "home_hero" | "home_strip" | "category_top";
  startsAt: string;
  endsAt: string | null;
  sortOrder: number;
  status: "draft" | "scheduled" | "live" | "expired";
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Notifications, audit, settings                                      */
/* ------------------------------------------------------------------ */

export interface NotificationRecord {
  id: string;
  kind: "transactional" | "campaign";
  audience: "staff" | "customer" | "segment";
  title: string;
  message: string;
  orderId?: string | null;
  status: "queued" | "sent" | "failed" | "draft";
  isRead: boolean;
  sentAt: string | null;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorUid: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeSummary: string | null;
  afterSummary: string | null;
  reason?: string | null;
  timestamp: string;
}

export interface AppSettings {
  store: {
    name: string;
    supportEmail: string;
    supportPhone: string;
    city: string;
    currency: "PKR";
    timezone: string;
  };
  delivery: {
    defaultFee: number;
    freeDeliveryThreshold: number | null;
    defaultEtaMinutes: number;
    slots: string[];
  };
  tax: {
    rate: number;
    pricesIncludeTax: boolean;
  };
  payments: {
    cashOnDelivery: boolean;
    jazzcash: boolean;
    card: boolean;
    bankTransfer: boolean;
  };
  catalog: {
    lowStockThresholdDefault: number;
    reserveStockOnConfirm: boolean;
  };
  voice: {
    autoConfirmDisabled: true;
    lowConfidenceThreshold: number;
    audioRetentionDays: number;
  };
  featureFlags: Record<string, boolean>;
  /** Revenue rule referenced by the dashboard KPI definitions (PRD §3.1). */
  analytics: {
    revenueCountsFrom: "accepted" | "paid" | "delivered";
    sessionAnalyticsConfigured: boolean;
  };
}

/* ------------------------------------------------------------------ */
/* Support                                                             */
/* ------------------------------------------------------------------ */

export interface SupportConversation {
  id: string;
  customer: CustomerSnapshot;
  subject: string;
  status: "open" | "pending" | "resolved";
  channel: "chat" | "voice" | "email";
  lastMessageAt: string;
  unread: boolean;
  messages: {
    id: string;
    author: "customer" | "agent" | "assistant";
    body: string;
    audioUrl?: string | null;
    createdAt: string;
  }[];
  createdAt: string;
}
