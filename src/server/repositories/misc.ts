import "server-only";

import type {
  AdminUser,
  Banner,
  Coupon,
  Customer,
  InventoryMovement,
  NotificationRecord,
  Offer,
  Society,
  SupportConversation,
  Vendor,
  VoiceOrder,
} from "@/types";
import { COLLECTIONS, collection } from "./base";

type WithId<T> = T & { id: string };

/* Voice orders ------------------------------------------------------- */

export async function listVoiceOrders(): Promise<VoiceOrder[]> {
  const col = await collection<VoiceOrder>(COLLECTIONS.voiceOrders);
  const rows = await col.all();
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getVoiceOrder(id: string): Promise<VoiceOrder | null> {
  const col = await collection<VoiceOrder>(COLLECTIONS.voiceOrders);
  return col.get(id);
}

export async function updateVoiceOrder(id: string, patch: Partial<VoiceOrder>): Promise<VoiceOrder> {
  const col = await collection<VoiceOrder>(COLLECTIONS.voiceOrders);
  return col.update(id, patch);
}

/* Inventory movements ------------------------------------------------ */

export async function listMovements(productId?: string, limit = 200): Promise<InventoryMovement[]> {
  const col = await collection<InventoryMovement>(COLLECTIONS.inventoryMovements);
  const rows = await col.all();
  return rows
    .filter((m) => (productId ? m.productId === productId : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function appendMovement(movement: InventoryMovement): Promise<void> {
  const col = await collection<InventoryMovement>(COLLECTIONS.inventoryMovements);
  await col.set(movement);
}

/* Customers ---------------------------------------------------------- */

export async function listCustomers(): Promise<Customer[]> {
  const col = await collection<WithId<Customer>>(COLLECTIONS.customers);
  const rows = await col.all();
  return rows.sort((a, b) => (b.lastOrderAt ?? "").localeCompare(a.lastOrderAt ?? ""));
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const col = await collection<WithId<Customer>>(COLLECTIONS.customers);
  return col.get(id);
}

export async function updateCustomer(id: string, patch: Partial<Customer>): Promise<Customer> {
  const col = await collection<WithId<Customer>>(COLLECTIONS.customers);
  return col.update(id, patch as Partial<WithId<Customer>>);
}

/* Societies (delivery areas) ----------------------------------------- */

export async function listSocieties(): Promise<Society[]> {
  const col = await collection<Society>(COLLECTIONS.societies);
  const rows = await col.all();
  return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export async function saveSociety(society: Society): Promise<Society> {
  const col = await collection<Society>(COLLECTIONS.societies);
  await col.set(society);
  return society;
}

export async function deleteSociety(id: string): Promise<void> {
  const col = await collection<Society>(COLLECTIONS.societies);
  await col.remove(id);
}

/* Vendors ------------------------------------------------------------ */

export async function listVendors(): Promise<Vendor[]> {
  const col = await collection<Vendor>(COLLECTIONS.vendors);
  return (await col.all()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveVendor(vendor: Vendor): Promise<Vendor> {
  const col = await collection<Vendor>(COLLECTIONS.vendors);
  await col.set(vendor);
  return vendor;
}

export async function deleteVendor(id: string): Promise<void> {
  const col = await collection<Vendor>(COLLECTIONS.vendors);
  await col.remove(id);
}

/* Coupons and offers -------------------------------------------------- */

export async function listCoupons(): Promise<Coupon[]> {
  const col = await collection<Coupon>(COLLECTIONS.coupons);
  return (await col.all()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveCoupon(coupon: Coupon): Promise<Coupon> {
  const col = await collection<Coupon>(COLLECTIONS.coupons);
  await col.set(coupon);
  return coupon;
}

export async function deleteCoupon(id: string): Promise<void> {
  const col = await collection<Coupon>(COLLECTIONS.coupons);
  await col.remove(id);
}

export async function listOffers(): Promise<Offer[]> {
  const col = await collection<Offer>(COLLECTIONS.offers);
  return (await col.all()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveOffer(offer: Offer): Promise<Offer> {
  const col = await collection<Offer>(COLLECTIONS.offers);
  await col.set(offer);
  return offer;
}

export async function deleteOffer(id: string): Promise<void> {
  const col = await collection<Offer>(COLLECTIONS.offers);
  await col.remove(id);
}

/* Banners ------------------------------------------------------------- */

export async function listBanners(): Promise<Banner[]> {
  const col = await collection<Banner>(COLLECTIONS.banners);
  return (await col.all()).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function saveBanner(banner: Banner): Promise<Banner> {
  const col = await collection<Banner>(COLLECTIONS.banners);
  await col.set(banner);
  return banner;
}

export async function deleteBanner(id: string): Promise<void> {
  const col = await collection<Banner>(COLLECTIONS.banners);
  await col.remove(id);
}

export async function reorderBanners(order: string[]): Promise<void> {
  const col = await collection<Banner>(COLLECTIONS.banners);
  await Promise.all(order.map((id, index) => col.update(id, { sortOrder: index + 1 })));
}

/* Notifications ------------------------------------------------------- */

export async function listNotifications(): Promise<NotificationRecord[]> {
  const col = await collection<NotificationRecord>(COLLECTIONS.notifications);
  return (await col.all()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveNotification(record: NotificationRecord): Promise<NotificationRecord> {
  const col = await collection<NotificationRecord>(COLLECTIONS.notifications);
  await col.set(record);
  return record;
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  const col = await collection<NotificationRecord>(COLLECTIONS.notifications);
  await Promise.all(ids.map((id) => col.update(id, { isRead: true })));
}

/* Support ------------------------------------------------------------- */

export async function listSupportConversations(): Promise<SupportConversation[]> {
  const col = await collection<SupportConversation>(COLLECTIONS.supportConversations);
  return (await col.all()).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

export async function updateSupportConversation(
  id: string,
  patch: Partial<SupportConversation>,
): Promise<SupportConversation> {
  const col = await collection<SupportConversation>(COLLECTIONS.supportConversations);
  return col.update(id, patch);
}

/* Admin users --------------------------------------------------------- */

export async function listAdmins(): Promise<AdminUser[]> {
  const col = await collection<WithId<AdminUser>>(COLLECTIONS.admins);
  const rows = await col.all();
  return rows
    .map(({ id: _id, ...admin }) => {
      void _id;
      return admin as AdminUser;
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function saveAdmin(admin: AdminUser): Promise<AdminUser> {
  const col = await collection<WithId<AdminUser>>(COLLECTIONS.admins);
  await col.set({ ...admin, id: admin.uid });
  return admin;
}

export async function updateAdmin(uid: string, patch: Partial<AdminUser>): Promise<AdminUser> {
  const col = await collection<WithId<AdminUser>>(COLLECTIONS.admins);
  const { id: _id, ...updated } = await col.update(uid, patch as Partial<WithId<AdminUser>>);
  void _id;
  return updated as AdminUser;
}

export async function deleteAdmin(uid: string): Promise<void> {
  const col = await collection<WithId<AdminUser>>(COLLECTIONS.admins);
  await col.remove(uid);
}
