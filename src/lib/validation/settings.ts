import { z } from "zod";

/** Every settings write is validated server-side before it is persisted. */
export const settingsSchema = z.object({
  store: z.object({
    name: z.string().trim().min(2, "Store name is required").max(80),
    supportEmail: z.string().trim().email("Enter a valid email"),
    supportPhone: z.string().trim().max(40),
    city: z.string().trim().min(2, "City is required").max(60),
    currency: z.literal("PKR"),
    timezone: z.string().trim().min(3),
  }),
  delivery: z.object({
    defaultFee: z.number().min(0, "Fee cannot be negative"),
    freeDeliveryThreshold: z.number().min(0).nullable(),
    defaultEtaMinutes: z.number().int().min(1).max(600),
    slots: z.array(z.string().trim().max(40)).max(12),
  }),
  tax: z.object({
    rate: z.number().min(0).max(100, "Tax rate must be a percentage"),
    pricesIncludeTax: z.boolean(),
  }),
  payments: z.object({
    cashOnDelivery: z.boolean(),
    jazzcash: z.boolean(),
    card: z.boolean(),
    bankTransfer: z.boolean(),
  }),
  catalog: z.object({
    lowStockThresholdDefault: z.number().int().min(0),
    reserveStockOnConfirm: z.boolean(),
  }),
  voice: z.object({
    autoConfirmDisabled: z.literal(true),
    lowConfidenceThreshold: z.number().min(0).max(1),
    audioRetentionDays: z.number().int().min(1).max(3650),
  }),
  featureFlags: z.record(z.string(), z.boolean()),
  analytics: z.object({
    revenueCountsFrom: z.enum(["accepted", "paid", "delivered"]),
    sessionAnalyticsConfigured: z.boolean(),
  }),
}).refine(
  (s) =>
    s.payments.cashOnDelivery || s.payments.jazzcash || s.payments.card || s.payments.bankTransfer,
  { message: "At least one payment method must stay enabled", path: ["payments"] },
);

export type SettingsInput = z.infer<typeof settingsSchema>;
