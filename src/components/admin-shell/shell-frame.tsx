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
      <Topbar />
      <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
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
