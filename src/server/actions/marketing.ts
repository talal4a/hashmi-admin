"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";
import { assertPermission } from "@/lib/auth/require-admin";
import {
  bannerSchema,
  couponSchema,
  offerSchema,
  societySchema,
  vendorSchema,
} from "@/lib/validation/marketing";
import { recordAudit } from "@/server/repositories/audit";
import { newId, nowIso } from "@/server/repositories/base";
import {
  deleteBanner,
  deleteCoupon,
  deleteOffer,
  deleteSociety,
  deleteVendor,
  listBanners,
  listCoupons,
  listOffers,
  listSocieties,
  listVendors,
  reorderBanners,
  saveBanner,
  saveCoupon,
  saveOffer,
  saveSociety,
  saveVendor,
} from "@/server/repositories/misc";
import { allOrders } from "@/server/repositories/orders";
import type { Banner, Coupon, Offer, Society, Vendor } from "@/types";
import { fail, failure, ok, type ActionResult } from "./result";

function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function revalidateMarketing() {
  revalidatePath("/offers");
  revalidatePath("/banners");
  revalidatePath("/dashboard");
}

/* Coupons ------------------------------------------------------------ */

export async function saveCouponAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await assertPermission("marketing.write");
    const parsed = couponSchema.safeParse(raw);
    if (!parsed.success) return fail("Some fields need attention.", fieldErrors(parsed.error));

    const input = parsed.data;
    const existing = input.id ? (await listCoupons()).find((c) => c.id === input.id) : undefined;

    const clash = (await listCoupons()).find(
      (c) => c.code === input.code && c.id !== existing?.id,
    );
    if (clash) return fail("That code is already in use.", { code: "Code must be unique" });

    const coupon: Coupon = {
      id: existing?.id ?? newId("cpn"),
      code: input.code,
      type: input.type,
      value: input.type === "free_delivery" ? 0 : input.value,
      minOrderValue: input.minOrderValue,
      maxDiscount: input.maxDiscount,
      usageLimitTotal: input.usageLimitTotal,
      usageLimitPerCustomer: input.usageLimitPerCustomer,
      usedCount: existing?.usedCount ?? 0,
      scopeCategoryIds: input.scopeCategoryIds,
      scopeProductIds: input.scopeProductIds,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: input.status,
      createdAt: existing?.createdAt ?? nowIso(),
    };

    await saveCoupon(coupon);
    await recordAudit({
      actor,
      action: existing ? "coupon.update" : "coupon.create",
      entityType: "coupon",
      entityId: coupon.code,
      beforeSummary: existing ? `${existing.type} ${existing.value} · ${existing.status}` : null,
      afterSummary: `${coupon.type} ${coupon.value} · ${coupon.status}`,
    });

    revalidateMarketing();
    return ok({ id: coupon.id }, existing ? "Coupon updated" : "Coupon created");
  } catch (error) {
    return failure(error);
  }
}

export async function deleteCouponAction(id: string): Promise<ActionResult<undefined>> {
  try {
    const actor = await assertPermission("marketing.write");
    const coupon = (await listCoupons()).find((c) => c.id === id);
    if (!coupon) return fail("That coupon no longer exists.");
    if (coupon.usedCount > 0) {
      return fail(
        `This coupon has been used ${coupon.usedCount} times. Disable it instead so past orders keep their record.`,
      );
    }

    await deleteCoupon(id);
    await recordAudit({
      actor,
      action: "coupon.delete",
      entityType: "coupon",
      entityId: coupon.code,
      beforeSummary: coupon.status,
      afterSummary: "deleted",
    });

    revalidateMarketing();
    return ok(undefined, "Coupon deleted");
  } catch (error) {
    return failure(error);
  }
}

/* Offers -------------------------------------------------------------- */

