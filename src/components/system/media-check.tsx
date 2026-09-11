"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Check, Loader2, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import {
  DEFAULT_REMBG_MODEL,
  MODEL_SPECS,
  checkModel,
  removeBackground,
} from "@/lib/media/background-removal";
import { extractSwatchesFromCanvas } from "@/lib/media/extract-palette";
import { proxiedImageUrl } from "@/lib/media/providers/hosts";
import { canvasToBlob, loadImage } from "@/components/media-studio/image-utils";
import type { ProviderImageResult } from "@/types";

/**
 * Media pipeline self-check.
 *
 * Background removal and colour extraction happen in the browser, across four
 * moving parts — the provider APIs, the image proxy, the model download and the
 * inference runtime — and when one of them is broken the symptom is the same
 * either way: a product that quietly ends up on the default card colour.
 *
 * So rather than leave anyone guessing, this runs the real thing end to end on
 * a picture it draws itself and says which part failed. No product is touched.
 */

type Status = "pending" | "running" | "pass" | "warn" | "fail";

interface Step {
  id: string;
  label: string;
  status: Status;
  detail: string;
}

const STEPS: { id: string; label: string }[] = [
  { id: "providers", label: "Photo search" },
  { id: "proxy", label: "Image proxy" },
  { id: "model", label: "Cutout model" },
  { id: "cutout", label: "Background removal" },
  { id: "palette", label: "Colour extraction" },
];

