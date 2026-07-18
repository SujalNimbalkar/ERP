"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODULES } from "@/lib/sheetConfig";
import { getLastSheetFetch } from "@/lib/sheetFetch";
import { refreshModuleData, staleModuleTypes } from "@/lib/moduleData";
import { LocalDataPanel } from "@/components/layout/LocalDataPanel";
import { LoadingCard } from "@/components/ui/LoadingCard";
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
  // Mobile-only chrome: hamburger drawer with the module list, and the
  // profile dropdown on the right. Both are irrelevant at md+ (sidebar).
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
    setProfileOpen(false);
  }, [pathname]);

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

  // "refreshing" also hides the module now: every sync — first run or not —
  // presents the same single animation card until the fetch completes.
  const blocked =
    sheetLoad === "loading" || sheetLoad === "error" || sheetLoad === "refreshing";

  // Shared by the desktop sidebar nav and the mobile drawer.
  const moduleLinks = MODULES.map((mod) => {
    const active = moduleId === mod.id;
    return (
      <Link
        key={mod.id}
        href={`/${mod.id}`}
        onClick={() => {
          markSyncingIfStale(mod.id);
          setMobileNavOpen(false);
        }}
        className={`mb-0.5 w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
          active
            ? "border-l-[3px] border-brand bg-brand-tint pl-2.5 font-semibold text-brand-text"
            : "font-normal text-black hover:bg-black/5"
        }`}
      >
        {mod.label}
      </Link>
    );
  });

  return (
    <div className="flex min-h-full flex-1 flex-col bg-page text-black md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-black/10 bg-white shadow-sm md:w-56 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 border-b border-black/10 px-3 py-2.5 md:block md:px-4 md:py-5">
          <button
            type="button"
            onClick={() => {
              setMobileNavOpen(true);
              setProfileOpen(false);
            }}
            aria-label="Open menu"
            aria-expanded={mobileNavOpen}
            className="rounded-md p-1.5 text-black transition-colors hover:bg-black/5 md:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="flex-1 text-base font-semibold text-black md:flex-none">
            Sahyadri ERP
          </h1>
          <p className="mt-0.5 hidden text-xs text-black/60 md:block">Transport & Logistics</p>
          {sessionEmail && (
            <div className="relative md:hidden">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen((open) => !open);
                  setMobileNavOpen(false);
                }}
                aria-label="Account"
                aria-expanded={profileOpen}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-tint text-sm font-semibold text-brand-text"
              >
                {sessionEmail[0].toUpperCase()}
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 w-60 rounded-md border border-black/10 bg-white p-3 shadow-lg">
                  <p className="truncate text-xs text-black/60" title={sessionEmail}>
                    {sessionEmail}
                  </p>
                  <button
                    type="button"
                    onClick={() => logout()}
                    className="mt-2 text-xs font-semibold text-brand-text underline"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <nav className="hidden flex-col p-2 md:flex md:flex-1">{moduleLinks}</nav>

        {/* Mobile drawer: slides in from the left over the page instead of
            pushing content down. Stays mounted so the transform animates;
            pointer-events are cut while closed. */}
        <div
          className={`fixed inset-0 z-40 md:hidden ${
            mobileNavOpen ? "" : "pointer-events-none"
          }`}
          aria-hidden={!mobileNavOpen}
        >
          <div
            onClick={() => setMobileNavOpen(false)}
            className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
              mobileNavOpen ? "opacity-100" : "opacity-0"
            }`}
          />
          <div
            className={`absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl transition-transform duration-300 ${
              mobileNavOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
              <h2 className="text-base font-semibold text-black">Sahyadri ERP</h2>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close menu"
                className="rounded-md p-1.5 text-black transition-colors hover:bg-black/5"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <nav className="flex flex-1 flex-col overflow-y-auto p-2">{moduleLinks}</nav>
          </div>
        </div>

        <div className="hidden md:block">
          <LocalDataPanel />
        </div>

        {sessionEmail && (
          <div className="hidden border-t border-black/10 px-4 py-3 md:block">
            <p className="min-w-0 truncate text-xs text-black/60" title={sessionEmail}>
              {sessionEmail}
            </p>
            <button
              type="button"
              onClick={() => logout()}
              className="mt-1 shrink-0 text-xs font-semibold text-brand-text underline"
            >
              Sign out
            </button>
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-y-auto bg-page p-3 sm:p-5 md:p-8">
        {(sheetLoad === "loading" || sheetLoad === "refreshing") && <LoadingCard />}
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
