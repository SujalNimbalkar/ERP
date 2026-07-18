import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginCard } from "@/components/auth/LoginCard";
import { authConfigured } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Sign in – Sahyadri ERP" };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-4">
      <Suspense>
        <LoginCard configured={authConfigured()} />
      </Suspense>
    </div>
  );
}