/** A red disc on white — something with an unambiguous subject and colour. */
function testImage(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 320;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser has no 2D canvas.");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, 320, 320);
  ctx.fillStyle = "#D62828";
  ctx.beginPath();
  ctx.arc(160, 160, 110, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function alphaAt(canvas: HTMLCanvasElement, x: number, y: number): number {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 255;
  return ctx.getImageData(x, y, 1, 1).data[3];
}

export function MediaCheck() {
  const [steps, setSteps] = useState<Step[]>(
    STEPS.map((s) => ({ ...s, status: "pending", detail: "" })),
  );
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const set = useCallback((id: string, status: Status, detail: string) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status, detail } : s)));
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setNote(null);
    setSteps(STEPS.map((s) => ({ ...s, status: "pending", detail: "" })));

    /* 1. Can the server reach the photo providers? */
    set("providers", "running", "Searching…");
    let sample: ProviderImageResult | null = null;
    try {
      const response = await fetch("/api/media/search?q=apple&perPage=6");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as {
        results: ProviderImageResult[];
        providers?: { provider: string; total: number; error?: string }[];
      };
      sample = data.results[0] ?? null;
      const missing = (data.providers ?? [])
        .filter((s) => s.error === "Not configured")
        .map((s) => s.provider);
      if (data.results.length === 0) {
        set("providers", "fail", "No provider returned an image. Check the API keys on the server.");
      } else if (missing.length > 0) {
        set(
          "providers",
          "warn",
          `${data.results.length} images found, but ${missing.join(" and ")} ${missing.length === 1 ? "has" : "have"} no API key set.`,
        );
      } else {
        set("providers", "pass", `${data.results.length} images found across all three providers.`);
      }
    } catch (error) {
      set(
        "providers",
        "fail",
        error instanceof Error ? error.message : "The search request failed.",
      );
    }

    /* 2. Can a provider image be loaded through this origin and read back? */
    set("proxy", "running", "Fetching one image…");
    if (!sample) {
      set("proxy", "warn", "Skipped — no image to try.");
    } else {
      try {
        const image = await loadImage(proxiedImageUrl(sample.fullUrl), true);
        const probe = document.createElement("canvas");
        probe.width = 8;
        probe.height = 8;
        probe.getContext("2d")?.drawImage(image.element, 0, 0, 8, 8);
        // The read is the point: a tainted canvas throws here, and that is
        // exactly the failure that used to leave every card the default colour.
        probe.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, 8, 8);
        set("proxy", "pass", `Loaded ${image.width}×${image.height} and its pixels are readable.`);
      } catch (error) {
        set(
          "proxy",
          "fail",
          error instanceof Error ? error.message : "The image could not be loaded.",
        );
      }
    }

    /* 3. Will the server hand over the model? */
    set("model", "running", "Asking the server…");
    const spec = MODEL_SPECS[DEFAULT_REMBG_MODEL];
    const availability = await checkModel(DEFAULT_REMBG_MODEL);
    if (!availability.reachable) {
      set("model", "fail", availability.reason ?? "The model could not be reached.");
    } else if (availability.ready) {
      set("model", "pass", `${spec.file} is on the server and ready.`);
    } else {
      set(
        "model",
        "warn",
        `Not downloaded yet — the first cutout will fetch ${Math.round(spec.bytes / 1024 / 1024)} MB once.`,
      );
    }

    /* 4. Does removal actually remove anything? */
    set("cutout", "running", "Cutting out a test picture…");
    let cutout: HTMLCanvasElement | null = null;
    try {
      const source = testImage();
      const result = await removeBackground(await canvasToBlob(source, "image/png"), {
        model: DEFAULT_REMBG_MODEL,
        onProgress: (p) => set("cutout", "running", p.message),
      });
      const loaded = await loadImage(result.objectUrl, false);
      const canvas = document.createElement("canvas");
      canvas.width = loaded.width;
      canvas.height = loaded.height;
      canvas.getContext("2d")?.drawImage(loaded.element, 0, 0);
      URL.revokeObjectURL(result.objectUrl);
      cutout = canvas;

      // The white corner must be gone and the red middle must remain.
      const corner = alphaAt(canvas, 4, 4);
      const middle = alphaAt(canvas, Math.round(canvas.width / 2), Math.round(canvas.height / 2));
      if (corner < 40 && middle > 200) {
        set(
          "cutout",
          "pass",
          `Background removed in ${(result.durationMs / 1000).toFixed(1)}s, subject kept.`,
        );
      } else {
        set(
          "cutout",
          "warn",
          `It ran, but the result looks wrong (corner alpha ${corner}, centre alpha ${middle}).`,
        );
      }
    } catch (error) {
      set("cutout", "fail", error instanceof Error ? error.message : "Removal failed.");
    }

    /* 5. Do the colours come back, and are they the right ones? */
    set("palette", "running", "Reading colours…");
    try {
      const swatches = extractSwatchesFromCanvas(cutout ?? testImage());
      if (!swatches.dominant) {
        set("palette", "fail", "No colour could be read from the test picture.");
      } else {
        const red = /^#([A-F0-9]{2})([A-F0-9]{2})([A-F0-9]{2})$/i.exec(swatches.dominant);
        const isRedish =
          red !== null &&
          parseInt(red[1], 16) > 120 &&
          parseInt(red[1], 16) > parseInt(red[2], 16) + 40;
        set(
          "palette",
          isRedish ? "pass" : "warn",
          isRedish
            ? `Read ${swatches.dominant} from a red test picture — correct.`
            : `Read ${swatches.dominant}, which is not the red that was drawn.`,
        );
      }
    } catch (error) {
      set("palette", "fail", error instanceof Error ? error.message : "Extraction failed.");
    }

    setRunning(false);
    setNote("Nothing was saved — this ran on a picture drawn for the test.");
  }, [set]);

  const failed = steps.some((s) => s.status === "fail");
  const finished = !running && steps.some((s) => s.status !== "pending");

  return (
    <Card>
      <CardHeader
        title="Media pipeline check"
        subtitle="Runs background removal and colour extraction for real, and says what broke"
        action={
          <Button size="sm" variant="outline" onClick={run} loading={running} disabled={running}>
            {!running && <Play className="size-3.5" />}
            {running ? "Checking…" : finished ? "Run again" : "Run the check"}
          </Button>
        }
      />
      <CardBody>
        <ol className="flex flex-col gap-1.5">
          {steps.map((step) => (
            <li key={step.id} className="flex items-start gap-2.5 text-[12.5px]">
              <span className="mt-px shrink-0">
                {step.status === "running" ? (
                  <Loader2 className="size-4 animate-spin text-[var(--hm-cyan-600)]" />
                ) : step.status === "pass" ? (
                  <Check className="size-4 text-[var(--hm-success-700)]" />
                ) : step.status === "warn" ? (
                  <AlertTriangle className="size-4 text-[var(--hm-warning-700)]" />
                ) : step.status === "fail" ? (
                  <X className="size-4 text-[var(--hm-danger-700)]" />
                ) : (
                  <span className="block size-4 rounded-full border border-[var(--hm-border-strong)]" />
                )}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "font-semibold",
                    step.status === "pending"
                      ? "text-[var(--hm-ink-400)]"
                      : "text-[var(--hm-ink-900)]",
                  )}
                >
                  {step.label}
                </span>
                {step.detail ? (
                  <span className="ml-1.5 text-[var(--hm-ink-500)]">— {step.detail}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>

        <AnimatePresence>
          {note ? (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={cn(
                "mt-3 overflow-hidden text-[11.5px]",
                failed ? "text-[var(--hm-danger-700)]" : "text-[var(--hm-ink-400)]",
              )}
            >
              {failed
                ? "Something above failed — the message on that line says what to fix."
                : note}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </CardBody>
    </Card>
  );
}
