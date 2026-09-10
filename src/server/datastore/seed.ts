import "server-only";

import { HM_DEEP_NAVY, buildPalette } from "@/lib/media/palette";
import { buildSearchTokens, slugify } from "@/lib/utils/format";
import type {
  AdminUser,
  AppSettings,
  AuditLogEntry,
  Banner,
  Category,
  Coupon,
  Customer,
  InventoryMovement,
  NotificationRecord,
  Offer,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  Product,
  ProductMedia,
  Society,
  SupportConversation,
  Vendor,
  VoiceOrder,
} from "@/types";
import { COLLECTIONS } from "./types";
import type { LocalDatastore } from "./local";

/**
 * Seed data for the local development datastore.
 *
 * Grocery catalogue, delivery societies, order mix and voice-order shapes follow
 * the terminology of the existing HashmiMart storefront so the admin is
 * operating on the same vocabulary the business already uses.
 */

const DAY = 86_400_000;
const now = Date.now();
const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();

function media(cardBg: string, emoji: string, url: string): ProductMedia {
  return {
    source: {
      provider: "upload",
      providerId: null,
      sourcePageUrl: null,
      author: "HashmiMart supplier packshot",
      attributionText: "Supplier-owned packshot",
      hotlinkOnly: false,
    },
    original: { url, storageId: `seed/${emoji}`, width: 800, height: 800, mimeType: "image/webp" },
    cutout: null,
    palette: buildPalette({ dominant: cardBg, vibrant: cardBg, light: cardBg }, cardBg),
    processing: {
      backgroundRemoved: false,
      model: null,
      modelVersion: null,
      processedAt: null,
    },
  };
}

const CATEGORY_SEED: Array<[string, string, string, string, number]> = [
  ["cat-vegetables", "Fresh Vegetables", "🥬", "#E6F6EC", 1],
  ["cat-fruits", "Premium Fruits", "🍎", "#FDEEEA", 2],
  ["cat-dairy", "Dairy Essentials", "🥛", "#EAF2FD", 3],
  ["cat-bakery", "Bakery Fresh", "🥖", "#FBF1E2", 4],
  ["cat-rice", "Rice & Grains", "🍚", "#F3F0E8", 5],
  ["cat-oil", "Cooking Oil", "🫒", "#F1F5E6", 6],
  ["cat-spices", "Authentic Spices", "🌶️", "#FCEDE6", 7],
  ["cat-meat", "Meat & Poultry", "🍗", "#FBEAEA", 8],
  ["cat-beverages", "Beverages", "🧃", "#EAF7F8", 9],
  ["cat-household", "Household", "🧴", "#F0EEF9", 10],
];

interface ProductSeed {
  id: string;
  name: string;
  categoryId: string;
  price: number;
  compareAt?: number;
  unit: [Product["unit"]["type"], number, string];
  stock: number;
  threshold: number;
  emoji: string;
  cardBg: string;
  brand?: string;
  mode?: Product["shoppingMode"];
  wholesale?: number[];
  featured?: boolean;
  bestseller?: boolean;
  status?: Product["availability"]["status"];
  description: string;
}

