"use client";

import {
  Bell,
  Boxes,
  ChartLine,
  GalleryHorizontalEnd,
  LayoutGrid,
  MapPinned,
  MessagesSquare,
  Mic,
  Package,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Store,
  Tags,
  TicketPercent,
  Users,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Bell,
  Boxes,
  ChartLine,
  GalleryHorizontalEnd,
  LayoutGrid,
  MapPinned,
  MessagesSquare,
  Mic,
  Package,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Store,
  Tags,
  TicketPercent,
  Users,
};

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? LayoutGrid;
  return <Icon aria-hidden className={className} />;
}
