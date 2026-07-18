"use client";

import dynamic from "next/dynamic";

// Same job ClientShell did for the old AppShell: AppChrome's state
// initializers read localStorage (last-fetch timestamp), so it must never
// render on the server — ssr:false keeps the first client render and the
// server output trivially consistent.
const AppChrome = dynamic(
  () => import("@/components/layout/AppChrome").then((m) => ({ default: m.AppChrome })),
  { ssr: false }
);

export function ChromeBoundary({
  cloudSync,
  sessionEmail,
  children,
}: {
  cloudSync: boolean;
  sessionEmail: string;
  children: React.ReactNode;
}) {
  return (
    <AppChrome cloudSync={cloudSync} sessionEmail={sessionEmail}>
      {children}
    </AppChrome>
  );
}