const PRODUCT_SEED: ProductSeed[] = [
  { id: "p-tomato", name: "Fresh Tomatoes", categoryId: "cat-vegetables", price: 120, compareAt: 150, unit: ["kg", 1, "1 kg"], stock: 84, threshold: 20, emoji: "🍅", cardBg: "#FCE9E6", featured: true, bestseller: true, description: "Farm-fresh tomatoes picked daily from Kasur farms." },
  { id: "p-potato", name: "Potatoes", categoryId: "cat-vegetables", price: 85, unit: ["kg", 1, "1 kg"], stock: 12, threshold: 25, emoji: "🥔", cardBg: "#F6EFE2", description: "Everyday cooking potatoes, graded and washed." },
  { id: "p-onion", name: "Onions", categoryId: "cat-vegetables", price: 90, unit: ["kg", 1, "1 kg"], stock: 0, threshold: 20, emoji: "🧅", cardBg: "#F7EDE6", description: "Red onions with a firm bite." },
  { id: "p-spinach", name: "Spinach Bunch", categoryId: "cat-vegetables", price: 55, unit: ["pc", 1, "1 bunch"], stock: 46, threshold: 15, emoji: "🥬", cardBg: "#E9F6EC", description: "Tender palak, cleaned and bundled." },
  { id: "p-banana", name: "Bananas", categoryId: "cat-fruits", price: 180, unit: ["dozen", 1, "1 dozen"], stock: 31, threshold: 10, emoji: "🍌", cardBg: "#FBF4DE", bestseller: true, description: "Sweet ripened bananas from Sindh orchards." },
  { id: "p-apple", name: "Kashmiri Apples", categoryId: "cat-fruits", price: 320, compareAt: 380, unit: ["kg", 1, "1 kg"], stock: 22, threshold: 10, emoji: "🍎", cardBg: "#FBE8E9", featured: true, description: "Crisp red apples, hand-graded." },
  { id: "p-orange", name: "Kinnow Oranges", categoryId: "cat-fruits", price: 200, unit: ["kg", 1, "1 kg"], stock: 40, threshold: 12, emoji: "🍊", cardBg: "#FDF0E1", description: "Juicy Sargodha kinnow, in season." },
  { id: "p-milk", name: "Fresh Milk 1L", categoryId: "cat-dairy", price: 210, unit: ["L", 1, "1 litre"], stock: 64, threshold: 24, emoji: "🥛", cardBg: "#EBF2FD", brand: "Hashmi Dairy", featured: true, bestseller: true, description: "Chilled full-cream milk delivered same day." },
  { id: "p-yogurt", name: "Dahi 500g", categoryId: "cat-dairy", price: 150, unit: ["g", 500, "500 g"], stock: 38, threshold: 15, emoji: "🍶", cardBg: "#EEF3FB", brand: "Hashmi Dairy", description: "Thick set yoghurt, made fresh each morning." },
  { id: "p-butter", name: "Butter 250g", categoryId: "cat-dairy", price: 640, compareAt: 700, unit: ["g", 250, "250 g"], stock: 8, threshold: 12, emoji: "🧈", cardBg: "#FBF3DF", description: "Creamy salted butter block." },
  { id: "p-eggs", name: "Farm Eggs", categoryId: "cat-dairy", price: 340, unit: ["dozen", 1, "1 dozen"], stock: 54, threshold: 20, emoji: "🥚", cardBg: "#FAF3E6", bestseller: true, description: "Grade-A eggs, candled and packed." },
  { id: "p-bread", name: "Bakery Bread", categoryId: "cat-bakery", price: 160, unit: ["pc", 1, "1 loaf"], stock: 27, threshold: 12, emoji: "🍞", cardBg: "#F8EFE0", description: "Soft milk bread baked twice daily." },
  { id: "p-rusk", name: "Tea Rusk 350g", categoryId: "cat-bakery", price: 190, unit: ["g", 350, "350 g"], stock: 44, threshold: 15, emoji: "🥐", cardBg: "#F9F0E4", description: "Crisp rusk for chai." },
  { id: "p-basmati", name: "Basmati Rice", categoryId: "cat-rice", price: 1450, compareAt: 1600, unit: ["kg", 5, "5 kg"], stock: 19, threshold: 8, emoji: "🍚", cardBg: "#F4F1E9", brand: "Hashmi Select", featured: true, description: "Aged super kernel basmati, long grain." },
  { id: "p-basmati-bulk", name: "Basmati Rice (Bulk)", categoryId: "cat-rice", price: 260, unit: ["kg", 1, "1 kg"], stock: 320, threshold: 50, emoji: "🍚", cardBg: "#F4F1E9", mode: "wholesale", wholesale: [5, 10, 25, 50], description: "Bulk basmati rice at wholesale rates." },
  { id: "p-sella", name: "Sella Rice", categoryId: "cat-rice", price: 950, unit: ["kg", 5, "5 kg"], stock: 26, threshold: 10, emoji: "🍚", cardBg: "#F5F2EA", description: "Parboiled sella, holds shape in biryani." },
  { id: "p-sunflower", name: "Sunflower Oil", categoryId: "cat-oil", price: 1100, unit: ["L", 3, "3 litre"], stock: 30, threshold: 12, emoji: "🫗", cardBg: "#F7F3DF", bestseller: true, description: "Refined sunflower cooking oil." },
  { id: "p-sunflower-bulk", name: "Sunflower Oil (Bulk)", categoryId: "cat-oil", price: 520, unit: ["L", 1, "1 litre"], stock: 180, threshold: 40, emoji: "🫒", cardBg: "#F1F5E6", mode: "wholesale", wholesale: [5, 10, 20], description: "Refined oil — bulk pricing for businesses." },
  { id: "p-ghee", name: "Banaspati Ghee", categoryId: "cat-oil", price: 1250, unit: ["kg", 2.5, "2.5 kg"], stock: 5, threshold: 10, emoji: "🧈", cardBg: "#FAF2DE", description: "Classic cooking ghee tin." },
  { id: "p-redchilli", name: "Red Chilli Powder", categoryId: "cat-spices", price: 380, unit: ["g", 400, "400 g"], stock: 61, threshold: 20, emoji: "🌶️", cardBg: "#FBE7E1", description: "Stone-ground Ghotki chilli." },
  { id: "p-turmeric", name: "Turmeric Powder", categoryId: "cat-spices", price: 260, unit: ["g", 400, "400 g"], stock: 48, threshold: 20, emoji: "🟡", cardBg: "#FBF3DC", description: "Bright haldi, pure ground." },
  { id: "p-garam", name: "Garam Masala", categoryId: "cat-spices", price: 165, unit: ["g", 100, "100 g"], stock: 72, threshold: 20, emoji: "🧂", cardBg: "#F6EEE4", description: "House blend of nine spices." },
  { id: "p-chicken", name: "Chicken Breast", categoryId: "cat-meat", price: 720, unit: ["kg", 1, "1 kg"], stock: 16, threshold: 10, emoji: "🍗", cardBg: "#FBEBEB", featured: true, description: "Boneless breast, never frozen." },
  { id: "p-mutton", name: "Mutton Curry Cut", categoryId: "cat-meat", price: 2100, unit: ["kg", 1, "1 kg"], stock: 7, threshold: 6, emoji: "🥩", cardBg: "#FAE6E6", description: "Fresh curry cut, bone-in." },
  { id: "p-tea", name: "Black Tea 950g", categoryId: "cat-beverages", price: 1750, compareAt: 1900, unit: ["g", 950, "950 g"], stock: 23, threshold: 10, emoji: "🍵", cardBg: "#F1EDE6", bestseller: true, description: "Strong blend for doodh patti." },
  { id: "p-juice", name: "Mango Juice 1L", categoryId: "cat-beverages", price: 280, unit: ["L", 1, "1 litre"], stock: 52, threshold: 18, emoji: "🧃", cardBg: "#FBF1DE", description: "Chaunsa mango nectar." },
  { id: "p-water", name: "Mineral Water 1.5L", categoryId: "cat-beverages", price: 110, unit: ["L", 1.5, "1.5 litre"], stock: 140, threshold: 40, emoji: "💧", cardBg: "#E9F6F8", description: "Sealed drinking water bottle." },
  { id: "p-detergent", name: "Washing Powder 1kg", categoryId: "cat-household", price: 580, unit: ["kg", 1, "1 kg"], stock: 34, threshold: 12, emoji: "🧼", cardBg: "#EDF1FA", description: "High-foam detergent for hard water." },
  { id: "p-dishsoap", name: "Dishwash Liquid 500ml", categoryId: "cat-household", price: 320, unit: ["ml", 500, "500 ml"], stock: 41, threshold: 15, emoji: "🧴", cardBg: "#EFEDF9", description: "Cuts grease, lemon scent." },
  { id: "p-tissue", name: "Tissue Box", categoryId: "cat-household", price: 75, unit: ["pc", 1, "1 box"], stock: 96, threshold: 30, emoji: "🧻", cardBg: "#F3F3F7", status: "draft", description: "200-sheet soft facial tissue." },
];

