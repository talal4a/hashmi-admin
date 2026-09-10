"use client";

import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import type { ReactNode } from "react";

/** 120–220ms fade/translate on route change, per PRD §13.2. */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}
