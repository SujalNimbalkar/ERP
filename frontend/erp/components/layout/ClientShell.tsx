"use client";

import dynamic from "next/dynamic";

const AppShell = dynamic(
  () => import("@/components/layout/AppShell").then((m) => ({ default: m.AppShell })),
  { ssr: false }
);

export function ClientShell() {
  return <AppShell />;
}
