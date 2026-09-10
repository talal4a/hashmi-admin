"use client";

import type { CSSProperties, ReactNode } from "react";
import { OfflineState } from "@/components/ui/states";
import { PageTransition } from "./page-transition";
import { Topbar } from "./topbar";
import { useShell } from "./shell-context";

/**
 * Content frame. Its left offset follows the sidebar width.
 *
 * The offset is applied through a CSS variable and a `lg:` class rather than by
 * measuring the viewport in JavaScript. Reading `window.innerWidth` during
 * render made the server emit `0px` and the browser `268px`, which React
 * reports as a hydration mismatch. Letting the media query decide means the
 * server and the client render identical markup, and the breakpoint here can
 * never drift from the one the sidebar itself uses.
 */
export function ShellFrame({ children }: { children: ReactNode }) {
  const { collapsed, online } = useShell();

  return (
    <div
      style={
        {
          "--hm-content-offset": collapsed
            ? "var(--hm-sidebar-w-collapsed)"
            : "var(--hm-sidebar-w)",
        } as CSSProperties
      }
      className="flex min-h-screen flex-col transition-[padding-left] duration-[var(--hm-dur-med)] ease-[var(--hm-ease)] lg:pl-[var(--hm-content-offset)]"
    >
      {/* Keyboard users can jump past the nav and topbar (PRD §16.2). */}
      <a
        href="#hm-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-[var(--hm-radius-control)] focus:bg-[var(--hm-cyan-600)] focus:px-3.5 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>
      <Topbar />
      <main id="hm-main" tabIndex={-1} className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
        {!online ? (
          <div className="mb-4">
            <OfflineState />
          </div>
        ) : null}
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