export async function saveOfferAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await assertPermission("marketing.write");
    const parsed = offerSchema.safeParse(raw);
    if (!parsed.success) return fail("Some fields need attention.", fieldErrors(parsed.error));

    const input = parsed.data;
    const existing = input.id ? (await listOffers()).find((o) => o.id === input.id) : undefined;

    const offer: Offer = {
      id: existing?.id ?? newId("off"),
      name: input.name,
      discountType: input.discountType,
      value: input.value,
      productIds: input.productIds,
      categoryIds: input.categoryIds,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: input.status,
      createdAt: existing?.createdAt ?? nowIso(),
    };

    await saveOffer(offer);
    await recordAudit({
      actor,
      action: existing ? "offer.update" : "offer.create",
      entityType: "offer",
      entityId: offer.name,
      beforeSummary: existing ? `${existing.value} · ${existing.status}` : null,
      afterSummary: `${offer.value} · ${offer.status}`,
    });

    revalidateMarketing();
    return ok({ id: offer.id }, existing ? "Offer updated" : "Offer created");
  } catch (error) {
    return failure(error);
  }
}

export async function deleteOfferAction(id: string): Promise<ActionResult<undefined>> {
  try {
    const actor = await assertPermission("marketing.write");
    const offer = (await listOffers()).find((o) => o.id === id);
    if (!offer) return fail("That offer no longer exists.");

    await deleteOffer(id);
    await recordAudit({
      actor,
      action: "offer.delete",
      entityType: "offer",
      entityId: offer.name,
      beforeSummary: offer.status,
      afterSummary: "deleted",
    });

    revalidateMarketing();
    return ok(undefined, "Offer deleted");
  } catch (error) {
    return failure(error);
  }
}

/* Banners ------------------------------------------------------------- */

export async function saveBannerAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await assertPermission("marketing.write");
    const parsed = bannerSchema.safeParse(raw);
    if (!parsed.success) return fail("Some fields need attention.", fieldErrors(parsed.error));

    const input = parsed.data;
    const existing = input.id ? (await listBanners()).find((b) => b.id === input.id) : undefined;

    const banner: Banner = {
      id: existing?.id ?? newId("ban"),
      title: input.title,
      subtitle: input.subtitle,
      imageUrl: input.imageUrl,
      palette: existing?.palette ?? null,
      ctaLabel: input.ctaLabel,
      ctaLink: input.ctaLink,
      audience: input.audience,
      placement: input.placement,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      sortOrder: input.sortOrder,
      status: input.status,
      createdAt: existing?.createdAt ?? nowIso(),
    };

    await saveBanner(banner);
    await recordAudit({
      actor,
      action: existing ? "banner.update" : "banner.create",
      entityType: "banner",
      entityId: banner.title,
      beforeSummary: existing ? existing.status : null,
      afterSummary: banner.status,
    });

    revalidateMarketing();
    return ok({ id: banner.id }, existing ? "Banner updated" : "Banner created");
  } catch (error) {
    return failure(error);
  }
}

export async function deleteBannerAction(id: string): Promise<ActionResult<undefined>> {
  try {
    const actor = await assertPermission("marketing.write");
    const banner = (await listBanners()).find((b) => b.id === id);
    if (!banner) return fail("That banner no longer exists.");

    await deleteBanner(id);
    await recordAudit({
      actor,
      action: "banner.delete",
      entityType: "banner",
      entityId: banner.title,
      beforeSummary: banner.status,
      afterSummary: "deleted",
    });

    revalidateMarketing();
    return ok(undefined, "Banner deleted");
  } catch (error) {
    return failure(error);
  }
}

export async function reorderBannersAction(order: string[]): Promise<ActionResult<undefined>> {
  try {
    await assertPermission("marketing.write");
    if (order.length === 0) return fail("Nothing to reorder.");
    await reorderBanners(order);
    revalidateMarketing();
    return ok(undefined, "Order saved");
  } catch (error) {
    return failure(error);
  }
}

/* Societies (delivery areas) ------------------------------------------ */

