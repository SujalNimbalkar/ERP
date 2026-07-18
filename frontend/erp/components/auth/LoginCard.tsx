"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loginWithPassword } from "@/app/actions/auth";

/**
 * Email/password login for admin-provisioned Firebase accounts — there is
 * deliberately no sign-up path here; the admin creates each account in the
 * Firebase console and hands out the credentials. The password never goes
 * to Firebase from the browser: the server action does the exchange.
 */
export function LoginCard({ configured }: { configured: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await loginWithPassword(email, password);
    if (result.success) {
      // Only same-site paths — never a full URL — so a crafted ?next=
      // can't bounce a fresh session to another origin.
      const next = searchParams.get("next") ?? "";
      const target = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
      router.replace(target);
      router.refresh();
    } else {
      setBusy(false);
      setError(result.message ?? "Sign-in failed.");
    }
  };

  return (
    <div className="w-full max-w-sm rounded-lg border border-black/10 bg-white px-6 py-8 shadow-sm">
      <h1 className="text-center text-lg font-semibold text-black">Sahyadri ERP</h1>
      <p className="mt-1 text-center text-sm text-black/60">Transport & Logistics</p>

      {configured ? (
        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <div>
            <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-black">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-brand"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-black">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-brand"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
          {error && (
            <p className="rounded-md border-l-4 border-critical bg-critical-tint px-3 py-2 text-sm text-black">
              {error}
            </p>
          )}
          <p className="pt-1 text-center text-xs text-black/50">
            Accounts are created by the administrator — contact them if you
            need access or a password reset.
          </p>
        </form>
      ) : (
        <p className="mt-6 rounded-md border border-black/10 bg-page px-3 py-2 text-sm text-black/70">
          Sign-in isn&apos;t configured on this server yet — set
          FIREBASE_API_KEY and AUTH_SECRET in .env.local.
        </p>
      )}
    </div>
  );
}
