"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";
import { FALLBACK_PALETTE } from "@/lib/media/palette";
import { disposeRembg } from "@/lib/media/background-removal";
import type { MediaPalette, ProductMedia, ProviderImageResult } from "@/types";
import { AdjustStage } from "./adjust-stage";
import { CutoutStage, type CutoutOutcome } from "./cutout-stage";
import { PaletteStage } from "./palette-stage";
import { SourcePicker } from "./source-picker";
import { ProductCardPreview } from "@/components/products/product-card-preview";
import {
  DEFAULT_TRANSFORM,
  canvasToBlob,
  loadImage,
  renderTransformed,
  trimTransparent,
  type Transform,
} from "./image-utils";

type Stage = "source" | "adjust" | "cutout" | "palette" | "review";

const STAGES: { id: Stage; label: string }[] = [
  { id: "source", label: "Source" },
  { id: "adjust", label: "Adjust" },
  { id: "cutout", label: "Cutout" },
  { id: "palette", label: "Colour" },
  { id: "review", label: "Save" },
];

interface Selection {
  kind: "provider" | "upload";
  result?: ProviderImageResult;
  file?: File;
  /** URL usable for canvas work — object URL for uploads, remote for providers. */
  editableUrl: string;
  displayUrl: string;
}

async function uploadBlob(
  blob: Blob,
  kind: "original" | "cutout",
  width: number,
  height: number,
): Promise<{ url: string; storageId: string; mimeType: string; bytes: number }> {
  const form = new FormData();
  form.append("file", new File([blob], `${kind}.png`, { type: blob.type || "image/png" }));
  form.append("kind", kind);
  form.append("width", String(width));
  form.append("height", String(height));

  const response = await fetch("/api/media/upload", { method: "POST", body: form });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Upload failed.");
  }
  return response.json();
}

/**
 * Media studio (PRD §5, §24).
 *
 * Runs the full pipeline — search or upload, capture attribution, crop/rotate,
 * remove background in the browser, extract the palette, generate and choose a
 * card background, preview the mobile card, then upload and persist the media
 * metadata. Every stage is cancellable and non-destructive.
 */
