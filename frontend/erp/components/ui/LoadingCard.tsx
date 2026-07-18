"use client";

import { LoadingAnimation } from "./LoadingAnimation";

/**
 * The one loading screen used everywhere — first-run data load, later
 * Google Sheets syncs, and lazy module-code loading all render this same
 * card, so back-to-back loading states look like a single continuous
 * screen instead of two different ones swapping.
 */
export function LoadingCard({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white px-6 py-10 text-center shadow-sm">
      <LoadingAnimation size={220} />
      <p className="text-base font-semibold text-black">{message}</p>
    </div>
  );
}
