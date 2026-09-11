"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Loader2,
  RotateCcw,
  RotateCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";
import { FALLBACK_PALETTE } from "@/lib/media/palette";
import { DEFAULT_REMBG_MODEL, MODEL_LIST, disposeRembg } from "@/lib/media/background-removal";
import { loadForEditing, runPipeline, autoPalette, type PipelineProgress } from "@/lib/media/pipeline";
import { composeCollage, type CategoryArtSource } from "@/lib/media/collage";
import { removeBackground } from "@/lib/media/background-removal";
import { extractSwatchesFromCanvas } from "@/lib/media/extract-palette";
import type { ExtractedSwatches } from "@/lib/media/quantize";
import type { MediaPalette, ProductMedia, ProviderImageResult } from "@/types";
import type { RembgModel } from "@/lib/media/model-catalog";
import { AdjustStage } from "./adjust-stage";
import { ColourPanel } from "./colour-panel";
import { CutoutStage, type CutoutOutcome } from "./cutout-stage";
import { SourcePicker } from "./source-picker";
import { ProductCardPreview } from "@/components/products/product-card-preview";
import {
  DEFAULT_TRANSFORM,
  canvasToBlob,
  previewDataUrl,
  renderTransformed,
  trimTransparent,
  type Transform,
} from "./image-utils";

/**
 * Media studio (PRD §5, §24).
 *
 * The admin searches, picks one picture, and that is the whole job. Squaring,
 * background removal, trimming, colour extraction and the card background all
 * run on their own and land on a finished card.
 *
 * The manual stages are still here, folded away behind "Fine-tune", because
 * occasionally a cutout clips a handle or a colour is not the one you wanted.
 * They are an escape hatch, not the route through.
 */

type Stage = "pick" | "working" | "ready";

