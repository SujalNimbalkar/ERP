"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODULES } from "@/lib/sheetConfig";
import { getLastSheetFetch } from "@/lib/sheetFetch";
import { refreshModuleData, staleModuleTypes } from "@/lib/moduleData";
import { LocalDataPanel } from "@/components/layout/LocalDataPanel";
import { LoadingAnimation } from "@/components/ui/LoadingAnimation";
import { hasCloudSync, setCloudSyncFlag } from "@/lib/storageMode";
import { migrateLegacyCargoRecords } from "@/lib/localStore";
import { logout } from "@/app/actions/auth";

function formatFetchTime(iso: string | null): string {
  if (!iso) return "an earlier session";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "an earlier session" : date.toLocaleString();
}

/**
 * The app-wide chrome shared by every module route: sidebar navigation,
 * the Google Sheets sync state machine + banners, and the one-time local
 * bootstraps. Lives in the (app) route-group layout, so it keeps its state
 * while module pages mount/unmount underneath it. Each navigation fetches
 * only the target module's sheet types (and only the stale ones) instead of
 * the old every-tab startup sweep.
 */
export function AppChrome({
  cloudSync,
  sessionEmail,
  children,
}: {
  cloudSync: boolean;
  /** Signed-in Google account, or "" while auth isn't configured. */
  sessionEmail: string;
  children: React.ReactNode;
}) {
  // Seeded synchronously (not in an effect) so the very first render — and
  // the useState initializer below — already sees the right value.
  setCloudSyncFlag(cloudSync);
  const pathname = usePathname();
  const moduleId = pathname.split("/")[1] || MODULES[0].id;
  // "refreshing"/"stale-error" cover a reload where a prior successful sync
  // already left data in localStorage: the app renders immediately from
  // that cache with a slim status strip instead of blocking, since a full
  // reload-blocking gate on every visit is unnecessary once data exists.
  // "loading"/"error" are the true-first-run blocking states.
  const [sheetLoad, setSheetLoad] = useState<
    "idle" | "loading" | "refreshing" | "done" | "stale-error" | "error"
  >(() => {
    if (!hasCloudSync()) return "idle";
    return getLastSheetFetch() ? "refreshing" : "loading";
  });
  const [sheetMessage, setSheetMessage] = useState("");
  const [fetchAttempt, setFetchAttempt] = useState(0);

  // Runs once, unconditionally (even without cloud sync configured) — any
  // localStorage rows still under the old per-plant Cargo types get rewritten
  // to the unified "cargo" type + plantType field before anything reads them.
  useEffect(() => {
    migrateLegacyCargoRecords();
  }, []);

  useEffect(() => {
    if (!hasCloudSync()) return;
    let cancelled = false;
    refreshModuleData(moduleId).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setSheetLoad("done");
      } else {
        // Reload-with-cache case: stay unblocked and let the user retry from
        // a banner; true-first-run case: keep the blocking error card.
        setSheetLoad(getLastSheetFetch() ? "stale-error" : "error");
      }
      setSheetMessage(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchAttempt, moduleId]);

  // Sidebar-click companion to the effect above: flips the status strip on
  // before navigating when the target module will actually fetch something.
  // (A user event, not an effect — keeps the strip timely without setting
  // state synchronously inside the effect.)
  const markSyncingIfStale = (targetId: string) => {
    if (!hasCloudSync()) return;
    if (staleModuleTypes(targetId).length === 0) return;
    setSheetLoad((prev) => (prev === "loading" || prev === "error" ? prev : "refreshing"));
  };

  const blocked = sheetLoad === "loading" || sheetLoad === "error";

  return (
    <div className="flex min-h-full flex-1 flex-col bg-page text-black md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-black/10 bg-white shadow-sm md:w-56 md:border-b-0 md:border-r">
        <div className="border-b border-black/10 px-4 py-2.5 md:py-5">
          <h1 className="text-base font-semibold text-black">Sahyadri ERP</h1>
          <p className="mt-0.5 hidden text-xs text-black/60 md:block">Transport & Logistics</p>
        </div>

        <nav className="flex flex-row overflow-x-auto p-1.5 md:flex-1 md:flex-col md:p-2">
          {MODULES.map((mod) => {
            const active = moduleId === mod.id;
            return (
              <Link
                key={mod.id}
                href={`/${mod.id}`}
                onClick={() => markSyncingIfStale(mod.id)}
                className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm transition-colors md:mb-0.5 md:w-full ${
                  active
                    ? "border-l-[3px] border-brand bg-brand-tint pl-2.5 font-semibold text-brand-text md:border-l-[3px]"
                    : "font-normal text-black hover:bg-black/5"
                }`}
              >
                {mod.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:block">
          <LocalDataPanel />
        </div>

        {sessionEmail && (
          <div className="flex items-center justify-between gap-2 border-t border-black/10 px-4 py-2 md:block md:py-3">
            <p className="min-w-0 truncate text-xs text-black/60" title={sessionEmail}>
              {sessionEmail}
            </p>
            <button
              type="button"
              onClick={() => logout()}
              className="shrink-0 text-xs font-semibold text-brand-text underline md:mt-1"
            >
              Sign out
            </button>
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-y-auto bg-page p-3 sm:p-5 md:p-8">
        {sheetLoad === "loading" && (
          <div className="rounded-lg border border-black/10 bg-white px-6 py-10 text-center shadow-sm">
            <LoadingAnimation size={220} />
            <p className="text-base font-semibold text-black">
              Loading data from Google Sheets…
            </p>
            <p className="mt-2 text-sm text-black/60">
              All data comes from the spreadsheet — one moment.
            </p>
          </div>
        )}
        {sheetLoad === "error" && (
          <div className="rounded-lg border-l-4 border-critical bg-white px-6 py-10 text-center shadow-sm">
            <p className="text-base font-semibold text-black">
              Couldn&apos;t load data from Google Sheets
            </p>
            <p className="mt-2 text-sm text-black/60">{sheetMessage}</p>
            <div className="mt-4 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSheetLoad("loading");
                  setFetchAttempt((n) => n + 1);
                }}
                className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => setSheetLoad("done")}
                className="rounded-md border border-black/15 bg-white px-5 py-2.5 text-sm text-black transition-colors hover:bg-black/5"
              >
                Continue with last synced copy
              </button>
            </div>
          </div>
        )}
        {sheetLoad === "refreshing" && (
          <p className="mb-4 rounded-md border-l-4 border-brand bg-brand-tint px-4 py-2 text-sm text-black">
            Syncing with Google Sheets…
          </p>
        )}
        {sheetLoad === "stale-error" && (
          <p className="mb-4 rounded-md border-l-4 border-critical bg-critical-tint px-4 py-2 text-sm text-black">
            Couldn&apos;t refresh from Google Sheets — showing the last synced
            copy from {formatFetchTime(getLastSheetFetch())}.{" "}
            <button
              type="button"
              onClick={() => {
                setSheetLoad("refreshing");
                setFetchAttempt((n) => n + 1);
              }}
              className="font-semibold text-brand-text underline"
            >
              Retry
            </button>
          </p>
        )}
        {!hasCloudSync() && moduleId !== "records" && (
          <p className="mb-4 rounded-md border border-black/10 bg-white px-4 py-2 text-sm text-black shadow-sm">
            Data is saved in this browser only. Open{" "}
            <Link href="/records" className="font-semibold text-brand-text underline">
              Saved Records
            </Link>{" "}
            to view entries in table form, or use Export in the sidebar.
          </p>
        )}
        {!blocked && children}
      </main>
    </div>
  );
}
