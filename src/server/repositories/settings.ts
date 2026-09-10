import "server-only";

import type { AppSettings } from "@/types";
import { COLLECTIONS, collection } from "./base";

const DEFAULTS: AppSettings = {
  store: {
    name: "HashmiMart",
    supportEmail: "support@hashmimart.example",
    supportPhone: "",
    city: "Lahore",
    currency: "PKR",
    timezone: "Asia/Karachi",
  },
  delivery: { defaultFee: 120, freeDeliveryThreshold: 2500, defaultEtaMinutes: 45, slots: [] },
  tax: { rate: 0, pricesIncludeTax: true },
  payments: { cashOnDelivery: true, jazzcash: false, card: false, bankTransfer: false },
  catalog: { lowStockThresholdDefault: 15, reserveStockOnConfirm: true },
  voice: { autoConfirmDisabled: true, lowConfidenceThreshold: 0.7, audioRetentionDays: 90 },
  featureFlags: {},
  analytics: { revenueCountsFrom: "accepted", sessionAnalyticsConfigured: false },
};

type SettingsDoc = AppSettings & { id: string };

export async function getSettings(): Promise<AppSettings> {
  const col = await collection<SettingsDoc>(COLLECTIONS.appConfig);
  const doc = await col.get("settings");
  if (!doc) return DEFAULTS;
  const { id: _id, ...settings } = doc;
  void _id;
  return { ...DEFAULTS, ...settings } as AppSettings;
}

export async function saveSettings(next: AppSettings): Promise<AppSettings> {
  const col = await collection<SettingsDoc>(COLLECTIONS.appConfig);
  await col.set({ ...next, id: "settings" });
  return next;
}