interface Selection {
  kind: "provider" | "upload" | "collage";
  result?: ProviderImageResult;
  /** What the canvas loads: an object URL, or the same-origin proxy. */
  editableUrl: string;
  /** How many products went into a composed tile. */
  composedFrom?: number;
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
  title = "Product image",
  mode = "product",
  artSources = [],
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
  /** Category art is searched and composed differently from a product packshot. */
  mode?: "product" | "category";
  /** This category's products, for building the tile out of their cutouts. */
  artSources?: CategoryArtSource[];
}) {
  const [stage, setStage] = useState<Stage>("pick");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [transform, setTransform] = useState<Transform>(DEFAULT_TRANSFORM);
  const [model, setModel] = useState<RembgModel>(DEFAULT_REMBG_MODEL);

  const [squared, setSquared] = useState<HTMLCanvasElement | null>(null);
  const [cutout, setCutout] = useState<CutoutOutcome>({
    canvas: null,
    model: null,
    modelVersion: null,
    failureReason: null,
    skipped: false,
  });
  const [swatches, setSwatches] = useState<ExtractedSwatches | null>(null);
  const [palette, setPalette] = useState<MediaPalette | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [timings, setTimings] = useState<{ total: number; cutout: number } | null>(null);

  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fineTune, setFineTune] = useState(false);

  const objectUrls = useRef<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current = [];
    setStage("pick");
    setSelection(null);
    setImage(null);
    setTransform(DEFAULT_TRANSFORM);
    setModel(DEFAULT_REMBG_MODEL);
    setSquared(null);
    setCutout({ canvas: null, model: null, modelVersion: null, failureReason: null, skipped: false });
    setSwatches(null);
    setPalette(null);
    setPreviewUrl("");
    setTimings(null);
    setProgress(null);
    setError(null);
    setFineTune(false);
  }, []);

  const handleClose = useCallback(() => {
    abortRef.current?.abort();
    onClose();
    void disposeRembg();
    // Clearing after the exit animation keeps the dialog from emptying on screen.
    window.setTimeout(reset, 260);
  }, [onClose, reset]);

  useEffect(() => () => abortRef.current?.abort(), []);

  /** Turns a finished canvas into what the preview and the card show. */
  const adoptResult = useCallback(
    (next: HTMLCanvasElement, nextPalette: MediaPalette, nextSwatches: ExtractedSwatches | null) => {
      setSwatches(nextSwatches);
      setPalette(nextPalette);
      try {
        setPreviewUrl(previewDataUrl(next));
      } catch {
        // Only possible with a tainted canvas, which the proxy prevents.
        setPreviewUrl("");
      }
    },
    [],
  );

  /** The whole automatic run. Called on selection and on every re-run. */
  const process = useCallback(
    async (source: HTMLImageElement, nextTransform: Transform, nextModel: RembgModel) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStage("working");
      setError(null);
      setProgress({ step: "loading", progress: 0, message: "Starting…" });

      try {
        const result = await runPipeline(source, {
          model: nextModel,
          transform: nextTransform,
          signal: controller.signal,
          onProgress: setProgress,
        });

        setSquared(result.squared);
        setCutout({
          canvas: result.cutout,
          model: result.model,
          modelVersion: result.modelVersion,
          failureReason: result.cutoutFailure,
          skipped: false,
        });
        adoptResult(result.display, result.palette, extractSwatchesFromCanvas(result.display));
        setTimings({ total: result.timings.total, cutout: result.timings.cutout });
        setStage("ready");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "That image could not be prepared.");
        setStage("pick");
      } finally {
        setProgress(null);
      }
    },
    [adoptResult],
  );

  const begin = useCallback(
    async (next: Selection) => {
      setSelection(next);
      setStage("working");
      setError(null);
      setProgress({ step: "loading", progress: 0, message: "Opening the picture…" });
      try {
        const loaded = await loadForEditing(next.editableUrl);
        setImage(loaded);
        setTransform(DEFAULT_TRANSFORM);
        await process(loaded, DEFAULT_TRANSFORM, model);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "That image could not be opened. Try another one, or upload your own.",
        );
        setStage("pick");
        setProgress(null);
      }
    },
    [model, process],
  );

  const selectProvider = useCallback(
    (result: ProviderImageResult) => {
      // Unsplash requires a download event on a download-like action (PRD §15).
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
      void begin({
        kind: "provider",
        result,
        editableUrl: result.fullUrl,
      });
    },
    [begin],
  );

  const selectUpload = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      objectUrls.current.push(url);
      void begin({ kind: "upload", editableUrl: url });
    },
    [begin],
  );

  /**
   * Builds the category tile out of the category's own products.
   *
   * This path skips the usual pipeline: the pieces are already cut out by the
   * time they are arranged, so running removal over the finished arrangement
   * would only chew at its edges. Everything after that — trimming, reading the
   * colours, choosing the card background — is the same as any other picture.
   */
  const buildCollage = useCallback(
    async (chosen: CategoryArtSource[]) => {
      if (chosen.length === 0) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setSelection({ kind: "collage", editableUrl: "", composedFrom: chosen.length });
      setImage(null);
      setStage("working");
      setError(null);

      const total = chosen.length;
      const started = performance.now();
      try {
        const pieces: HTMLImageElement[] = [];

        for (const [index, source] of chosen.entries()) {
          const step = Math.round((index / total) * 88);
          setProgress({
            step: "loading",
            progress: step,
            message: `Preparing ${source.name} (${index + 1} of ${total})…`,
          });

          const loaded = await loadForEditing(source.imageUrl);
          if (controller.signal.aborted) return;

          if (source.hasCutout) {
            pieces.push(loaded);
            continue;
          }

          // No cutout stored: remove the background now, so a product that was
          // never processed does not drop a white box into the arrangement.
          const square = renderTransformed(loaded, DEFAULT_TRANSFORM);
          const result = await removeBackground(await canvasToBlob(square, "image/png"), {
            signal: controller.signal,
            onProgress: (info) =>
              setProgress({
                step: "cutout",
                progress: step + Math.round((info.progress / 100) * (88 / total)),
                message: `Removing the background from ${source.name}…`,
              }),
          });
          const cut = await loadForEditing(result.objectUrl);
          URL.revokeObjectURL(result.objectUrl);
          if (controller.signal.aborted) return;
          pieces.push(cut);
        }

        setProgress({ step: "trimming", progress: 92, message: "Arranging them…" });
        const composed = composeCollage(pieces);
        const display = trimTransparent(composed);

        setProgress({ step: "palette", progress: 96, message: "Reading the colours…" });
        setSquared(composed);
        setCutout({
          canvas: composed,
          model: null,
          modelVersion: null,
          failureReason: null,
          skipped: false,
        });
        adoptResult(display, autoPalette(display), extractSwatchesFromCanvas(display));
        setTimings({ total: Math.round(performance.now() - started), cutout: 0 });
        setStage("ready");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Those products could not be arranged into a picture.",
        );
        setStage("pick");
      } finally {
        setProgress(null);
      }
    },
    [adoptResult],
  );

  /* --- Fine-tune: recompute from a hand-edited cutout ------------------ */

  const applyCutout = useCallback(
    (next: CutoutOutcome) => {
      setCutout(next);
      const base = next.canvas ? trimTransparent(next.canvas) : squared;
      if (!base) return;
      adoptResult(base, autoPalette(base), extractSwatchesFromCanvas(base));
    },
    [squared, adoptResult],
  );

  const rerun = useCallback(
    (nextTransform: Transform, nextModel: RembgModel) => {
      if (!image) return;
      setTransform(nextTransform);
      setModel(nextModel);
      void process(image, nextTransform, nextModel);
    },
    [image, process],
  );

  const rotate = (delta: number) =>
    rerun({ ...transform, rotation: (((transform.rotation + delta) % 360) + 360) % 360 }, model);

  /* --- Save ------------------------------------------------------------ */

  const save = async () => {
    if (!selection || !squared) return;
    setSaving(true);

    try {
      const result = selection.result;
      const hotlinkOnly = result?.hotlinkOnly ?? false;

      /* Hotlink-only providers are referenced, never re-hosted. */
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
        const blob = await canvasToBlob(squared, "image/png");
        const stored = await uploadBlob(blob, "original", squared.width, squared.height);
        original = {
          url: stored.url,
          storageId: stored.storageId,
          width: squared.width,
          height: squared.height,
          mimeType: stored.mimeType,
          bytes: stored.bytes,
        };
      }

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
          // A composed tile comes from the shop's own catalogue, not a provider.
          provider:
            selection.kind === "collage"
              ? "library"
              : selection.kind === "upload"
                ? "upload"
                : (result?.provider ?? "library"),
          providerId: result?.id ?? null,
          sourcePageUrl: result?.sourcePageUrl ?? null,
          author: result?.author ?? null,
          authorUrl: result?.authorUrl ?? null,
          attributionText:
            result?.attributionText ??
            (selection.kind === "collage"
              ? `Arranged from ${selection.composedFrom} HashmiMart product images`
              : "Uploaded by HashmiMart staff"),
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
      toast.success("Image added to the product");
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the image.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={title}
      description="Pick a picture. The background, the colours and the card are done for you."
      size="xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-[11.5px] text-[var(--hm-ink-400)]">
            {selection?.result
              ? selection.result.attributionText
              : selection?.kind === "collage"
                ? `Built from ${selection.composedFrom} of this category's own products`
                : selection
                  ? "Uploaded image — ownership is clear"
                  : "No image chosen yet"}
          </span>
          <div className="flex items-center gap-2">
            {stage === "ready" ? (
              <>
                <Button variant="outline" onClick={reset} disabled={saving}>
                  <ArrowLeft className="size-4" />
                  Choose another
                </Button>
                <Button onClick={save} loading={saving}>
                  {!saving && <Check className="size-4" />}
                  Save image
                </Button>
              </>
            ) : null}
            {stage === "working" ? (
              <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      }
    >
      {error ? (
        <p
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-[var(--hm-radius-control)] border border-[var(--hm-danger-100)] bg-[var(--hm-danger-50)] px-3 py-2.5 text-[12.5px] text-[var(--hm-danger-700)]"
        >
          <AlertTriangle className="mt-px size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {stage === "pick" ? (
        <div className="min-h-[420px]">
          <SourcePicker
            productName={productName}
            mode={mode}
            artSources={artSources}
            onSelectProvider={selectProvider}
            onSelectUpload={selectUpload}
            onSelectCollage={mode === "category" ? (chosen) => void buildCollage(chosen) : undefined}
          />
        </div>
      ) : null}

      {stage === "working" ? <WorkingPanel progress={progress} /> : null}

      {stage === "ready" ? (
        <div className="flex flex-col gap-5">
          <ResultPanel
            previewUrl={previewUrl}
            palette={palette}
            productName={productName}
            unitLabel={unitLabel}
            price={price}
            compareAtPrice={compareAtPrice}
            emoji={emoji}
            cutout={cutout}
            timings={timings}
            composedFrom={selection?.kind === "collage" ? selection.composedFrom : undefined}
            existing={existing}
          />

          <div>
            <button
              type="button"
              onClick={() => setFineTune((on) => !on)}
              aria-expanded={fineTune}
              className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--hm-cyan-700)] hover:text-[var(--hm-cyan-800)]"
            >
              <ChevronDown
                className={cn("size-4 transition-transform", fineTune && "rotate-180")}
              />
              {fineTune ? "Hide fine-tuning" : "Fine-tune (only if you need to)"}
            </button>

            <AnimatePresence initial={false}>
              {fineTune ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 flex flex-col gap-5 rounded-[var(--hm-radius-card)] border border-[var(--hm-border)] bg-[var(--hm-ink-50)] p-4">
                    <section>
                      <h3 className="mb-2 text-[12.5px] font-semibold text-[var(--hm-ink-700)]">
                        Rotate and crop
                      </h3>
                      <div className="mb-3 flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => rotate(-90)}>
                          <RotateCcw className="size-3.5" />
                          Left
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => rotate(90)}>
                          <RotateCw className="size-3.5" />
                          Right
                        </Button>
                        <span className="text-[11.5px] text-[var(--hm-ink-500)]">
                          Rotating re-runs the whole thing.
                        </span>
                      </div>
                      {image ? (
                        <>
                          <AdjustStage image={image} transform={transform} onChange={setTransform} />
                          <Button
                            variant="secondary"
                            size="sm"
                            className="mt-3"
                            onClick={() => rerun(transform, model)}
                          >
                            <Sparkles className="size-3.5" />
                            Apply crop and re-run
                          </Button>
                        </>
                      ) : null}
                    </section>

                    {squared ? (
                      <section className="border-t border-[var(--hm-border)] pt-4">
                        <h3 className="mb-2 text-[12.5px] font-semibold text-[var(--hm-ink-700)]">
                          Cutout
                        </h3>
                        <CutoutStage
                          sourceCanvas={squared}
                          outcome={cutout}
                          onChange={applyCutout}
                        />
                      </section>
                    ) : null}

                    <section className="border-t border-[var(--hm-border)] pt-4">
                      <h3 className="mb-2 text-[12.5px] font-semibold text-[var(--hm-ink-700)]">
                        Card colour
                      </h3>
                      <ColourPanel
                        swatches={swatches}
                        productName={productName}
                        palette={palette}
                        onChange={setPalette}
                      />
                    </section>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

/** One honest progress bar, driven by the pipeline rather than a timer. */
function WorkingPanel({ progress }: { progress: PipelineProgress | null }) {
  const percent = progress?.progress ?? 0;
  const steps = [
    { id: "squaring", label: "Fitting the card" },
    { id: "cutout", label: "Removing the background" },
    { id: "palette", label: "Reading the colours" },
  ] as const;
  const currentIndex = steps.findIndex((s) => s.id === progress?.step);

  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center gap-5 py-10">
      <div className="relative flex size-16 items-center justify-center">
        <motion.span
          className="absolute inset-0 rounded-full border-2 border-[var(--hm-cyan-100)] border-t-[var(--hm-cyan-500)]"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
        />
        <Sparkles className="size-6 text-[var(--hm-cyan-600)]" />
      </div>

      <div className="w-full max-w-sm text-center">
        <p className="text-[14px] font-semibold text-[var(--hm-ink-900)]">
          {progress?.message ?? "Working…"}
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--hm-ink-100)]">
          <motion.div
            className="h-full rounded-full bg-[var(--hm-cyan-500)]"
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <p className="mt-2 text-[11.5px] text-[var(--hm-ink-400)] tabular-nums">{percent}%</p>
      </div>

      <ol className="flex flex-col gap-1.5">
        {steps.map((step, index) => {
          const done = currentIndex > index || progress?.step === "done";
          const active = currentIndex === index;
          return (
            <li
              key={step.id}
              className={cn(
                "flex items-center gap-2 text-[12.5px]",
                done
                  ? "text-[var(--hm-success-700)]"
                  : active
                    ? "font-semibold text-[var(--hm-ink-900)]"
                    : "text-[var(--hm-ink-400)]",
              )}
            >
              {done ? (
                <Check className="size-3.5" />
              ) : active ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <span className="size-3.5 rounded-full border border-current opacity-40" />
              )}
              {step.label}
            </li>
          );
        })}
      </ol>

      <p className="max-w-sm text-center text-[11.5px] text-[var(--hm-ink-400)]">
        Everything runs in this browser. The cutout model downloads once, then later products are
        much faster.
      </p>
    </div>
  );
}

