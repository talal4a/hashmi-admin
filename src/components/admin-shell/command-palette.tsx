"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { CornerDownLeft, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ALL_NAV_ITEMS } from "./nav";
import { NavIcon } from "./icon";
import { useShell } from "./shell-context";
import type { Permission } from "@/types";

interface Command {
  id: string;
  label: string;
  hint: string;
  href: string;
  icon: string;
  permission: Permission;
  group: "Go to" | "Create";
}

const QUICK_CREATE: Command[] = [
  { id: "new-product", label: "Add product", hint: "Create a new catalog product", href: "/products/new", icon: "Package", permission: "products.write", group: "Create" },
  { id: "new-category", label: "Add category", hint: "Create a new category", href: "/categories?new=1", icon: "Tags", permission: "categories.write", group: "Create" },
  { id: "new-coupon", label: "Create coupon", hint: "New discount code", href: "/offers?new=coupon", icon: "TicketPercent", permission: "marketing.write", group: "Create" },
  { id: "new-banner", label: "Create banner", hint: "New home content banner", href: "/banners?new=1", icon: "GalleryHorizontalEnd", permission: "marketing.write", group: "Create" },
  { id: "review-voice", label: "Review voice orders", hint: "Open the unreviewed queue", href: "/voice-orders", icon: "Mic", permission: "voice.view", group: "Create" },
];

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, can } = useShell();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = ALL_NAV_ITEMS.map((item) => ({
      id: `nav-${item.key}`,
      label: item.label,
      hint: item.description,
      href: item.href,
      icon: item.icon,
      permission: item.permission,
      group: "Go to" as const,
    }));
    return [...QUICK_CREATE, ...nav].filter((c) => can(c.permission));
  }, [can]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    if (!paletteOpen) {
      // Deferred so closing does not cascade a render inside the effect body.
      queueMicrotask(() => {
        setQuery("");
        setIndex(0);
      });
      return;
    }
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [paletteOpen]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (typeof document === "undefined") return null;

  const run = (command: Command) => {
    setPaletteOpen(false);
    router.push(command.href);
  };

  const groups = ["Create", "Go to"] as const;

  return createPortal(
    <AnimatePresence>
      {paletteOpen && (
        <div className="fixed inset-0 z-60 flex items-start justify-center pt-[12vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            onClick={() => setPaletteOpen(false)}
            className="absolute inset-0 bg-[rgba(9,18,33,0.4)] backdrop-blur-[4px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 460, damping: 36 }}
            className="relative mx-4 w-full max-w-[600px] overflow-hidden rounded-[var(--hm-radius-card-lg)] bg-white shadow-[var(--hm-shadow-lg)]"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setPaletteOpen(false);
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setIndex((i) => Math.min(results.length - 1, i + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              } else if (event.key === "Enter" && results[index]) {
                event.preventDefault();
                run(results[index]);
              }
            }}
          >
            <div className="flex items-center gap-2.5 border-b border-[var(--hm-border)] px-4">
              <Search className="size-4 shrink-0 text-[var(--hm-ink-400)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setIndex(0);
                }}
                placeholder="Search modules or jump to an action…"
                aria-label="Command palette search"
                className="h-13 w-full bg-transparent text-[14px] outline-none placeholder:text-[var(--hm-ink-400)]"
              />
              <kbd className="shrink-0 rounded-[6px] border border-[var(--hm-border)] bg-[var(--hm-ink-50)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--hm-ink-500)]">
                ESC
              </kbd>
            </div>

            <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-2">
              {results.length === 0 ? (
                <p className="px-4 py-8 text-center text-[13px] text-[var(--hm-ink-500)]">
                  Nothing matches “{query}”.
                </p>
              ) : (
                groups.map((group) => {
                  const items = results.filter((r) => r.group === group);
                  if (items.length === 0) return null;
                  return (
                    <div key={group} className="mb-1">
                      <p className="px-4 py-1.5 text-[10.5px] font-bold tracking-[0.1em] text-[var(--hm-ink-400)] uppercase">
                        {group}
                      </p>
                      {items.map((command) => {
                        const globalIndex = results.indexOf(command);
                        const active = globalIndex === index;
                        return (
                          <button
                            key={command.id}
                            type="button"
                            data-index={globalIndex}
                            onMouseEnter={() => setIndex(globalIndex)}
                            onClick={() => run(command)}
                            className={cn(
                              "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                              active ? "bg-[var(--hm-cyan-50)]" : "hover:bg-[var(--hm-ink-50)]",
                            )}
                          >
                            <span
                              className={cn(
                                "flex size-8 shrink-0 items-center justify-center rounded-[9px]",
                                command.group === "Create"
                                  ? "bg-[var(--hm-cyan-100)] text-[var(--hm-cyan-700)]"
                                  : "bg-[var(--hm-ink-100)] text-[var(--hm-ink-600,#475569)]",
                              )}
                            >
                              {command.group === "Create" ? (
                                <Plus className="size-4" />
                              ) : (
                                <NavIcon name={command.icon} className="size-4" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-semibold text-[var(--hm-ink-900)]">
                                {command.label}
                              </span>
                              <span className="block truncate text-[12px] text-[var(--hm-ink-500)]">
                                {command.hint}
                              </span>
                            </span>
                            {active && (
                              <CornerDownLeft className="size-3.5 shrink-0 text-[var(--hm-cyan-600)]" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
