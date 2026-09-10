import { z } from "zod";

/**
 * Zod schemas guard every write boundary (PRD §10.3) — browser form state is
 * never trusted, the same schema runs again inside the server action.
 */

export const UNIT_TYPES = ["pc", "kg", "g", "L", "ml", "dozen", "pack"] as const;
export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export const SHOPPING_MODES = ["retail", "wholesale"] as const;
export const TAX_BEHAVIOURS = ["inclusive", "exclusive", "exempt"] as const;

const hex = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Must be a hex colour like #06B6D4");

export const mediaSourceSchema = z.object({
  provider: z.enum(["pixabay", "pexels", "unsplash", "upload", "library"]),
  providerId: z.string().nullable(),
  sourcePageUrl: z.string().url().nullable(),
  author: z.string().nullable(),
  authorUrl: z.string().url().nullable().optional(),
  attributionText: z.string().nullable(),
  hotlinkOnly: z.boolean(),
  licenseNote: z.string().nullable().optional(),
});

export const mediaAssetSchema = z.object({
  url: z.string().min(1),
  storageId: z.string().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  mimeType: z.string().nullable(),
  bytes: z.number().int().nonnegative().nullable().optional(),
});

export const paletteSchema = z.object({
  dominant: hex.nullable(),
  vibrant: hex.nullable(),
  muted: hex.nullable(),
  light: hex.nullable(),
  dark: hex.nullable(),
  cardBg: hex,
  textColor: hex,
});

export const productMediaSchema = z.object({
  source: mediaSourceSchema,
  original: mediaAssetSchema,
  cutout: mediaAssetSchema.nullable(),
  palette: paletteSchema,
  processing: z.object({
    backgroundRemoved: z.boolean(),
    model: z.string().nullable(),
    modelVersion: z.string().nullable(),
    processedAt: z.string().nullable(),
    failureReason: z.string().nullable().optional(),
  }),
  gallery: z.array(mediaAssetSchema).optional(),
});

/** Everything a draft must satisfy. Draft save is always allowed (§4.3). */
export const productDraftSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens"),
  sku: z.string().trim().min(2, "SKU is required").max(40),
  barcode: z.string().trim().max(40).nullable().optional(),
  brand: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  categoryId: z.string().min(1, "Choose a category"),
  subcategoryId: z.string().nullable().optional(),
  shoppingMode: z.enum(SHOPPING_MODES),
  wholesaleOptions: z.array(z.number().int().positive()).max(8).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20),
  emojiFallback: z.string().trim().max(8).nullable().optional(),

  unit: z.object({
    type: z.enum(UNIT_TYPES),
    quantity: z.number().positive("Quantity must be greater than zero"),
    label: z.string().trim().min(1, "Display label is required").max(40),
  }),

  pricing: z.object({
    price: z.number().nonnegative("Price cannot be negative"),
    compareAtPrice: z.number().nonnegative().nullable().optional(),
    cost: z.number().nonnegative().nullable().optional(),
    currency: z.literal("PKR"),
    taxBehavior: z.enum(TAX_BEHAVIOURS),
  }),

  inventory: z.object({
    track: z.boolean(),
    stockOnHand: z.number().int("Stock must be a whole number").min(0),
    reserved: z.number().int().min(0),
    lowStockThreshold: z.number().int().min(0),
    allowOutOfStockVisibility: z.boolean(),
  }),

  media: productMediaSchema.nullable(),

  merchandising: z.object({
    featured: z.boolean(),
    bestseller: z.boolean(),
    isNew: z.boolean(),
    deal: z.boolean(),
    sortScore: z.number().int(),
    searchKeywords: z.array(z.string().trim().max(40)).max(30),
  }),

  availability: z.object({
    status: z.enum(PRODUCT_STATUSES),
    publishedAt: z.string().nullable().optional(),
    scheduledPublishAt: z.string().nullable().optional(),
    vendorIds: z.array(z.string()),
  }),

  seo: z
    .object({
      shareTitle: z.string().trim().max(120).nullable().optional(),
      shareDescription: z.string().trim().max(300).nullable().optional(),
    })
    .optional(),
});

export type ProductDraftInput = z.infer<typeof productDraftSchema>;

/**
 * Extra rules a product must clear before it can be published (§4.3).
 * Draft save stays available regardless of these.
 */
export const productPublishSchema = productDraftSchema
  .refine((p) => p.pricing.price > 0, {
    message: "A published product needs a price above zero",
    path: ["pricing", "price"],
  })
  .refine(
    (p) => !p.pricing.compareAtPrice || p.pricing.compareAtPrice > p.pricing.price,
    { message: "Compare-at price must be higher than the selling price", path: ["pricing", "compareAtPrice"] },
  )
  .refine((p) => Boolean(p.description && p.description.trim().length >= 10), {
    message: "Add a description of at least 10 characters before publishing",
    path: ["description"],
  })
  .refine((p) => Boolean(p.media) || Boolean(p.emojiFallback), {
    message: "Add a product image, or set an emoji fallback, before publishing",
    path: ["media"],
  })
  .refine((p) => !p.inventory.track || p.inventory.lowStockThreshold >= 0, {
    message: "Set a low-stock threshold when stock is tracked",
    path: ["inventory", "lowStockThreshold"],
  });

/** The four checkpoints shown in the create wizard (§4.3). */
export interface ProductChecklist {
  basics: boolean;
  media: boolean;
  pricingInventory: boolean;
  publishable: boolean;
  issues: { path: string; message: string }[];
}

export function evaluateProduct(input: unknown): ProductChecklist {
  const draft = productDraftSchema.safeParse(input);
  const basics = draft.success;
  const value = draft.success ? draft.data : null;

  const media = Boolean(value?.media) || Boolean(value?.emojiFallback);
  const pricingInventory = Boolean(
    value &&
      value.pricing.price > 0 &&
      (!value.inventory.track || value.inventory.stockOnHand >= 0),
  );

  const publish = productPublishSchema.safeParse(input);
  const issues = publish.success
    ? []
    : publish.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));

  return { basics, media, pricingInventory, publishable: publish.success, issues };
}

export const bulkActionSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Select at least one product").max(500),
  action: z.enum([
    "publish",
    "unpublish",
    "archive",
    "restore",
    "move_category",
    "set_threshold",
    "feature",
    "unfeature",
  ]),
  categoryId: z.string().optional(),
  threshold: z.number().int().min(0).optional(),
});

export type BulkActionInput = z.infer<typeof bulkActionSchema>;