const SOCIETY_SEED: Array<[string, string, number, number | null, number]> = [
  ["soc-dha", "DHA Phase 5", 120, 2500, 35],
  ["soc-bahria", "Bahria Town", 150, 3000, 45],
  ["soc-johar", "Johar Town", 100, 2000, 30],
  ["soc-model", "Model Town", 100, 2000, 30],
  ["soc-gulberg", "Gulberg III", 90, 2000, 25],
  ["soc-wapda", "WAPDA Town", 120, 2500, 40],
];

const CUSTOMER_SEED: Array<[string, string, string, string, number, number, number]> = [
  ["cus-talal", "Talal Hashmi", "talal@example.com", "+92 300 4412200", "soc-dha" as unknown as number, 14, 41250],
  ["cus-ayesha", "Ayesha Khan", "ayesha@example.com", "+92 321 7788112", "soc-bahria" as unknown as number, 9, 22840],
  ["cus-bilal", "Bilal Ahmed", "bilal@example.com", "+92 333 1122334", "soc-johar" as unknown as number, 21, 68900],
  ["cus-sana", "Sana Malik", "sana@example.com", "+92 345 9080706", "soc-model" as unknown as number, 4, 7650],
  ["cus-usman", "Usman Raza", "usman@example.com", "+92 301 5566778", "soc-gulberg" as unknown as number, 2, 3120],
  ["cus-hira", "Hira Nawaz", "hira@example.com", "+92 322 4433221", "soc-wapda" as unknown as number, 7, 15400],
];

