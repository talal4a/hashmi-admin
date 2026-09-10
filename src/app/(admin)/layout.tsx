import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { datastoreBackend } from "@/server/datastore";
import { CommandPalette } from "@/components/admin-shell/command-palette";
import { ShellProvider } from "@/components/admin-shell/shell-context";
import { ShellFrame } from "@/components/admin-shell/shell-frame";
import { Sidebar } from "@/components/admin-shell/sidebar";
import { getShellCounts } from "@/server/services/shell-counts";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Every admin page is behind this guard; unauthenticated users never reach it.
  const admin = await requireAdmin();
  const counts = await getShellCounts(admin);

  return (
    <ShellProvider admin={admin} counts={counts} backend={datastoreBackend()}>
      <div className="min-h-screen">
        <Sidebar />
        <ShellFrame>{children}</ShellFrame>
        <CommandPalette />
      </div>
    </ShellProvider>
  );
}
