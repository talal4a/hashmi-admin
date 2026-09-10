"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, LogIn, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { getFirebaseAuth } from "@/lib/firebase/client";

/**
 * Firebase Email/Password sign-in, then the ID token is exchanged for a secure
 * HttpOnly session cookie server-side (PRD §10.1). No admin credential is
 * hardcoded here or anywhere in the repository.
 */
export function LoginForm({ firebaseReady }: { firebaseReady: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      let body: Record<string, string>;

      if (firebaseReady) {
        const auth = getFirebaseAuth();
        if (!auth) throw new Error("Firebase is not available in this browser session.");
        const { signInWithEmailAndPassword } = await import("firebase/auth");
        const credential = await signInWithEmailAndPassword(auth, email, password);
        body = { mode: "firebase", idToken: await credential.user.getIdToken() };
      } else {
        body = { mode: "local", email, password };
      }

      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Sign-in failed. Check your details and try again.");
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in failed.";
      // Firebase surfaces machine codes; translate the common ones.
      setError(
        message.includes("auth/invalid-credential") || message.includes("auth/wrong-password")
          ? "Incorrect email or password."
          : message.includes("auth/too-many-requests")
            ? "Too many attempts. Wait a moment and try again."
            : message.includes("auth/user-not-found")
              ? "No account exists for that email."
              : message,
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-[400px]">
      <div className="mb-7 lg:hidden">
        <span className="flex size-11 items-center justify-center rounded-[13px] bg-gradient-to-br from-[var(--hm-cyan-400)] to-[var(--hm-cyan-600)] text-[18px] font-extrabold text-white">
          H
        </span>
      </div>

      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--hm-cyan-50)] px-2.5 py-1 text-[11px] font-bold tracking-[0.05em] text-[var(--hm-cyan-700)] uppercase">
        <ShieldCheck className="size-3.5" />
        Admin access
      </span>

      <h1 className="mt-3 text-[24px] leading-tight font-bold tracking-[-0.02em] text-[var(--hm-ink-900)]">
        Sign in to HashmiMart
      </h1>
      <p className="mt-1.5 text-[13.5px] text-[var(--hm-ink-500)]">
        Authorized staff only. Your session is verified on every request.
      </p>

      <form onSubmit={submit} className="mt-7 flex flex-col gap-4" noValidate>
        <Field label="Work email" htmlFor="email" required>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@hashmimart.example"
            invalid={Boolean(error)}
          />
        </Field>

        <Field label="Password" htmlFor="password" required>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="pr-10"
              invalid={Boolean(error)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--hm-ink-400)] transition-colors hover:text-[var(--hm-ink-700)]"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-[var(--hm-radius-control)] border border-[var(--hm-danger-100)] bg-[var(--hm-danger-50)] px-3 py-2.5 text-[12.5px] text-[var(--hm-danger-700)]"
          >
            <AlertCircle className="mt-px size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <Button type="submit" size="lg" loading={submitting} className="mt-1 w-full">
          {!submitting && <LogIn className="size-4" />}
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {!firebaseReady ? (
        <p className="mt-5 rounded-[var(--hm-radius-control)] border border-[var(--hm-warning-100)] bg-[var(--hm-warning-50)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--hm-warning-700)]">
          Firebase is not configured, so the dashboard is running against the local development
          datastore. Sign in with a seeded admin email and the development password set in your{" "}
          <code>.env.local</code> — see the README for the variable name. Add the Firebase keys to
          switch to real authentication.
        </p>
      ) : null}
    </div>
  );
}