function makeProduct(seed: ProductSeed, index: number): Product {
  const status = seed.status ?? "active";
  return {
    id: seed.id,
    name: seed.name,
    slug: slugify(seed.name),
    sku: `HM-${String(index + 1).padStart(4, "0")}`,
    barcode: null,
    brand: seed.brand ?? "HashmiMart",
    description: seed.description,
    categoryId: seed.categoryId,
    subcategoryId: null,
    shoppingMode: seed.mode ?? "retail",
    wholesaleOptions: seed.wholesale,
    tags: [seed.categoryId.replace("cat-", "")],
    searchTokens: buildSearchTokens(seed.name, seed.brand, seed.categoryId.replace("cat-", "")),
    emojiFallback: seed.emoji,
    unit: { type: seed.unit[0], quantity: seed.unit[1], label: seed.unit[2] },
    pricing: {
      price: seed.price,
      compareAtPrice: seed.compareAt ?? null,
      cost: Math.round(seed.price * 0.72),
      currency: "PKR",
      taxBehavior: "inclusive",
    },
    inventory: {
      track: true,
      stockOnHand: seed.stock,
      reserved: 0,
      lowStockThreshold: seed.threshold,
      allowOutOfStockVisibility: true,
    },
    media: media(seed.cardBg, seed.emoji, `/seed-media/${seed.id}.svg`),
    merchandising: {
      featured: seed.featured ?? false,
      bestseller: seed.bestseller ?? false,
      isNew: index > PRODUCT_SEED.length - 4,
      deal: Boolean(seed.compareAt),
      sortScore: 100 - index,
      searchKeywords: [],
    },
    availability: {
      status,
      publishedAt: status === "active" ? iso(-30 * DAY) : null,
      scheduledPublishAt: null,
      vendorIds: ["ven-main"],
    },
    seo: { shareTitle: seed.name, shareDescription: seed.description },
    createdAt: iso(-45 * DAY + index * 3600_000),
    updatedAt: iso(-index * 3600_000),
    createdBy: "seed",
    updatedBy: "seed",
  };
}

function pickItems(products: Product[], indices: number[], quantities: number[]): OrderItem[] {
  return indices.map((idx, i) => {
    const p = products[idx % products.length];
    const quantity = quantities[i] ?? 1;
    return {
      productId: p.id,
      name: p.name,
      sku: p.sku,
      unitLabel: p.unit.label,
      imageUrl: p.media?.original.url ?? null,
      emojiFallback: p.emojiFallback,
      price: p.pricing.price,
      compareAtPrice: p.pricing.compareAtPrice ?? null,
      quantity,
      lineTotal: Number((p.pricing.price * quantity).toFixed(2)),
    };
  });
}

