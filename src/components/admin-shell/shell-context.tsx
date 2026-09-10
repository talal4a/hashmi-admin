"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AdminUser, Permission } from "@/types";
import { can as canFn } from "@/lib/auth/permissions";

export interface ShellCounts {
  pendingOrders: number;
  voicePending: number;
  lowStock: number;
  unreadNotifications: number;
}

interface ShellState {
  admin: AdminUser;
  counts: ShellCounts;
  backend: "firestore" | "local";
  collapsed: boolean;
  toggleCollapsed: () => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  can: (permission: Permission) => boolean;
  online: boolean;
}

const ShellContext = createContext<ShellState | null>(null);

const COLLAPSE_KEY = "hm.sidebar.collapsed";

export function ShellProvider({
  admin,
  counts,
  backend,
  children,
}: {
  admin: AdminUser;
  counts: ShellCounts;
  backend: "firestore" | "local";
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // Private-mode browsers can throw on storage access; the default stands.
    }
  }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // Ignore — collapse state is a convenience, not data.
      }
      return next;
    });
  }, []);

  // Cmd/Ctrl+K opens the command palette (PRD §2.2).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<ShellState>(
    () => ({
      admin,
      counts,
      backend,
      collapsed,
      toggleCollapsed,
      mobileOpen,
      setMobileOpen,
      paletteOpen,
      setPaletteOpen,
      can: (permission: Permission) => canFn(admin, permission),
      online,
    }),
    [admin, counts, backend, collapsed, toggleCollapsed, mobileOpen, paletteOpen, online],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellState {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside ShellProvider");
  return ctx;
}