export function MediaStudio({
  open,
  onClose,
  onSave,
  productName,
  unitLabel,
  price,
  compareAtPrice,
  emoji,
  existing,
  title = "Product media studio",
}: {
  open: boolean;
  onClose: () => void;
  onSave: (media: ProductMedia) => void;
  productName: string;
  unitLabel: string;
  price: number;
  compareAtPrice: number | null;
  emoji: string | null;
  existing?: ProductMedia | null;
  title?: string;
}) {
  const [stage, setStage] = useState<Stage>("source");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [transform, setTransform] = useState<Transform>(DEFAULT_TRANSFORM);
  const [adjusted, setAdjusted] = useState<HTMLCanvasElement | null>(null);
  const [cutout, setCutout] = useState<CutoutOutcome>({
    canvas: null,
    model: null,
    modelVersion: null,
    failureReason: null,
    skipped: false,
  });
  const [palette, setPalette] = useState<MediaPalette | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [loadingSource, setLoadingSource] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const objectUrls = useRef<string[]>([]);

  const reset = useCallback(() => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current = [];
    setStage("source");
    setSelection(null);
    setImage(null);
    setTransform(DEFAULT_TRANSFORM);
    setAdjusted(null);
    setCutout({ canvas: null, model: null, modelVersion: null, failureReason: null, skipped: false });
    setPalette(null);
    setPreviewUrl("");
    setSourceError(null);
  }, []);

  /**
   * Clearing state happens on close rather than in an effect, so no cascading
   * render is triggered. The delay lets the dialog finish its exit animation
   * before the content disappears.
   */
  const handleClose = useCallback(() => {
    onClose();
    void disposeRembg();
    window.setTimeout(reset, 260);
  }, [onClose, reset]);

  const openSource = useCallback(async (next: Selection) => {
    setLoadingSource(true);
    setSourceError(null);
    try {
      const loaded = await loadImage(next.editableUrl, next.kind === "provider");
      setSelection(next);
      setImage(loaded.element);
      setTransform(DEFAULT_TRANSFORM);
      setStage("adjust");
    } catch (error) {
      setSourceError(
        error instanceof Error
          ? error.message
          : "That image could not be opened for editing. Try uploading the file instead.",
      );
    } finally {
      setLoadingSource(false);
    }
  }, []);

  const selectProvider = useCallback(
    (result: ProviderImageResult) => {
      // Unsplash requires a download event on a download-like action (§15).
      if (result.provider === "unsplash" && result.downloadTrackingUrl) {
        void fetch("/api/media/provider-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "unsplash",
            event: "download",
            downloadLocation: result.downloadTrackingUrl,
          }),
        }).catch(() => {
          // Tracking must never block the workflow.
        });
      }
      void openSource({
        kind: "provider",
        result,
        editableUrl: result.fullUrl,
        displayUrl: result.fullUrl,
      });
    },
    [openSource],
  );

  const selectUpload = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      objectUrls.current.push(url);
      void openSource({ kind: "upload", file, editableUrl: url, displayUrl: url });
    },
    [openSource],
  );

  /* Freeze the adjusted square before moving into background removal. */
  const goToCutout = () => {
    if (!image) return;
    try {
      const canvas = renderTransformed(image, transform);
      setAdjusted(canvas);
      setStage("cutout");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare the image.");
    }
  };

  /* Decide which pixels feed the palette and the final card. */
  const goToPalette = () => {
    const working = cutout.canvas ? trimTransparent(cutout.canvas) : adjusted;
    if (!working) return;
    try {
      setPreviewUrl(working.toDataURL("image/png"));
      setStage("palette");
    } catch {
      // A tainted canvas can't be exported; fall back to the source URL.
      setPreviewUrl(selection?.displayUrl ?? "");
      setStage("palette");
    }
  };

  const save = async () => {
    if (!selection || !adjusted) return;
    setSaving(true);

    try {
      const result = selection.result;
      const hotlinkOnly = result?.hotlinkOnly ?? false;

      /* Original asset: hotlink-only providers are referenced, never re-hosted. */
      let original: ProductMedia["original"];
      if (hotlinkOnly && result) {
        original = {
          url: result.fullUrl,
          storageId: null,
          width: result.width,
          height: result.height,
          mimeType: null,
        };
      } else {
        const blob = await canvasToBlob(adjusted, "image/png");
        const stored = await uploadBlob(blob, "original", adjusted.width, adjusted.height);
        original = {
          url: stored.url,
          storageId: stored.storageId,
          width: adjusted.width,
          height: adjusted.height,
          mimeType: stored.mimeType,
          bytes: stored.bytes,
        };
      }

      /* Cutout, when one was produced. */
      let cutoutAsset: ProductMedia["cutout"] = null;
      if (cutout.canvas) {
        const trimmed = trimTransparent(cutout.canvas);
        const blob = await canvasToBlob(trimmed, "image/png");
        const stored = await uploadBlob(blob, "cutout", trimmed.width, trimmed.height);
        cutoutAsset = {
          url: stored.url,
          storageId: stored.storageId,
          width: trimmed.width,
          height: trimmed.height,
          mimeType: stored.mimeType,
          bytes: stored.bytes,
        };
      }

      const media: ProductMedia = {
        source: {
          provider: selection.kind === "upload" ? "upload" : (result?.provider ?? "library"),
          providerId: result?.id ?? null,
          sourcePageUrl: result?.sourcePageUrl ?? null,
          author: result?.author ?? null,
          authorUrl: result?.authorUrl ?? null,
          attributionText: result?.attributionText ?? "Uploaded by HashmiMart staff",
          hotlinkOnly,
          licenseNote: hotlinkOnly
            ? "Unsplash API terms require the hotlinked URL to be rendered rather than a re-hosted copy."
            : null,
        },
        original,
        cutout: cutoutAsset,
        palette: palette ?? FALLBACK_PALETTE,
        processing: {
          backgroundRemoved: Boolean(cutout.canvas),
          model: cutout.model,
          modelVersion: cutout.modelVersion,
          processedAt: cutout.canvas ? new Date().toISOString() : null,
          failureReason: cutout.failureReason,
        },
      };

      onSave(media);
      toast.success("Media attached to the product");
      handleClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the media.");
    } finally {
      setSaving(false);
    }
  };

  const stageIndex = STAGES.findIndex((s) => s.id === stage);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={title}
      description="Search or upload, prepare the cutout, pick the card colour, then save."
      size="xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-[11.5px] text-[var(--hm-ink-400)]">
            {selection?.result
              ? selection.result.attributionText
              : selection
                ? "Uploaded image — ownership is clear"
                : "No image selected yet"}
          </span>
          <div className="flex items-center gap-2">
            {stage !== "source" ? (
              <Button
                variant="outline"
                onClick={() => setStage(STAGES[Math.max(0, stageIndex - 1)].id)}
                disabled={saving}
              >
                <ArrowLeft className="size-4" />
                Back
              </Button>
            ) : null}
            {stage === "adjust" ? (
              <Button onClick={goToCutout}>
                Continue <ArrowRight className="size-4" />
              </Button>
            ) : null}
            {stage === "cutout" ? (
              <Button onClick={goToPalette}>
                Continue <ArrowRight className="size-4" />
              </Button>
            ) : null}
            {stage === "palette" ? (
              <Button onClick={() => setStage("review")}>
                Continue <ArrowRight className="size-4" />
              </Button>
            ) : null}
            {stage === "review" ? (
              <Button onClick={save} loading={saving}>
                {!saving && <Check className="size-4" />}
                Save media
              </Button>
            ) : null}
          </div>
        </div>
      }
    >
      {/* Stage rail — completed steps morph into a check (PRD §13.2) */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {STAGES.map((s, index) => {
          const done = index < stageIndex;
          const current = index === stageIndex;
          return (
            <div key={s.id} className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={index > stageIndex}
                onClick={() => setStage(s.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors",
                  current && "border-[var(--hm-cyan-400)] bg-[var(--hm-cyan-50)] text-[var(--hm-cyan-800)]",
                  done && "border-[var(--hm-success-100)] bg-[var(--hm-success-50)] text-[var(--hm-success-700)]",
                  !current && !done && "border-[var(--hm-border)] text-[var(--hm-ink-400)]",
                )}
              >
                {done ? (
                  <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }}>
                    <Check className="size-3" />
                  </motion.span>
                ) : (
                  <span className="tabular-nums">{index + 1}</span>
                )}
                {s.label}
              </button>
              {index < STAGES.length - 1 ? (
                <span aria-hidden className="h-px w-3 bg-[var(--hm-border-strong)]" />
              ) : null}
            </div>
          );
        })}
      </div>

      {loadingSource ? (
        <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-[var(--hm-ink-500)]">
          <Loader2 className="size-4 animate-spin" />
          Opening image…
        </div>
      ) : null}

      {sourceError ? (
        <p
          role="alert"
          className="mb-4 rounded-[var(--hm-radius-control)] border border-[var(--hm-danger-100)] bg-[var(--hm-danger-50)] px-3 py-2.5 text-[12.5px] text-[var(--hm-danger-700)]"
        >
          {sourceError}
        </p>
      ) : null}

      {stage === "source" && !loadingSource ? (
        <div className="min-h-[420px]">
          <SourcePicker
            productName={productName}
            onSelectProvider={selectProvider}
            onSelectUpload={selectUpload}
          />
        </div>
      ) : null}

      {stage === "adjust" && image ? (
        <AdjustStage image={image} transform={transform} onChange={setTransform} />
      ) : null}

      {stage === "cutout" && adjusted ? (
        <CutoutStage sourceCanvas={adjusted} outcome={cutout} onChange={setCutout} />
      ) : null}

      {stage === "palette" && previewUrl ? (
        <PaletteStage
          imageSource={previewUrl}
          productName={productName}
          unitLabel={unitLabel}
          price={price}
          compareAtPrice={compareAtPrice}
          emoji={emoji}
          palette={palette}
          onChange={setPalette}
        />
      ) : null}

      {stage === "review" ? (
        <ReviewStage
          previewUrl={previewUrl}
          palette={palette}
          selection={selection}
          cutout={cutout}
          productName={productName}
          unitLabel={unitLabel}
          price={price}
          compareAtPrice={compareAtPrice}
          emoji={emoji}
          existing={existing}
        />
      ) : null}
    </Dialog>
  );
}