function ResultPanel({
  previewUrl,
  palette,
  productName,
  unitLabel,
  price,
  compareAtPrice,
  emoji,
  cutout,
  timings,
  composedFrom,
  existing,
}: {
  previewUrl: string;
  palette: MediaPalette | null;
  productName: string;
  unitLabel: string;
  price: number;
  compareAtPrice: number | null;
  emoji: string | null;
  cutout: CutoutOutcome;
  timings: { total: number; cutout: number } | null;
  /** Set when the picture was built from the category's own products. */
  composedFrom?: number;
  existing?: ProductMedia | null;
}) {
  const modelLabel = cutout.model
    ? (MODEL_LIST.find((m) => m.id === cutout.model)?.label ?? cutout.model)
    : null;

  /*
   * A composed tile has no single model behind it — each piece was cut out on
   * its own, or was already a cutout — so naming one would be a fiction, and
   * naming none printed "Removed — null".
   */
  const backgroundRow = composedFrom
    ? `Arranged from ${composedFrom} product${composedFrom === 1 ? "" : "s"}, each cut out`
    : cutout.canvas
      ? `Removed — ${modelLabel ?? "already cut out"}`
      : "Kept (removal did not run)";

  const rows: [string, string][] = [
    ["Background", backgroundRow],
    ["Card colour", palette?.cardBg ?? "—"],
    ["Text colour", palette?.textColor ?? "—"],
    ["Dominant colour", palette?.dominant ?? "not detected"],
    ["Time taken", timings ? `${(timings.total / 1000).toFixed(1)}s` : "—"],
  ];

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <div className="lg:w-[240px]">
        <p className="mb-2 text-[12.5px] font-semibold text-[var(--hm-ink-700)]">
          How it will look in the app
        </p>
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
        {cutout.failureReason ? (
          <p className="mb-3 flex items-start gap-2 rounded-[var(--hm-radius-control)] border border-[var(--hm-warning-100)] bg-[var(--hm-warning-50)] px-3 py-2.5 text-[12.5px] text-[var(--hm-warning-700)]">
            <AlertTriangle className="mt-px size-4 shrink-0" />
            <span>
              The background could not be removed, so the photo is used as it is and the colours
              come from the whole picture. {cutout.failureReason}
            </span>
          </p>
        ) : (
          <p className="mb-3 flex items-center gap-2 rounded-[var(--hm-radius-control)] border border-[var(--hm-success-100)] bg-[var(--hm-success-50)] px-3 py-2.5 text-[12.5px] text-[var(--hm-success-700)]">
            <Check className="size-4 shrink-0" />
            Background removed and colours taken from the product itself.
          </p>
        )}

        <dl className="divide-y divide-[var(--hm-border)] rounded-[var(--hm-radius-card)] border border-[var(--hm-border)]">
          {rows.map(([label, value]) => (
            <div key={label} className="flex gap-3 px-3.5 py-2.5 text-[12.5px]">
              <dt className="w-[140px] shrink-0 text-[var(--hm-ink-500)]">{label}</dt>
              <dd className="flex min-w-0 flex-1 items-center gap-2 break-words text-[var(--hm-ink-800)]">
                {/^#[0-9A-F]{6}$/i.test(value) ? (
                  <span
                    aria-hidden
                    className="size-3.5 shrink-0 rounded-full border border-[var(--hm-border)]"
                    style={{ background: value }}
                  />
                ) : null}
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {existing ? (
          <p className="mt-3 text-[11.5px] text-[var(--hm-warning-700)]">
            Saving replaces the image currently on this product.
          </p>
        ) : null}
      </div>
    </div>
  );
}
