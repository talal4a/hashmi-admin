"use client";

import { useEffect } from "react";

/**
 * Persistent unsaved-change guard on forms (PRD §2.2).
 * Blocks tab close/reload while a form is dirty; in-app navigation is guarded
 * by the form components themselves, which confirm before routing away.
 */
export function UnsavedGuard({ when }: { when: boolean }) {
  useEffect(() => {
    if (!when) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [when]);
  return null;
}