export async function saveSocietyAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await assertPermission("settings.write");
    const parsed = societySchema.safeParse(raw);
    if (!parsed.success) return fail("Some fields need attention.", fieldErrors(parsed.error));

    const input = parsed.data;
    const all = await listSocieties();
    const existing = input.id ? all.find((s) => s.id === input.id) : undefined;

    if (all.some((s) => s.name.toLowerCase() === input.name.toLowerCase() && s.id !== existing?.id)) {
      return fail("That area already exists.", { name: "Name must be unique" });
    }

    const society: Society = {
      id: existing?.id ?? newId("soc"),
      name: input.name,
      city: input.city,
      deliveryFee: input.deliveryFee,
      freeDeliveryThreshold: input.freeDeliveryThreshold,
      estimatedMinutes: input.estimatedMinutes,
      active: input.active,
      sortOrder: input.sortOrder,
    };

    await saveSociety(society);
    await recordAudit({
      actor,
      action: existing ? "society.update" : "society.create",
      entityType: "society",
      entityId: society.name,
      beforeSummary: existing ? `fee ${existing.deliveryFee}` : null,
      afterSummary: `fee ${society.deliveryFee} · ${society.active ? "active" : "inactive"}`,
    });

    revalidatePath("/societies");
    revalidatePath("/orders");
    return ok({ id: society.id }, existing ? "Delivery area updated" : "Delivery area added");
  } catch (error) {
    return failure(error);
  }
}

export async function deleteSocietyAction(id: string): Promise<ActionResult<undefined>> {
  try {
    const actor = await assertPermission("settings.write");
    const society = (await listSocieties()).find((s) => s.id === id);
    if (!society) return fail("That delivery area no longer exists.");

    // Historical orders keep an area snapshot, but blocking here avoids
    // silently orphaning areas that are still in active use.
    const orders = await allOrders();
    const inUse = orders.filter(
      (o) =>
        o.address.society === society.name &&
        !["delivered", "cancelled", "refunded"].includes(o.status),
    ).length;
    if (inUse > 0) {
      return fail(
        `${inUse} open order${inUse === 1 ? " is" : "s are"} delivering to ${society.name}. Deactivate the area instead.`,
      );
    }

    await deleteSociety(id);
    await recordAudit({
      actor,
      action: "society.delete",
      entityType: "society",
      entityId: society.name,
      beforeSummary: `fee ${society.deliveryFee}`,
      afterSummary: "deleted",
    });

    revalidatePath("/societies");
    return ok(undefined, `${society.name} removed`);
  } catch (error) {
    return failure(error);
  }
}

/* Vendors -------------------------------------------------------------- */

export async function saveVendorAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await assertPermission("vendors.write");
    const parsed = vendorSchema.safeParse(raw);
    if (!parsed.success) return fail("Some fields need attention.", fieldErrors(parsed.error));

    const input = parsed.data;
    const existing = input.id ? (await listVendors()).find((v) => v.id === input.id) : undefined;

    const vendor: Vendor = {
      id: existing?.id ?? newId("ven"),
      name: input.name,
      status: input.status,
      contactName: input.contactName,
      phone: input.phone,
      email: input.email,
      serviceAreaSocietyIds: input.serviceAreaSocietyIds,
      openingHours: input.openingHours,
      logoUrl: input.logoUrl,
      createdAt: existing?.createdAt ?? nowIso(),
    };

    await saveVendor(vendor);
    await recordAudit({
      actor,
      action: existing ? "vendor.update" : "vendor.create",
      entityType: "vendor",
      entityId: vendor.name,
      beforeSummary: existing ? existing.status : null,
      afterSummary: vendor.status,
    });

    revalidatePath("/vendors");
    return ok({ id: vendor.id }, existing ? "Vendor updated" : "Vendor added");
  } catch (error) {
    return failure(error);
  }
}

export async function deleteVendorAction(id: string): Promise<ActionResult<undefined>> {
  try {
    const actor = await assertPermission("vendors.write");
    const vendor = (await listVendors()).find((v) => v.id === id);
    if (!vendor) return fail("That vendor no longer exists.");

    const { allProducts } = await import("@/server/repositories/products");
    const products = await allProducts();
    const assigned = products.filter((p) => p.availability.vendorIds.includes(id)).length;
    if (assigned > 0) {
      return fail(
        `${assigned} product${assigned === 1 ? " is" : "s are"} assigned to ${vendor.name}. Reassign them or disable the vendor instead.`,
      );
    }

    await deleteVendor(id);
    await recordAudit({
      actor,
      action: "vendor.delete",
      entityType: "vendor",
      entityId: vendor.name,
      beforeSummary: vendor.status,
      afterSummary: "deleted",
    });

    revalidatePath("/vendors");
    return ok(undefined, `${vendor.name} removed`);
  } catch (error) {
    return failure(error);
  }
}
