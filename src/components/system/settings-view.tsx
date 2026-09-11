"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MediaCheck } from "./media-check";
import { Chip } from "@/components/ui/chip";
import { Field, Input, Select, Switch } from "@/components/ui/field";
import { UnsavedGuard } from "@/components/admin-shell/unsaved-guard";
import { saveSettingsAction } from "@/server/actions/settings";
import type { AppSettings } from "@/types";

const TIMEZONES = ["Asia/Karachi", "Asia/Dubai", "UTC", "Europe/London"];

const FLAG_LABELS: Record<string, string> = {
  wholesaleMode: "Wholesale storefront",
  voiceOrders: "Voice ordering",
  supportChat: "In-app support chat",
  banners: "Home banners",
};

export function SettingsView({
  settings: initial,
  backend,
  canWrite,
}: {
  settings: AppSettings;
  backend: "firestore" | "local";
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [settings, setSettings] = useState<AppSettings>(initial);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const patch = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const save = () => {
    setErrors({});
    startTransition(async () => {
      const result = await saveSettingsAction(settings);
      if (result.ok) {
        toast.success(result.message ?? "Saved");
        setDirty(false);
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  };

  const reset = () => {
    setSettings(initial);
    setErrors({});
    setDirty(false);
  };

  return (
    <>
      <UnsavedGuard when={dirty} />

      <div className="flex flex-col gap-4">
        {/* Store */}
        <Card>
          <CardHeader title="Store" subtitle="Identity and contact details shown to customers" />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Store name" htmlFor="s-name" required error={errors["store.name"]}>
              <Input
                id="s-name"
                value={settings.store.name}
                disabled={!canWrite}
                invalid={Boolean(errors["store.name"])}
                onChange={(e) => patch("store", { ...settings.store, name: e.target.value })}
              />
            </Field>
            <Field label="City" htmlFor="s-city" required error={errors["store.city"]}>
              <Input
                id="s-city"
                value={settings.store.city}
                disabled={!canWrite}
                onChange={(e) => patch("store", { ...settings.store, city: e.target.value })}
              />
            </Field>
            <Field label="Support email" htmlFor="s-email" required error={errors["store.supportEmail"]}>
              <Input
                id="s-email"
                type="email"
                value={settings.store.supportEmail}
                disabled={!canWrite}
                invalid={Boolean(errors["store.supportEmail"])}
                onChange={(e) => patch("store", { ...settings.store, supportEmail: e.target.value })}
              />
            </Field>
            <Field label="Support phone" htmlFor="s-phone">
              <Input
                id="s-phone"
                value={settings.store.supportPhone}
                disabled={!canWrite}
                onChange={(e) => patch("store", { ...settings.store, supportPhone: e.target.value })}
                placeholder="+92 42 3577 1122"
              />
            </Field>
            <Field label="Currency" htmlFor="s-currency" hint="PKR throughout the app">
              <Input id="s-currency" value="PKR" disabled />
            </Field>
            <Field label="Timezone" htmlFor="s-tz">
              <Select
                id="s-tz"
                value={settings.store.timezone}
                disabled={!canWrite}
                onChange={(e) => patch("store", { ...settings.store, timezone: e.target.value })}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </Select>
            </Field>
          </CardBody>
        </Card>

        {/* Delivery */}
        <Card>
          <CardHeader
            title="Delivery"
            subtitle="Defaults used when a delivery area does not set its own"
          />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Default fee (PKR)" htmlFor="d-fee" error={errors["delivery.defaultFee"]}>
              <Input
                id="d-fee"
                type="number"
                min={0}
                value={settings.delivery.defaultFee}
                disabled={!canWrite}
                onChange={(e) =>
                  patch("delivery", { ...settings.delivery, defaultFee: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Free delivery over (PKR)" htmlFor="d-free" hint="Blank disables it">
              <Input
                id="d-free"
                type="number"
                min={0}
                value={settings.delivery.freeDeliveryThreshold ?? ""}
                disabled={!canWrite}
                onChange={(e) =>
                  patch("delivery", {
                    ...settings.delivery,
                    freeDeliveryThreshold: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Default ETA (minutes)" htmlFor="d-eta">
              <Input
                id="d-eta"
                type="number"
                min={1}
                value={settings.delivery.defaultEtaMinutes}
                disabled={!canWrite}
                onChange={(e) =>
                  patch("delivery", {
                    ...settings.delivery,
                    defaultEtaMinutes: Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field
              label="Delivery slots"
              htmlFor="d-slots"
              hint="Comma separated, offered at checkout"
              className="sm:col-span-3"
            >
              <Input
                id="d-slots"
                value={settings.delivery.slots.join(", ")}
                disabled={!canWrite}
                onChange={(e) =>
                  patch("delivery", {
                    ...settings.delivery,
                    slots: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })
                }
                placeholder="09:00–12:00, 12:00–15:00"
              />
            </Field>
          </CardBody>
        </Card>

        {/* Tax and payments */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Tax" />
            <CardBody className="flex flex-col gap-4">
              <Field label="Tax rate (%)" htmlFor="t-rate" error={errors["tax.rate"]}>
                <Input
                  id="t-rate"
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={settings.tax.rate}
                  disabled={!canWrite}
                  invalid={Boolean(errors["tax.rate"])}
                  onChange={(e) => patch("tax", { ...settings.tax, rate: Number(e.target.value) })}
                />
              </Field>
              <Switch
                checked={settings.tax.pricesIncludeTax}
                disabled={!canWrite}
                onChange={(pricesIncludeTax) => patch("tax", { ...settings.tax, pricesIncludeTax })}
                label="Product prices already include tax"
                description="When off, tax is added at checkout instead."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Payments"
              subtitle="At least one method must stay enabled"
              action={errors.payments ? <Chip tone="danger">Fix required</Chip> : null}
            />
            <CardBody className="flex flex-col gap-3">
              <Switch
                checked={settings.payments.cashOnDelivery}
                disabled={!canWrite}
                onChange={(cashOnDelivery) => patch("payments", { ...settings.payments, cashOnDelivery })}
                label="Cash on delivery"
              />
              <Switch
                checked={settings.payments.jazzcash}
                disabled={!canWrite}
                onChange={(jazzcash) => patch("payments", { ...settings.payments, jazzcash })}
                label="JazzCash"
              />
              <Switch
                checked={settings.payments.card}
                disabled={!canWrite}
                onChange={(card) => patch("payments", { ...settings.payments, card })}
                label="Card"
              />
              <Switch
                checked={settings.payments.bankTransfer}
                disabled={!canWrite}
                onChange={(bankTransfer) => patch("payments", { ...settings.payments, bankTransfer })}
                label="Bank transfer"
              />
              {errors.payments ? (
                <p role="alert" className="text-[12px] font-medium text-[var(--hm-danger-700)]">
                  {errors.payments}
                </p>
              ) : null}
            </CardBody>
          </Card>
        </div>

        {/* Catalog and voice */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Catalog & stock" />
            <CardBody className="flex flex-col gap-4">
              <Field
                label="Default low-stock threshold"
                htmlFor="c-threshold"
                hint="Applied to new products"
              >
                <Input
                  id="c-threshold"
                  type="number"
                  min={0}
                  value={settings.catalog.lowStockThresholdDefault}
                  disabled={!canWrite}
                  onChange={(e) =>
                    patch("catalog", {
                      ...settings.catalog,
                      lowStockThresholdDefault: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Switch
                checked={settings.catalog.reserveStockOnConfirm}
                disabled={!canWrite}
                onChange={(reserveStockOnConfirm) =>
                  patch("catalog", { ...settings.catalog, reserveStockOnConfirm })
                }
                label="Reserve stock when an order is confirmed"
                description="Released automatically if the order is cancelled."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Voice orders" />
            <CardBody className="flex flex-col gap-4">
              <Field
                label="Low-confidence threshold"
                htmlFor="v-threshold"
                hint="Detections below this are flagged for manual review (0–1)"
              >
                <Input
                  id="v-threshold"
                  type="number"
                  min={0}
                  max={1}
                  step="0.05"
                  value={settings.voice.lowConfidenceThreshold}
                  disabled={!canWrite}
                  onChange={(e) =>
                    patch("voice", {
                      ...settings.voice,
                      lowConfidenceThreshold: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field
                label="Audio retention (days)"
                htmlFor="v-retention"
                hint="Recordings are purged after this period"
              >
                <Input
                  id="v-retention"
                  type="number"
                  min={1}
                  value={settings.voice.audioRetentionDays}
                  disabled={!canWrite}
                  onChange={(e) =>
                    patch("voice", { ...settings.voice, audioRetentionDays: Number(e.target.value) })
                  }
                />
              </Field>
              <p className="rounded-[var(--hm-radius-control)] bg-[var(--hm-cyan-50)] px-3 py-2 text-[12px] text-[var(--hm-cyan-800)]">
                Voice orders are never auto-confirmed. A person always reviews and converts them —
                this is not configurable.
              </p>
            </CardBody>
          </Card>
        </div>

        {/* Analytics and flags */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Analytics" />
            <CardBody className="flex flex-col gap-4">
              <Field
                label="Count revenue from"
                htmlFor="an-rule"
                hint="Drives every revenue figure on the dashboard and analytics pages"
              >
                <Select
                  id="an-rule"
                  value={settings.analytics.revenueCountsFrom}
                  disabled={!canWrite}
                  onChange={(e) =>
                    patch("analytics", {
                      ...settings.analytics,
                      revenueCountsFrom: e.target.value as AppSettings["analytics"]["revenueCountsFrom"],
                    })
                  }
                >
                  <option value="accepted">Accepted orders (not cancelled or refunded)</option>
                  <option value="paid">Paid orders only</option>
                  <option value="delivered">Delivered orders only</option>
                </Select>
              </Field>
              <Switch
                checked={settings.analytics.sessionAnalyticsConfigured}
                disabled={!canWrite}
                onChange={(sessionAnalyticsConfigured) =>
                  patch("analytics", { ...settings.analytics, sessionAnalyticsConfigured })
                }
                label="Session analytics is collected"
                description="Leave off until session and conversion events actually flow in — the dashboard shows “Not configured” rather than estimating."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Feature flags"
              subtitle="Roll new app features out gradually"
            />
            <CardBody className="flex flex-col gap-3">
              {Object.entries(settings.featureFlags).map(([flag, enabled]) => (
                <Switch
                  key={flag}
                  checked={enabled}
                  disabled={!canWrite}
                  onChange={(next) =>
                    patch("featureFlags", { ...settings.featureFlags, [flag]: next })
                  }
                  label={FLAG_LABELS[flag] ?? flag}
                />
              ))}
              {Object.keys(settings.featureFlags).length === 0 ? (
                <p className="text-[13px] text-[var(--hm-ink-500)]">No feature flags configured.</p>
              ) : null}
            </CardBody>
          </Card>
        </div>

        {/* Integrations */}
        <Card>
          <CardHeader
            title="Integrations"
            subtitle="Configured through server-only environment variables, never edited here"
          />
          <CardBody className="flex flex-col gap-3 text-[13px]">
            <IntegrationRow
              label="Firestore"
              value={
                backend === "firestore"
                  ? "Connected via the Firebase Admin SDK"
                  : "Not configured — running on the local development datastore"
              }
              tone={backend === "firestore" ? "success" : "warning"}
            />
            <IntegrationRow
              label="Image providers"
              value="Pixabay, Pexels and Unsplash keys are read server-side only"
              tone="cyan"
            />
            <IntegrationRow
              label="Background removal"
              value="Runs in the admin browser over ONNX Runtime Web — no per-image cost"
              tone="cyan"
            />
            <p className="mt-1 text-[12px] text-[var(--hm-ink-400)]">
              No credential is ever stored in Firestore, in browser storage, or in a NEXT_PUBLIC_*
              variable. Rotate keys in your deployment provider&apos;s encrypted environment settings.
            </p>
          </CardBody>
        </Card>

        <MediaCheck />

        {canWrite ? (
          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-2 rounded-[var(--hm-radius-card)] border border-[var(--hm-border)] bg-white/90 px-4 py-3 shadow-[var(--hm-shadow-md)] backdrop-blur">
            {dirty ? (
              <span className="mr-auto text-[12.5px] font-medium text-[var(--hm-warning-700)]">
                You have unsaved changes
              </span>
            ) : null}
            <Button variant="outline" onClick={reset} disabled={!dirty || pending}>
              <RotateCcw className="size-4" />
              Reset
            </Button>
            <Button onClick={save} loading={pending} disabled={!dirty}>
              <Save className="size-4" />
              Save settings
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}

function IntegrationRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "cyan";
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hm-border)] pb-2.5 last:border-0 last:pb-0">
      <span className="font-semibold text-[var(--hm-ink-800)]">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-[12.5px] text-[var(--hm-ink-500)]">{value}</span>
        <Chip tone={tone}>{tone === "warning" ? "Local" : "OK"}</Chip>
      </span>
    </div>
  );
}
