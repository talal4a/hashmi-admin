import { describe, expect, it } from "vitest";
import {
  bulkActionSchema,
  evaluateProduct,
  productDraftSchema,
  productPublishSchema,
} from "@/lib/validation/product";
import { categorySchema } from "@/lib/validation/category";
import { couponSchema, societySchema } from "@/lib/validation/marketing";
import { settingsSchema } from "@/lib/validation/settings";
import { buildSearchTokens, slugify } from "@/lib/utils/format";
import { can, effectivePermissions, permissionsForRole } from "@/lib/auth/permissions";

const draft = {
  name: "Fresh Tomatoes",
  slug: "fresh-tomatoes",
  sku: "HM-0001",
  categoryId: "cat-vegetables",
  shoppingMode: "retail" as const,
  tags: ["vegetables"],
  unit: { type: "kg" as const, quantity: 1, label: "1 kg" },
  pricing: {
    price: 120,
    compareAtPrice: 150,
    currency: "PKR" as const,
    taxBehavior: "inclusive" as const,
  },
  inventory: {
    track: true,
    stockOnHand: 40,
    reserved: 0,
    lowStockThreshold: 10,
    allowOutOfStockVisibility: true,
  },
  media: null,
  merchandising: {
    featured: false,
    bestseller: false,
    isNew: true,
    deal: true,
    sortScore: 50,
    searchKeywords: [],
  },
  availability: { status: "draft" as const, vendorIds: ["ven-main"] },
};

