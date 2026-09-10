"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { NAV_SECTIONS } from "./nav";
import { NavIcon } from "./icon";
import { useShell } from "./shell-context";

function badgeValue(key: string | undefined, counts: ReturnType<typeof useShell>["counts"]) {
  if (!key) return 0;
  if (key === "pendingOrders") return counts.pendingOrders;
  if (key === "voicePending") return counts.voicePending;
  if (key === "lowStock") return counts.lowStock;
  return 0;
}

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggleCollapsed, mobileOpen, setMobileOpen, can, counts } = useShell();

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => can(item.permission)),
  })).filter((section) => section.items.length > 0);

  const nav = (
    <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {sections.map((section) => (
        <div key={section.label}>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.14 }}
                className="overflow-hidden px-3 pb-1.5 text-[10.5px] font-bold tracking-[0.12em] text-white/38 uppercase"
              >
                {section.label}
              </motion.p>
            )}
          </AnimatePresence>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const badge = badgeValue(item.badge, counts);
              return (
                <li key={item.key} className="relative">
                  {active && (
                    <motion.span
                      layoutId="hm-sidebar-active"
                      transition={{ type: "spring", stiffness: 520, damping: 40 }}
                      className="absolute inset-0 rounded-[11px] bg-[var(--hm-cyan-500)] shadow-[var(--hm-shadow-cyan)]"
                    />
                  )}
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "relative flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-[13.5px] font-medium transition-colors duration-[var(--hm-dur-fast)]",
                      active ? "text-white" : "text-white/68 hover:bg-white/7 hover:text-white",
                      collapsed && "justify-center px-0",
                    )}
                  >
                    <NavIcon name={item.icon} className="size-[18px] shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {!collapsed && badge > 0 && (
                      <span
                        className={cn(
                          "ml-auto rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums",
                          active ? "bg-white/25 text-white" : "bg-white/12 text-white/85",
                        )}
                      >
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                    {collapsed && badge > 0 && (
                      <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-[var(--hm-cyan-300)]" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const brand = (
    <div
      className={cn(
        "flex items-center gap-2.5 border-b border-white/8 px-4",
        collapsed ? "justify-center py-4" : "py-4",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-[var(--hm-cyan-400)] to-[var(--hm-cyan-600)] text-[15px] font-extrabold text-white shadow-[var(--hm-shadow-cyan)]">
        H
      </span>
      {!collapsed && (
        <span className="min-w-0">
          <span className="block truncate text-[14.5px] leading-tight font-bold text-white">
            HashmiMart
          </span>
          <span className="block text-[10.5px] tracking-[0.06em] text-white/45 uppercase">
            Admin
          </span>
        </span>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop rail */}
      <motion.aside
        animate={{ width: collapsed ? 76 : 268 }}
        transition={{ type: "spring", stiffness: 420, damping: 40 }}
        className="fixed inset-y-0 left-0 z-40 hidden flex-col bg-gradient-to-b from-[var(--hm-navy-950)] to-[var(--hm-navy-900)] lg:flex"
      >
        {brand}
        {nav}
        <div className="border-t border-white/8 p-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[12.5px] font-medium text-white/55 transition-colors hover:bg-white/7 hover:text-white",
              collapsed && "justify-center px-0",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-[18px]" />
            ) : (
              <>
                <PanelLeftClose className="size-[18px]" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </motion.aside>

      {/* Mobile drawer — emergency order/status access (PRD §2.2) */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="absolute inset-0 bg-[rgba(9,18,33,0.5)] backdrop-blur-[2px]"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 40 }}
              className="relative flex h-full w-[276px] flex-col bg-gradient-to-b from-[var(--hm-navy-950)] to-[var(--hm-navy-900)]"
            >
              <div className="flex items-center justify-between border-b border-white/8 px-4 py-4">
                <span className="flex items-center gap-2.5">
                  <span className="flex size-9 items-center justify-center rounded-[10px] bg-gradient-to-br from-[var(--hm-cyan-400)] to-[var(--hm-cyan-600)] text-[15px] font-extrabold text-white">
                    H
                  </span>
                  <span className="text-[14.5px] font-bold text-white">HashmiMart</span>
                </span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation"
                  className="rounded-[9px] p-1.5 text-white/60 hover:bg-white/8 hover:text-white"
                >
                  <X className="size-4.5" />
                </button>
              </div>
              {nav}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
