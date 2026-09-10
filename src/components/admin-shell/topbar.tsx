"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronDown, LogOut, Menu, Search, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { initials } from "@/lib/utils/format";
import { navItemForPath } from "./nav";
import { useShell } from "./shell-context";

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { admin, counts, backend, setMobileOpen, setPaletteOpen, online } = useShell();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const current = navItemForPath(pathname);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      router.replace("/login");
      router.refresh();
    } catch {
      toast.error("Could not sign out. Check your connection and try again.");
      setSigningOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-[var(--hm-topbar-h)] items-center gap-2 border-b border-[var(--hm-border)] bg-white/88 px-4 backdrop-blur-md">
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
        className="rounded-[10px] p-2 text-[var(--hm-ink-500)] transition-colors hover:bg-[var(--hm-ink-100)] hover:text-[var(--hm-ink-900)] lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      <p className="hidden truncate text-[15px] font-semibold text-[var(--hm-ink-900)] md:block">
        {current?.label ?? "HashmiMart Admin"}
      </p>

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="ml-auto flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[var(--hm-radius-control)] border border-[var(--hm-border)] bg-[var(--hm-ink-50)] px-3 text-left text-[13px] text-[var(--hm-ink-400)] transition-colors hover:border-[var(--hm-cyan-300)] hover:bg-white sm:max-w-[340px] md:ml-6 md:mr-auto"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">Search or jump to…</span>
        <kbd className="ml-auto hidden shrink-0 rounded-[6px] border border-[var(--hm-border)] bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--hm-ink-500)] sm:block">
          ⌘K
        </kbd>
      </button>

      <div className="flex items-center gap-1.5">
        {!online && (
          <span
            title="You are offline"
            className="flex items-center gap-1.5 rounded-full bg-[var(--hm-warning-50)] px-2.5 py-1 text-[11px] font-bold text-[var(--hm-warning-700)] uppercase"
          >
            <WifiOff className="size-3.5" />
            <span className="hidden sm:inline">Offline</span>
          </span>
        )}

        {/* Environment badge (PRD §2.2) — states plainly where data is going. */}
        <span
          title={
            backend === "firestore"
              ? "Connected to Firestore"
              : "Firebase is not configured — reading and writing the local development datastore"
          }
          className={cn(
            "hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[0.05em] uppercase sm:flex",
            backend === "firestore"
              ? "bg-[var(--hm-success-50)] text-[var(--hm-success-700)]"
              : "bg-[var(--hm-warning-50)] text-[var(--hm-warning-700)]",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              backend === "firestore" ? "bg-[var(--hm-success-500)]" : "bg-[var(--hm-warning-500)]",
            )}
          />
          {backend === "firestore" ? "Firestore" : "Local data"}
        </span>

        <Link
          href="/notifications"
          aria-label={`Notifications${counts.unreadNotifications ? `, ${counts.unreadNotifications} unread` : ""}`}
          className="relative rounded-[10px] p-2 text-[var(--hm-ink-500)] transition-colors hover:bg-[var(--hm-ink-100)] hover:text-[var(--hm-ink-900)]"
        >
          <Bell className="size-[18px]" />
          {counts.unreadNotifications > 0 && (
            <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-[var(--hm-cyan-500)] text-[9.5px] font-bold text-white tabular-nums">
              {counts.unreadNotifications > 9 ? "9+" : counts.unreadNotifications}
            </span>
          )}
        </Link>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2 rounded-[10px] py-1 pr-2 pl-1 transition-colors hover:bg-[var(--hm-ink-100)]"
          >
            <span className="flex size-8 items-center justify-center rounded-[9px] bg-gradient-to-br from-[var(--hm-cyan-400)] to-[var(--hm-cyan-600)] text-[12px] font-bold text-white">
              {initials(admin.displayName)}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-[12.5px] leading-tight font-semibold text-[var(--hm-ink-900)]">
                {admin.displayName}
              </span>
              <span className="block text-[11px] text-[var(--hm-ink-500)]">
                {ROLE_LABELS[admin.role]}
              </span>
            </span>
            <ChevronDown className="size-3.5 text-[var(--hm-ink-400)]" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-1.5 w-60 overflow-hidden rounded-[var(--hm-radius-control-lg)] border border-[var(--hm-border)] bg-white shadow-[var(--hm-shadow-md)]"
            >
              <div className="border-b border-[var(--hm-border)] px-3.5 py-3">
                <p className="truncate text-[13px] font-semibold text-[var(--hm-ink-900)]">
                  {admin.displayName}
                </p>
                <p className="truncate text-[12px] text-[var(--hm-ink-500)]">{admin.email}</p>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={signOut}
                disabled={signingOut}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-[var(--hm-danger-700)] transition-colors hover:bg-[var(--hm-danger-50)] disabled:opacity-60"
              >
                <LogOut className="size-4" />
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
