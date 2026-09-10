import { z } from "zod";

export const couponSchema = z
  .object({
    id: z.string().optional(),
    code: z
      .string()
      .trim()
      .min(3, "Codes are at least 3 characters")
      .max(24)
      .regex(/^[A-Z0-9_-]+$/, "Use uppercase letters, numbers, hyphen or underscore"),
    type: z.enum(["fixed", "percentage", "free_delivery"]),
    value: z.number().min(0),
    minOrderValue: z.number().min(0).nullable(),
    maxDiscount: z.number().min(0).nullable(),
    usageLimitTotal: z.number().int().min(1).nullable(),
    usageLimitPerCustomer: z.number().int().min(1).nullable(),
    scopeCategoryIds: z.array(z.string()),
    scopeProductIds: z.array(z.string()),
    startsAt: z.string().min(1, "A start date is required"),
    endsAt: z.string().nullable(),
    status: z.enum(["scheduled", "active", "expired", "disabled"]),
  })
  .refine((c) => c.type !== "percentage" || (c.value > 0 && c.value <= 100), {
    message: "A percentage must be between 1 and 100",
    path: ["value"],
  })
  .refine((c) => c.type !== "fixed" || c.value > 0, {
    message: "A fixed discount must be above zero",
    path: ["value"],
  })
  .refine((c) => !c.endsAt || new Date(c.endsAt) > new Date(c.startsAt), {
    message: "The end date must be after the start date",
    path: ["endsAt"],
  });

export type CouponInput = z.infer<typeof couponSchema>;

export const offerSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(2, "Give the offer a name").max(80),
    discountType: z.enum(["percentage", "fixed"]),
    value: z.number().positive("Discount must be above zero"),
    productIds: z.array(z.string()),
    categoryIds: z.array(z.string()),
    startsAt: z.string().min(1, "A start date is required"),
    endsAt: z.string().nullable(),
    status: z.enum(["scheduled", "active", "expired", "disabled"]),
  })
  .refine((o) => o.productIds.length > 0 || o.categoryIds.length > 0, {
    message: "Scope the offer to at least one product or category",
    path: ["productIds"],
  })
  .refine((o) => o.discountType !== "percentage" || o.value <= 100, {
    message: "A percentage cannot exceed 100",
    path: ["value"],
  });

export type OfferInput = z.infer<typeof offerSchema>;

export const bannerSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(2, "Give the banner a title").max(80),
  subtitle: z.string().trim().max(140).nullable(),
  imageUrl: z.string().nullable(),
  ctaLabel: z.string().trim().max(40).nullable(),
  ctaLink: z.string().trim().max(200).nullable(),
  audience: z.enum(["all", "new_customers", "returning_customers"]),
  placement: z.enum(["home_hero", "home_strip", "category_top"]),
  startsAt: z.string().min(1, "A start date is required"),
  endsAt: z.string().nullable(),
  sortOrder: z.number().int().min(0),
  status: z.enum(["draft", "scheduled", "live", "expired"]),
});

export type BannerInput = z.infer<typeof bannerSchema>;

export const societySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Name the delivery area").max(80),
  city: z.string().trim().min(2, "City is required").max(60),
  deliveryFee: z.number().min(0),
  freeDeliveryThreshold: z.number().min(0).nullable(),
  estimatedMinutes: z.number().int().min(1, "Estimate at least one minute").max(600),
  active: z.boolean(),
  sortOrder: z.number().int().min(0),
});

export type SocietyInput = z.infer<typeof societySchema>;

export const vendorSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Name the vendor or store").max(80),
  status: z.enum(["active", "paused", "disabled"]),
  contactName: z.string().trim().max(80).nullable(),
  phone: z.string().trim().max(40).nullable(),
  email: z.string().trim().email("Enter a valid email").nullable().or(z.literal("").transform(() => null)),
  serviceAreaSocietyIds: z.array(z.string()),
  openingHours: z.string().trim().max(120).nullable(),
  logoUrl: z.string().nullable(),
});

export type VendorInput = z.infer<typeof vendorSchema>;
