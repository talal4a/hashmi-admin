"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Brush,
  Eraser,
  Loader2,
  RefreshCw,
  SkipForward,
  Undo2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { cn } from "@/lib/utils/cn";
import {
  BackgroundRemovalUnavailableError,
  DEFAULT_REMBG_MODEL,
  MODEL_LIST,
  removeBackground,
  type RembgModel,
  type RemovalProgress,
} from "@/lib/media/background-removal";
import { canvasToBlob, loadImage, previewDataUrl } from "./image-utils";

export interface CutoutOutcome {
  canvas: HTMLCanvasElement | null;
  model: RembgModel | null;
  modelVersion: string | null;
  failureReason: string | null;
  skipped: boolean;
}

type Tool = "erase" | "restore";

/**
 * Background removal stage (PRD §5.3, §24).
 *
 * Progress is real — it comes from the inference callback, never a timer. The
 * original is never modified, so a poor result can be retried with a different
 * model, corrected by hand with the erase/restore brush, or skipped entirely.
 */
export function CutoutStage({
  sourceCanvas,
  outcome,
  onChange,
}: {
  sourceCanvas: HTMLCanvasElement;
  outcome: CutoutOutcome;
  onChange: (next: CutoutOutcome) => void;
}) {
  const [model, setModel] = useState<RembgModel>(outcome.model ?? DEFAULT_REMBG_MODEL);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<RemovalProgress | null>(null);
  const [error, setError] = useState<string | null>(outcome.failureReason);
  const [compare, setCompare] = useState(52);
  const [tool, setTool] = useState<Tool>("erase");
  const [brushSize, setBrushSize] = useState(36);
  const [painting, setPainting] = useState(false);

  // Re-encoding a 1000px canvas to a data URL on every render is a visible
  // stutter while painting; the comparison image never changes, so encode once.
  const sourceUrl = useMemo(() => previewDataUrl(sourceCanvas), [sourceCanvas]);

  const cutoutRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<ImageData[]>([]);
  const [historyDepth, setHistoryDepth] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  /* Mirror the working cutout onto the visible canvas. */
  const paint = useCallback(() => {
    const target = cutoutRef.current;
    const working = outcome.canvas;
    if (!target || !working) return;
    target.width = working.width;
    target.height = working.height;
    const ctx = target.getContext("2d");
    ctx?.clearRect(0, 0, target.width, target.height);
    ctx?.drawImage(working, 0, 0);
  }, [outcome.canvas]);

  useEffect(() => {
    paint();
  }, [paint]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(
    async (chosen: RembgModel) => {
      setRunning(true);
      setError(null);
      setProgress({ step: "downloading", progress: 0, message: "Preparing…" });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const sourceBlob = await canvasToBlob(sourceCanvas, "image/png");
        const result = await removeBackground(sourceBlob, {
          model: chosen,
          signal: controller.signal,
          onProgress: setProgress,
        });

        const loaded = await loadImage(result.objectUrl, false);
        const canvas = document.createElement("canvas");
        canvas.width = loaded.width;
        canvas.height = loaded.height;
        canvas.getContext("2d")?.drawImage(loaded.element, 0, 0);
        URL.revokeObjectURL(result.objectUrl);

        historyRef.current = [];
        setHistoryDepth(0);
        onChange({
          canvas,
          model: result.model,
          modelVersion: result.modelVersion,
          failureReason: null,
          skipped: false,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message =
          err instanceof BackgroundRemovalUnavailableError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Background removal failed.";
        setError(message);
        // The original is intact — record the failure and let the admin decide.
        onChange({ canvas: null, model: chosen, modelVersion: null, failureReason: message, skipped: false });
      } finally {
        setRunning(false);
        setProgress(null);
        abortRef.current = null;
      }
    },
    [sourceCanvas, onChange],
  );

  /* Manual mask correction. */
  const pointerToCanvas = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = cutoutRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const beginStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = cutoutRef.current;
    if (!canvas || !outcome.canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    try {
      historyRef.current = [...historyRef.current.slice(-9), ctx.getImageData(0, 0, canvas.width, canvas.height)];
      setHistoryDepth(historyRef.current.length);
    } catch {
      // Tainted canvas — undo is unavailable but painting still works.
    }
    setPainting(true);
    (event.target as Element).setPointerCapture?.(event.pointerId);
    stroke(event);
  };

  const stroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = cutoutRef.current;
    const point = pointerToCanvas(event);
    if (!canvas || !point) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const radius = (brushSize / 2) * (canvas.width / (canvas.getBoundingClientRect().width || 1));

    if (tool === "erase") {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      // Restore paints the original pixels back through a circular clip.
      ctx.save();
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
  };

  const endStroke = () => {
    if (!painting) return;
    setPainting(false);
    const canvas = cutoutRef.current;
    if (!canvas) return;
    const next = document.createElement("canvas");
    next.width = canvas.width;
    next.height = canvas.height;
    next.getContext("2d")?.drawImage(canvas, 0, 0);
    onChange({ ...outcome, canvas: next });
  };

  const undo = () => {
    const canvas = cutoutRef.current;
    const previous = historyRef.current.pop();
    if (!canvas || !previous) return;
    setHistoryDepth(historyRef.current.length);
    canvas.getContext("2d")?.putImageData(previous, 0, 0);
    const next = document.createElement("canvas");
    next.width = canvas.width;
    next.height = canvas.height;
    next.getContext("2d")?.drawImage(canvas, 0, 0);
    onChange({ ...outcome, canvas: next });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={model}
          onChange={(e) => setModel(e.target.value as RembgModel)}
          aria-label="Background removal model"
          className="h-9 w-auto min-w-[190px]"
          disabled={running}
        >
          {MODEL_LIST.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Select>

        <Button onClick={() => run(model)} loading={running} disabled={running}>
          {!running && (outcome.canvas ? <RefreshCw className="size-4" /> : <Wand2 className="size-4" />)}
          {running ? "Removing…" : outcome.canvas ? "Run again" : "Remove background"}
        </Button>

        {running ? (
          <Button variant="outline" onClick={() => abortRef.current?.abort()}>
            Cancel
          </Button>
        ) : null}

        <Button
          variant="ghost"
          onClick={() =>
            onChange({ canvas: null, model: null, modelVersion: null, failureReason: null, skipped: true })
          }
          disabled={running}
        >
          <SkipForward className="size-4" />
          Skip removal
        </Button>
      </div>

      <p className="text-[11.5px] text-[var(--hm-ink-500)]">
        {MODEL_LIST.find((m) => m.id === model)?.note} Inference runs in this browser — no image
        leaves your machine for this step, and there is no per-image charge.
      </p>

      {/* Real progress from the inference callback (PRD §13.2) */}
      <AnimatePresence>
        {progress ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-[var(--hm-radius-control)] border border-[var(--hm-cyan-100)] bg-[var(--hm-cyan-50)] px-3 py-2.5">
              <div className="mb-1.5 flex items-center justify-between text-[12px] font-semibold text-[var(--hm-cyan-800)]">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" />
                  {progress.message}
                </span>
                <span className="tabular-nums">{Math.round(progress.progress)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white">
                <motion.div
                  className="h-full rounded-full bg-[var(--hm-cyan-500)]"
                  animate={{ width: `${progress.progress}%` }}
                  transition={{ duration: 0.25 }}
                />
              </div>
              <p className="mt-1.5 text-[10.5px] text-[var(--hm-cyan-700)]">
                The model downloads once and is cached, so later products are much faster.
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-[var(--hm-radius-control)] border border-[var(--hm-warning-100)] bg-[var(--hm-warning-50)] px-3 py-2.5 text-[12.5px] text-[var(--hm-warning-700)]"
        >
          <AlertTriangle className="mt-px size-4 shrink-0" />
          <span>
            {error}
            <br />
            <strong>Your original image is untouched.</strong> Try another model, or continue without
            a cutout.
          </span>
        </div>
      ) : null}

      {/* Original vs cutout comparison */}
      <div>
        <p className="mb-2 text-[12.5px] font-semibold text-[var(--hm-ink-700)]">
          {outcome.canvas ? "Original vs cutout — drag the handle" : "Original"}
        </p>
        <div className="hm-checkerboard relative aspect-square w-full max-w-[420px] overflow-hidden rounded-[var(--hm-radius-card)] border border-[var(--hm-border)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sourceUrl}
            alt="Original"
            className="absolute inset-0 size-full object-contain"
          />
          {outcome.canvas ? (
            <>
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ clipPath: `inset(0 0 0 ${compare}%)` }}
              >
                <canvas
                  ref={cutoutRef}
                  onPointerDown={beginStroke}
                  onPointerMove={(e) => painting && stroke(e)}
                  onPointerUp={endStroke}
                  onPointerCancel={endStroke}
                  className="hm-checkerboard absolute inset-0 size-full touch-none object-contain"
                  style={{ cursor: tool === "erase" ? "crosshair" : "cell" }}
                />
              </div>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-0.5 bg-[var(--hm-cyan-400)]"
                style={{ left: `${compare}%` }}
              />
              <input
                type="range"
                min={0}
                max={100}
                value={compare}
                onChange={(e) => setCompare(Number(e.target.value))}
                aria-label="Compare original and cutout"
                className="absolute bottom-2 left-1/2 w-[70%] -translate-x-1/2 accent-[var(--hm-cyan-500)]"
              />
            </>
          ) : null}
        </div>
      </div>

      {/* Manual mask correction */}
      {outcome.canvas ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--hm-radius-control)] border border-[var(--hm-border)] bg-[var(--hm-ink-50)] px-3 py-2.5">
          <span className="text-[12px] font-semibold text-[var(--hm-ink-700)]">Fix by hand:</span>
          <Button
            variant={tool === "erase" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setTool("erase")}
          >
            <Eraser className="size-3.5" />
            Erase
          </Button>
          <Button
            variant={tool === "restore" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setTool("restore")}
          >
            <Brush className="size-3.5" />
            Restore
          </Button>
          <label className="flex items-center gap-1.5 text-[12px] text-[var(--hm-ink-600,#475569)]">
            Brush
            <input
              type="range"
              min={8}
              max={90}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              aria-label="Brush size"
              className="w-24 accent-[var(--hm-cyan-500)]"
            />
          </label>
          <Button variant="ghost" size="sm" onClick={undo} disabled={historyDepth === 0}>
            <Undo2 className="size-3.5" />
            Undo
          </Button>
          <span
            className={cn(
              "ml-auto text-[11.5px]",
              painting ? "text-[var(--hm-cyan-700)]" : "text-[var(--hm-ink-400)]",
            )}
          >
            {painting ? "Painting…" : "Drag on the cutout side to correct edges"}
          </span>
        </div>
      ) : null}

      {outcome.skipped ? (
        <p className="text-[12.5px] text-[var(--hm-ink-500)]">
          Background removal skipped. The original image will be used as-is, and the palette will be
          taken from it.
        </p>
      ) : null}
    </div>
  );
}