function ReviewStage({
  previewUrl,
  palette,
  selection,
  cutout,
  productName,
  unitLabel,
  price,
  compareAtPrice,
  emoji,
  existing,
}: {
  previewUrl: string;
  palette: MediaPalette | null;
  selection: Selection | null;
  cutout: CutoutOutcome;
  productName: string;
  unitLabel: string;
  price: number;
  compareAtPrice: number | null;
  emoji: string | null;
  existing?: ProductMedia | null;
}) {
  const result = selection?.result;

  const rows: [string, string][] = [
    ["Provider", selection?.kind === "upload" ? "Admin upload" : (result?.provider ?? "—")],
    ["Author", result?.author ?? "HashmiMart staff"],
    ["Source page", result?.sourcePageUrl ?? "—"],
    [
      "Storage",
      result?.hotlinkOnly
        ? "Hotlinked (Unsplash terms)"
        : "Copied into HashmiMart media storage",
    ],
    [
      "Background removed",
      cutout.canvas ? `Yes — ${cutout.model} (${cutout.modelVersion})` : cutout.skipped ? "Skipped" : "No",
    ],
    ["Card background", palette?.cardBg ?? "—"],
    ["Text colour", palette?.textColor ?? "—"],
  ];

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <div className="lg:w-[240px]">
        <p className="mb-2 text-[12.5px] font-semibold text-[var(--hm-ink-700)]">Final card</p>
        <div className="flex justify-center rounded-[var(--hm-radius-card)] border border-[var(--hm-border)] bg-[var(--hm-ink-50)] p-5">
          <ProductCardPreview
            name={productName || "Product name"}
            unitLabel={unitLabel}
            price={price}
            compareAtPrice={compareAtPrice}
            imageUrl={previewUrl}
            emoji={emoji}
            palette={palette}
          />
        </div>
      </div>

      <div className="flex-1">
        <p className="mb-2 text-[12.5px] font-semibold text-[var(--hm-ink-700)]">
          What gets written to Firestore
        </p>
        <dl className="divide-y divide-[var(--hm-border)] rounded-[var(--hm-radius-card)] border border-[var(--hm-border)]">
          {rows.map(([label, value]) => (
            <div key={label} className="flex gap-3 px-3.5 py-2.5 text-[12.5px]">
              <dt className="w-[140px] shrink-0 text-[var(--hm-ink-500)]">{label}</dt>
              <dd className="min-w-0 flex-1 break-words text-[var(--hm-ink-800)]">{value}</dd>
            </div>
          ))}
        </dl>
        {existing ? (
          <p className="mt-3 text-[11.5px] text-[var(--hm-warning-700)]">
            Saving replaces the media currently on this product.
          </p>
        ) : null}
      </div>
    </div>
  );
}
