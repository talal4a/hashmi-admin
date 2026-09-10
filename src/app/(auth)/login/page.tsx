import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionAdmin } from "@/lib/auth/session";
import { isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { isFirebaseWebConfigured } from "@/lib/firebase/config";
import { LoginForm } from "@/components/admin-shell/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const admin = await getSessionAdmin();
  if (admin) redirect("/dashboard");

  const firebaseReady = isFirebaseAdminConfigured && isFirebaseWebConfigured;

  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[var(--hm-navy-950)] via-[var(--hm-navy-900)] to-[var(--hm-cyan-900)] p-10 text-white lg:flex">
        <div
          aria-hidden
          className="absolute -top-24 -right-24 size-[420px] rounded-full bg-[var(--hm-cyan-500)]/22 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-32 -left-16 size-[360px] rounded-full bg-[var(--hm-cyan-400)]/12 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-[13px] bg-gradient-to-br from-[var(--hm-cyan-400)] to-[var(--hm-cyan-600)] text-[18px] font-extrabold shadow-[var(--hm-shadow-cyan)]">
            H
          </span>
          <span>
            <span className="block text-[16px] leading-tight font-bold">HashmiMart</span>
            <span className="block text-[11px] tracking-[0.14em] text-white/50 uppercase">
              Admin Dashboard
            </span>
          </span>
        </div>

        <div className="relative max-w-md">
          <p className="text-[26px] leading-[1.25] font-bold tracking-[-0.02em]">
            One place to run the whole store — catalog, orders, voice orders, stock and media.
          </p>
          <p className="mt-4 text-[14px] leading-relaxed text-white/60">
            Built for the people running HashmiMart&apos;s floor, not for a demo.
          </p>
        </div>

        <dl className="relative grid grid-cols-3 gap-5 border-t border-white/12 pt-6">
          {[
            ["Catalog", "Media studio built in"],
            ["Orders", "Voice review + fulfilment"],
            ["Stock", "Auditable movements"],
          ].map(([title, sub]) => (
            <div key={title}>
              <dt className="text-[13.5px] font-bold">{title}</dt>
              <dd className="mt-0.5 text-[11.5px] text-white/50">{sub}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex items-center justify-center px-5 py-12">
        <LoginForm firebaseReady={firebaseReady} />
      </section>
    </main>
  );
}