describe("productDraftSchema", () => {
  it("accepts a minimal valid draft", () => {
    expect(productDraftSchema.safeParse(draft).success).toBe(true);
  });

  it("rejects a slug with spaces or capitals", () => {
    expect(productDraftSchema.safeParse({ ...draft, slug: "Fresh Tomatoes" }).success).toBe(false);
  });

  it("rejects a negative price", () => {
    const result = productDraftSchema.safeParse({
      ...draft,
      pricing: { ...draft.pricing, price: -1 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects fractional stock", () => {
    const result = productDraftSchema.safeParse({
      ...draft,
      inventory: { ...draft.inventory, stockOnHand: 1.5 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing category", () => {
    expect(productDraftSchema.safeParse({ ...draft, categoryId: "" }).success).toBe(false);
  });
});

describe("productPublishSchema", () => {
  const publishable = {
    ...draft,
    description: "Farm-fresh tomatoes picked daily.",
    emojiFallback: "🍅",
  };

  it("accepts a product that clears every publish rule", () => {
    expect(productPublishSchema.safeParse(publishable).success).toBe(true);
  });

  it("blocks publishing without a description", () => {
    const result = productPublishSchema.safeParse({ ...publishable, description: "short" });
    expect(result.success).toBe(false);
  });

  it("blocks publishing with no media and no emoji fallback", () => {
    const result = productPublishSchema.safeParse({
      ...publishable,
      media: null,
      emojiFallback: null,
    });
    expect(result.success).toBe(false);
  });

  it("blocks publishing at a zero price", () => {
    const result = productPublishSchema.safeParse({
      ...publishable,
      pricing: { ...publishable.pricing, price: 0 },
    });
    expect(result.success).toBe(false);
  });

  it("blocks a compare-at price at or below the selling price", () => {
    const result = productPublishSchema.safeParse({
      ...publishable,
      pricing: { ...publishable.pricing, compareAtPrice: 100 },
    });
    expect(result.success).toBe(false);
  });
});

describe("evaluateProduct checklist", () => {
  it("marks basics valid but publishing blocked on an incomplete draft", () => {
    const checklist = evaluateProduct(draft);
    expect(checklist.basics).toBe(true);
    expect(checklist.publishable).toBe(false);
    expect(checklist.issues.length).toBeGreaterThan(0);
  });

  it("marks everything complete once the publish rules pass", () => {
    const checklist = evaluateProduct({
      ...draft,
      description: "Farm-fresh tomatoes picked daily.",
      emojiFallback: "🍅",
    });
    expect(checklist).toMatchObject({
      basics: true,
      media: true,
      pricingInventory: true,
      publishable: true,
    });
    expect(checklist.issues).toHaveLength(0);
  });

  it("does not throw on completely malformed input", () => {
    expect(() => evaluateProduct({ nonsense: true })).not.toThrow();
    expect(evaluateProduct({ nonsense: true }).basics).toBe(false);
  });

  it("reports each field once, however many rules it breaks", () => {
    // An empty slug is both too short and not in slug format. The checklist
    // renders one line per entry keyed by path, so two entries for one field
    // both wasted a line and produced a duplicate React key.
    const checklist = evaluateProduct({ ...draft, name: "", slug: "" });
    const paths = checklist.issues.map((issue) => issue.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.filter((path) => path === "slug")).toHaveLength(1);
  });

  it("explains an empty slug in terms of the name it comes from", () => {
    const checklist = evaluateProduct({ ...draft, slug: "" });
    const slugIssue = checklist.issues.find((issue) => issue.path === "slug");
    expect(slugIssue?.message).toMatch(/fills in from the product name/);
  });
});

describe("bulkActionSchema", () => {
  it("requires at least one id", () => {
    expect(bulkActionSchema.safeParse({ ids: [], action: "publish" }).success).toBe(false);
  });

  it("rejects an unknown action", () => {
    expect(bulkActionSchema.safeParse({ ids: ["p1"], action: "explode" }).success).toBe(false);
  });
});

describe("categorySchema", () => {
  it("accepts a top-level category", () => {
    const result = categorySchema.safeParse({
      name: "Fresh Vegetables",
      slug: "fresh-vegetables",
      parentId: null,
      media: null,
      sortOrder: 1,
      status: "active",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a bad slug", () => {
    const result = categorySchema.safeParse({
      name: "Fresh Vegetables",
      slug: "Fresh Vegetables!",
      parentId: null,
      media: null,
      sortOrder: 1,
      status: "active",
    });
    expect(result.success).toBe(false);
  });
});

describe("couponSchema", () => {
  const base = {
    code: "WELCOME150",
    type: "fixed" as const,
    value: 150,
    minOrderValue: null,
    maxDiscount: null,
    usageLimitTotal: null,
    usageLimitPerCustomer: null,
    scopeCategoryIds: [],
    scopeProductIds: [],
    startsAt: "2024-01-01T00:00:00.000Z",
    endsAt: null,
    status: "active" as const,
  };

  it("accepts a valid fixed coupon", () => {
    expect(couponSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a lowercase code", () => {
    expect(couponSchema.safeParse({ ...base, code: "welcome" }).success).toBe(false);
  });

  it("rejects a percentage above 100", () => {
    const result = couponSchema.safeParse({ ...base, type: "percentage", value: 150 });
    expect(result.success).toBe(false);
  });

  it("rejects an end date before the start", () => {
    const result = couponSchema.safeParse({ ...base, endsAt: "2023-01-01T00:00:00.000Z" });
    expect(result.success).toBe(false);
  });
});

describe("societySchema", () => {
  it("rejects a negative delivery fee", () => {
    const result = societySchema.safeParse({
      name: "DHA Phase 5",
      city: "Lahore",
      deliveryFee: -10,
      freeDeliveryThreshold: null,
      estimatedMinutes: 40,
      active: true,
      sortOrder: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("settingsSchema", () => {
  const base = {
    store: {
      name: "HashmiMart",
      supportEmail: "support@hashmimart.example",
      supportPhone: "",
      city: "Lahore",
      currency: "PKR" as const,
      timezone: "Asia/Karachi",
    },
    delivery: { defaultFee: 120, freeDeliveryThreshold: 2500, defaultEtaMinutes: 45, slots: [] },
    tax: { rate: 0, pricesIncludeTax: true },
    payments: { cashOnDelivery: true, jazzcash: false, card: false, bankTransfer: false },
    catalog: { lowStockThresholdDefault: 15, reserveStockOnConfirm: true },
    voice: { autoConfirmDisabled: true as const, lowConfidenceThreshold: 0.7, audioRetentionDays: 90 },
    featureFlags: { voiceOrders: true },
    analytics: { revenueCountsFrom: "accepted" as const, sessionAnalyticsConfigured: false },
  };

  it("accepts a valid settings document", () => {
    expect(settingsSchema.safeParse(base).success).toBe(true);
  });

  it("refuses to disable every payment method", () => {
    const result = settingsSchema.safeParse({
      ...base,
      payments: { cashOnDelivery: false, jazzcash: false, card: false, bankTransfer: false },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a tax rate above 100", () => {
    expect(settingsSchema.safeParse({ ...base, tax: { rate: 120, pricesIncludeTax: true } }).success).toBe(false);
  });

  it("will not let voice auto-confirm be turned on", () => {
    const result = settingsSchema.safeParse({
      ...base,
      voice: { ...base.voice, autoConfirmDisabled: false },
    });
    expect(result.success).toBe(false);
  });
});

describe("slug and search helpers", () => {
  it("slugifies names predictably", () => {
    expect(slugify("Fresh Tomatoes")).toBe("fresh-tomatoes");
    expect(slugify("  Basmati Rice (Bulk) ")).toBe("basmati-rice-bulk");
    expect(slugify("Dahi 500g")).toBe("dahi-500g");
  });

  it("builds prefix tokens so partial search matches", () => {
    const tokens = buildSearchTokens("Fresh Milk");
    expect(tokens).toContain("milk");
    expect(tokens).toContain("mil");
    expect(tokens).toContain("fresh");
    // Single characters are too noisy to index.
    expect(tokens).not.toContain("m");
  });
});

describe("RBAC matrix", () => {
  it("gives super admins every module", () => {
    expect(permissionsForRole("super_admin")).toContain("settings.write");
    expect(permissionsForRole("super_admin")).toContain("admins.write");
  });

  it("keeps an analyst read-only", () => {
    const analyst = permissionsForRole("analyst");
    expect(analyst.some((p) => p.endsWith(".write"))).toBe(false);
    expect(analyst).toContain("analytics.view");
  });

  it("does not let a catalog manager touch orders or staff", () => {
    const user = { role: "catalog_manager" as const };
    expect(can(user, "products.publish")).toBe(true);
    expect(can(user, "orders.write")).toBe(false);
    expect(can(user, "admins.write")).toBe(false);
  });

  it("does not let an order manager publish catalog changes", () => {
    const user = { role: "order_manager" as const };
    expect(can(user, "orders.refund")).toBe(true);
    expect(can(user, "products.write")).toBe(false);
  });

  it("denies everything for a missing user", () => {
    expect(can(null, "dashboard.view")).toBe(false);
    expect(can(undefined, "orders.view")).toBe(false);
  });

  it("honours a per-user permission override", () => {
    const user = { role: "analyst" as const, permissionsOverride: ["orders.write" as const] };
    expect(can(user, "orders.write")).toBe(true);
    expect(effectivePermissions(user).length).toBeGreaterThan(permissionsForRole("analyst").length);
  });
});