export async function seedLocalDatastore(db: LocalDatastore): Promise<void> {
  const products = PRODUCT_SEED.map(makeProduct);

  /* Categories with live counts derived from the products above. */
  const categories: Category[] = CATEGORY_SEED.map(([id, name, icon, cardBg, sortOrder]) => {
    const own = products.filter((p) => p.categoryId === id);
    return {
      id,
      name,
      slug: slugify(name),
      parentId: null,
      description: `${name} available across HashmiMart delivery areas.`,
      icon,
      media: media(cardBg, icon, `/seed-media/${id}.svg`),
      sortOrder,
      status: "active",
      productCount: own.length,
      activeProductCount: own.filter((p) => p.availability.status === "active").length,
      hiddenProductCount: own.filter((p) => p.availability.status !== "active").length,
      lowStockCount: own.filter((p) => p.inventory.stockOnHand <= p.inventory.lowStockThreshold).length,
      createdAt: iso(-60 * DAY),
      updatedAt: iso(-2 * DAY),
    };
  });

  const societies: Society[] = SOCIETY_SEED.map(([id, name, fee, threshold, minutes], i) => ({
    id,
    name,
    city: "Lahore",
    deliveryFee: fee,
    freeDeliveryThreshold: threshold,
    estimatedMinutes: minutes,
    active: true,
    sortOrder: i + 1,
  }));

  const customers: Customer[] = CUSTOMER_SEED.map(([id, fullName, email, phone, societyId, orderCount, ltv], i) => ({
    uid: id,
    id,
    fullName,
    email,
    phone,
    society: societies.find((s) => s.id === (societyId as unknown as string))?.name ?? null,
    addresses: [
      {
        id: `${id}-addr-1`,
        label: "Home",
        line1: `House ${12 + i * 7}, Street ${3 + i}`,
        line2: null,
        society: societies.find((s) => s.id === (societyId as unknown as string))?.name ?? null,
        city: "Lahore",
        isDefault: true,
      },
    ],
    orderCount,
    lifetimeValue: ltv,
    lastOrderAt: iso(-(i + 1) * DAY),
    wishlistProductIds: products.slice(i, i + 3).map((p) => p.id),
    status: "active",
    createdAt: iso(-(120 - i * 9) * DAY),
    notes: null,
  })) as unknown as Customer[];

  /* Orders spread across the last 30 days so charts and KPIs have real data. */
  const statuses: OrderStatus[] = [
    "pending", "pending", "confirmed", "preparing", "ready",
    "out_for_delivery", "delivered", "delivered", "delivered", "cancelled",
  ];
  const payments: PaymentMethod[] = ["cash_on_delivery", "jazzcash", "cash_on_delivery", "card"];
  const orders: Order[] = [];

  for (let i = 0; i < 64; i++) {
    const customer = customers[i % customers.length];
    const society = societies[i % societies.length];
    const status = i < 10 ? statuses[i] : statuses[(i * 3) % statuses.length];
    const ageMs = i < 10 ? i * 2_400_000 : (i - 8) * 0.48 * DAY;
    const items = pickItems(products, [i, i + 5, i + 11, i + 17].slice(0, 2 + (i % 3)), [2, 1, 3, 1]);
    const subtotal = Number(items.reduce((s, it) => s + it.lineTotal, 0).toFixed(2));
    const deliveryFee = subtotal >= (society.freeDeliveryThreshold ?? Infinity) ? 0 : society.deliveryFee;
    const source = i % 7 === 3 ? "voice" : "cart";
    const createdAt = iso(-ageMs);
    const isFinal = status === "delivered" || status === "cancelled";
    orders.push({
      id: `ord-${String(i + 1).padStart(4, "0")}`,
      displayId: `HM-${String(4820 - i).padStart(4, "0")}`,
      customer: {
        uid: customer.uid,
        fullName: customer.fullName,
        phone: customer.phone,
        email: customer.email,
        society: society.name,
      },
      address: {
        line1: customer.addresses[0].line1,
        line2: null,
        society: society.name,
        city: "Lahore",
        notes: i % 5 === 0 ? "Ring the bell twice" : null,
      },
      items,
      totals: { subtotal, discount: 0, deliveryFee, tax: 0, grandTotal: Number((subtotal + deliveryFee).toFixed(2)) },
      paymentMethod: payments[i % payments.length],
      paymentStatus: status === "delivered" ? "paid" : status === "cancelled" ? "unpaid" : "unpaid",
      source,
      status,
      vendorId: "ven-main",
      couponCode: null,
      estimatedDeliveryMinutes: society.estimatedMinutes,
      notes: null,
      cancelReason: status === "cancelled" ? "Customer not reachable" : null,
      refundAmount: null,
      stockReserved: !isFinal && status !== "pending",
      voiceOrderId: source === "voice" ? `vo-${String(i + 1).padStart(4, "0")}` : null,
      createdAt,
      updatedAt: createdAt,
      events: [
        {
          id: `${i}-e1`,
          type: "status",
          from: null,
          to: "pending",
          note: source === "voice" ? "Created from reviewed voice order" : "Order placed by customer",
          actorUid: "system",
          actorName: "System",
          createdAt,
        },
      ],
    });
  }

  /* Voice orders — some already converted, some awaiting review. */
  const voiceOrders: VoiceOrder[] = [];
  const transcripts = [
    { text: "Do kilo tamatar, aik dozen anday aur aik litre doodh bhej dein.", items: [["Fresh Tomatoes", "p-tomato", 2, 0.94], ["Farm Eggs", "p-eggs", 1, 0.88], ["Fresh Milk 1L", "p-milk", 1, 0.91]] },
    { text: "Paanch kilo basmati chawal aur teen litre cooking oil chahiye.", items: [["Basmati Rice", "p-basmati", 1, 0.86], ["Sunflower Oil", "p-sunflower", 1, 0.79]] },
    { text: "Aik kilo chicken, aadha kilo mutton aur bread.", items: [["Chicken Breast", "p-chicken", 1, 0.92], ["Mutton Curry Cut", "p-mutton", 1, 0.61], ["Bakery Bread", "p-bread", 1, 0.9]] },
    { text: "Chai patti aur do packet biscuit bhej dein.", items: [["Black Tea 950g", "p-tea", 1, 0.83], ["", null, 2, 0.34]] },
    { text: "Sabzi ka saara saman — aloo pyaz timatar.", items: [["Potatoes", "p-potato", 2, 0.88], ["Onions", "p-onion", 2, 0.85], ["Fresh Tomatoes", "p-tomato", 1, 0.9]] },
  ];

  for (let i = 0; i < 9; i++) {
    const t = transcripts[i % transcripts.length];
    const customer = customers[i % customers.length];
    const society = societies[i % societies.length];
    const linked = orders.find((o) => o.voiceOrderId === `vo-${String(i + 1).padStart(4, "0")}`);
    const reviewStatus = linked ? "converted" : i < 4 ? "unreviewed" : i === 4 ? "in_review" : "unreviewed";
    voiceOrders.push({
      id: `vo-${String(i + 1).padStart(4, "0")}`,
      displayId: `VO-${String(320 - i).padStart(4, "0")}`,
      customer: {
        uid: customer.uid,
        fullName: customer.fullName,
        phone: customer.phone,
        email: customer.email,
        society: society.name,
      },
      audioUrl: null,
      audioDurationSeconds: 11 + (i % 5) * 4,
      waveform: Array.from({ length: 64 }, (_, n) => 0.25 + Math.abs(Math.sin((n + i) / 3.4)) * 0.7),
      transcript: t.text,
      transcriptLanguage: "ur-PK",
      detectedItems: t.items.map(([name, pid, qty, conf], n) => ({
        id: `vo-${i}-item-${n}`,
        rawText: String(name || "unrecognised item"),
        matchedProductId: (pid as string) ?? null,
        matchedProductName: (name as string) || null,
        quantity: Number(qty),
        unitLabel: products.find((p) => p.id === pid)?.unit.label ?? null,
        confidence: Number(conf),
        corrected: false,
      })),
      reviewStatus,
      linkedOrderId: linked?.id ?? null,
      reviewedBy: linked ? "seed" : null,
      reviewedAt: linked ? iso(-i * DAY) : null,
      rejectionReason: null,
      retentionExpiresAt: iso(90 * DAY),
      createdAt: iso(-(i * 5) * 3_600_000),
      updatedAt: iso(-(i * 5) * 3_600_000),
    });
  }

  const movements: InventoryMovement[] = products.slice(0, 14).map((p, i) => ({
    id: `mov-${i + 1}`,
    productId: p.id,
    productName: p.name,
    type: i % 3 === 0 ? "manual_add" : i % 3 === 1 ? "order_fulfil" : "manual_set",
    delta: i % 3 === 1 ? -(1 + (i % 4)) : 10 + i,
    before: p.inventory.stockOnHand - (i % 3 === 1 ? -(1 + (i % 4)) : 10 + i),
    after: p.inventory.stockOnHand,
    reason: i % 3 === 1 ? "Order fulfilment" : "Supplier delivery received",
    orderId: i % 3 === 1 ? orders[i]?.id ?? null : null,
    actorUid: "seed",
    actorName: "Seed data",
    createdAt: iso(-(i + 1) * 6 * 3_600_000),
  }));

  const vendors: Vendor[] = [
    {
      id: "ven-main",
      name: "HashmiMart Central Store",
      status: "active",
      contactName: "Store Manager",
      phone: "+92 42 3577 1122",
      email: "store@hashmimart.example",
      serviceAreaSocietyIds: societies.map((s) => s.id),
      openingHours: "08:00 – 23:00 daily",
      logoUrl: null,
      createdAt: iso(-200 * DAY),
    },
    {
      id: "ven-dha",
      name: "HashmiMart DHA Outlet",
      status: "active",
      contactName: "Outlet Lead",
      phone: "+92 42 3577 9088",
      email: "dha@hashmimart.example",
      serviceAreaSocietyIds: ["soc-dha", "soc-bahria"],
      openingHours: "09:00 – 22:00 daily",
      logoUrl: null,
      createdAt: iso(-90 * DAY),
    },
  ];

  const coupons: Coupon[] = [
    { id: "cpn-welcome", code: "WELCOME150", type: "fixed", value: 150, minOrderValue: 1500, maxDiscount: null, usageLimitTotal: 500, usageLimitPerCustomer: 1, usedCount: 138, scopeCategoryIds: [], scopeProductIds: [], startsAt: iso(-30 * DAY), endsAt: iso(30 * DAY), status: "active", createdAt: iso(-30 * DAY) },
    { id: "cpn-freedel", code: "FREEDEL", type: "free_delivery", value: 0, minOrderValue: 2000, maxDiscount: null, usageLimitTotal: null, usageLimitPerCustomer: 4, usedCount: 412, scopeCategoryIds: [], scopeProductIds: [], startsAt: iso(-60 * DAY), endsAt: null, status: "active", createdAt: iso(-60 * DAY) },
    { id: "cpn-dairy10", code: "DAIRY10", type: "percentage", value: 10, minOrderValue: null, maxDiscount: 300, usageLimitTotal: 200, usageLimitPerCustomer: 2, usedCount: 61, scopeCategoryIds: ["cat-dairy"], scopeProductIds: [], startsAt: iso(2 * DAY), endsAt: iso(20 * DAY), status: "scheduled", createdAt: iso(-3 * DAY) },
    { id: "cpn-eid", code: "EID2026", type: "percentage", value: 15, minOrderValue: 3000, maxDiscount: 1000, usageLimitTotal: 1000, usageLimitPerCustomer: 1, usedCount: 1000, scopeCategoryIds: [], scopeProductIds: [], startsAt: iso(-120 * DAY), endsAt: iso(-90 * DAY), status: "expired", createdAt: iso(-130 * DAY) },
  ];

  const offers: Offer[] = [
    { id: "off-fruit", name: "Fruit Friday", discountType: "percentage", value: 12, productIds: [], categoryIds: ["cat-fruits"], startsAt: iso(-2 * DAY), endsAt: iso(5 * DAY), status: "active", createdAt: iso(-6 * DAY) },
    { id: "off-rice", name: "Rice Stock-up", discountType: "fixed", value: 150, productIds: ["p-basmati", "p-sella"], categoryIds: [], startsAt: iso(3 * DAY), endsAt: iso(17 * DAY), status: "scheduled", createdAt: iso(-1 * DAY) },
  ];

  const banners: Banner[] = [
    { id: "ban-hero", title: "Fresh & Fast Delivery", subtitle: "Groceries at your door in under 45 minutes", imageUrl: null, palette: buildPalette({ dominant: "#06B6D4" }, "#E0F7FA"), ctaLabel: "Shop now", ctaLink: "/products/retail", audience: "all", placement: "home_hero", startsAt: iso(-10 * DAY), endsAt: null, sortOrder: 1, status: "live", createdAt: iso(-10 * DAY) },
    { id: "ban-wholesale", title: "Wholesale Rates", subtitle: "Bulk quantities at better rates for businesses", imageUrl: null, palette: buildPalette({ dominant: "#0E7490" }, "#E6F6F8"), ctaLabel: "Explore wholesale", ctaLink: "/products/wholesale", audience: "all", placement: "home_strip", startsAt: iso(-4 * DAY), endsAt: null, sortOrder: 2, status: "live", createdAt: iso(-4 * DAY) },
    { id: "ban-eid", title: "Eid Essentials", subtitle: "Everything for the big day", imageUrl: null, palette: buildPalette({ dominant: "#8B5CF6" }, "#F1EDFB"), ctaLabel: "See the list", ctaLink: "/collections/eid", audience: "returning_customers", placement: "home_hero", startsAt: iso(9 * DAY), endsAt: iso(24 * DAY), sortOrder: 3, status: "scheduled", createdAt: iso(-1 * DAY) },
  ];

  const notifications: NotificationRecord[] = orders.slice(0, 12).map((o, i) => ({
    id: `ntf-${i + 1}`,
    kind: "transactional",
    audience: "staff",
    title: `New order ${o.displayId}`,
    message: `${o.customer.fullName} — Rs ${o.totals.grandTotal.toFixed(0)} · ${o.address.society ?? "—"}`,
    orderId: o.id,
    status: "sent",
    isRead: i > 3,
    sentAt: o.createdAt,
    createdAt: o.createdAt,
  }));

  const auditLogs: AuditLogEntry[] = [
    { id: "aud-1", actorUid: "seed", actorName: "Seed data", action: "product.publish", entityType: "product", entityId: "p-basmati", beforeSummary: "status: draft", afterSummary: "status: active", timestamp: iso(-2 * DAY) },
    { id: "aud-2", actorUid: "seed", actorName: "Seed data", action: "price.change", entityType: "product", entityId: "p-apple", beforeSummary: "price: Rs 380", afterSummary: "price: Rs 320", reason: "Seasonal promotion", timestamp: iso(-3 * DAY) },
    { id: "aud-3", actorUid: "seed", actorName: "Seed data", action: "inventory.adjust", entityType: "product", entityId: "p-potato", beforeSummary: "stock: 40", afterSummary: "stock: 12", reason: "Damaged crate written off", timestamp: iso(-1 * DAY) },
  ];

  const supportConversations: SupportConversation[] = [
    {
      id: "sup-1",
      customer: { uid: "cus-sana", fullName: "Sana Malik", phone: "+92 345 9080706", email: "sana@example.com", society: "Model Town" },
      subject: "Missing item in order HM-4815",
      status: "open",
      channel: "chat",
      lastMessageAt: iso(-3 * 3_600_000),
      unread: true,
      messages: [
        { id: "m1", author: "customer", body: "My order arrived but the bread was missing.", createdAt: iso(-4 * 3_600_000) },
        { id: "m2", author: "assistant", body: "I'm sorry about that — let me check the packing slip for HM-4815.", createdAt: iso(-3.5 * 3_600_000) },
        { id: "m3", author: "customer", body: "Thank you, please refund it.", createdAt: iso(-3 * 3_600_000) },
      ],
      createdAt: iso(-4 * 3_600_000),
    },
    {
      id: "sup-2",
      customer: { uid: "cus-usman", fullName: "Usman Raza", phone: "+92 301 5566778", email: "usman@example.com", society: "Gulberg III" },
      subject: "Voice note order",
      status: "pending",
      channel: "voice",
      lastMessageAt: iso(-26 * 3_600_000),
      unread: false,
      messages: [
        { id: "m1", author: "customer", body: "Voice note (0:14)", audioUrl: null, createdAt: iso(-26 * 3_600_000) },
      ],
      createdAt: iso(-26 * 3_600_000),
    },
  ];

  const settings: AppSettings & { id: string } = {
    id: "settings",
    store: {
      name: "HashmiMart",
      supportEmail: "support@hashmimart.example",
      supportPhone: "+92 42 3577 1122",
      city: "Lahore",
      currency: "PKR",
      timezone: "Asia/Karachi",
    },
    delivery: { defaultFee: 120, freeDeliveryThreshold: 2500, defaultEtaMinutes: 45, slots: ["09:00–12:00", "12:00–15:00", "15:00–18:00", "18:00–21:00"] },
    tax: { rate: 0, pricesIncludeTax: true },
    payments: { cashOnDelivery: true, jazzcash: true, card: false, bankTransfer: false },
    catalog: { lowStockThresholdDefault: 15, reserveStockOnConfirm: true },
    voice: { autoConfirmDisabled: true, lowConfidenceThreshold: 0.7, audioRetentionDays: 90 },
    featureFlags: { wholesaleMode: true, voiceOrders: true, supportChat: true, banners: true },
    analytics: { revenueCountsFrom: "accepted", sessionAnalyticsConfigured: false },
  };

  const admins: AdminUser[] = [
    { uid: "adm-owner", email: "admin@hashmimart.example", displayName: "Store Owner", role: "super_admin", active: true, createdAt: iso(-200 * DAY) },
    { uid: "adm-catalog", email: "catalog@hashmimart.example", displayName: "Catalog Manager", role: "catalog_manager", active: true, createdAt: iso(-120 * DAY) },
    { uid: "adm-orders", email: "orders@hashmimart.example", displayName: "Order Desk", role: "order_manager", active: true, createdAt: iso(-90 * DAY) },
    { uid: "adm-support", email: "support@hashmimart.example", displayName: "Support Agent", role: "support_agent", active: true, createdAt: iso(-45 * DAY) },
    { uid: "adm-analyst", email: "analyst@hashmimart.example", displayName: "Business Analyst", role: "analyst", active: false, createdAt: iso(-20 * DAY) },
  ];

  const write = async <T extends { id: string }>(name: string, docs: T[]) => {
    const col = db.collection<T>(name);
    for (const doc of docs) await col.set(doc);
  };

  await write(COLLECTIONS.products, products);
  await write(COLLECTIONS.categories, categories);
  await write(COLLECTIONS.societies, societies);
  await write(COLLECTIONS.customers, customers as unknown as Array<Customer & { id: string }>);
  await write(COLLECTIONS.orders, orders);
  await write(COLLECTIONS.voiceOrders, voiceOrders);
  await write(COLLECTIONS.inventoryMovements, movements);
  await write(COLLECTIONS.vendors, vendors);
  await write(COLLECTIONS.coupons, coupons);
  await write(COLLECTIONS.offers, offers);
  await write(COLLECTIONS.banners, banners);
  await write(COLLECTIONS.notifications, notifications);
  await write(COLLECTIONS.auditLogs, auditLogs);
  await write(COLLECTIONS.supportConversations, supportConversations);
  await write(COLLECTIONS.appConfig, [settings]);
  await write(COLLECTIONS.admins, admins.map((a) => ({ ...a, id: a.uid })));
}
