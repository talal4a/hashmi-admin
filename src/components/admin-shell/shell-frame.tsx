"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { OfflineState } from "@/components/ui/states";
import { PageTransition } from "./page-transition";
import { Topbar } from "./topbar";
import { useShell } from "./shell-context";

/**
 * Content frame. Its left offset springs in step with the sidebar so the layout
 * reflows without jank (PRD §13.2).
 */
export function ShellFrame({ children }: { children: ReactNode }) {
  const { collapsed, online } = useShell();

  return (
    <motion.div
      animate={{ paddingLeft: typeof window !== "undefined" && window.innerWidth >= 1024 ? (collapsed ? 76 : 268) : 0 }}
      initial={false}
      transition={{ type: "spring", stiffness: 420, damping: 40 }}
      className="flex min-h-screen flex-col"
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
    </motion.div>
  );
}
