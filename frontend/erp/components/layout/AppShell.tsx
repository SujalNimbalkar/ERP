"use client";

import { useEffect, useState } from "react";
import { MODULES } from "@/lib/sheetConfig";
import { refreshFromSheets } from "@/lib/sheetFetch";
import { CargoTransportForm } from "@/components/forms/CargoTransportForm";
import { DriverMasterForm } from "@/components/forms/DriverMasterForm";
import { StaffMasterModule } from "@/components/forms/StaffMasterModule";
import { PayrollModule } from "@/components/forms/PayrollModule";
import {
  InfraCrusherForm,
  CustomerLedgerForm,
} from "@/components/forms/ModuleForms";
import { DieselTankForm } from "@/components/forms/DieselTankForm";
import { MaterialMasterModule } from "@/components/forms/MaterialMasterModule";
import { PlantsVendorsModule } from "@/components/forms/PlantsVendorsModule";
import { VehicleModule } from "@/components/forms/VehicleModule";
import { BillingModule } from "@/components/billing/BillingModule";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { RecordsView } from "@/components/views/RecordsView";
import { LocalDataPanel } from "@/components/layout/LocalDataPanel";
import { hasCloudSync } from "@/lib/storageMode";
import { migrateLegacyCargoRecords } from "@/lib/localStore";

const FORM_MAP: Record<string, React.ReactNode> = {
  cargo: <CargoTransportForm />,
  billing: <BillingModule />,
  dashboard: <DashboardView />,
  infra: <InfraCrusherForm />,
  diesel: <DieselTankForm />,
  drivers: <DriverMasterForm />,
  staff: <StaffMasterModule />,
  payroll: <PayrollModule />,
  ledger: <CustomerLedgerForm />,
  materials: <MaterialMasterModule />,
  parties: <PlantsVendorsModule />,
  vehicles: <VehicleModule />,
  records: <RecordsView />,
};

export function AppShell() {
  const [activeModule, setActiveModule] = useState(MODULES[0].id);
  const [sheetLoad, setSheetLoad] = useState<"idle" | "loading" | "done" | "error">(
    hasCloudSync() ? "loading" : "idle"
  );
  const [sheetMessage, setSheetMessage] = useState("");
  const [fetchAttempt, setFetchAttempt] = useState(0);

  // Runs once, unconditionally (even without cloud sync configured) — any
  // localStorage rows still under the old per-plant Cargo types get rewritten
  // to the unified "cargo" type + plantType field before anything reads them.
  useEffect(() => {
    migrateLegacyCargoRecords();
  }, []);

  // Google Sheets is the only data source — the app blocks until the fetch
  // finishes so nothing stale from a previous session is ever shown.
  useEffect(() => {
    if (!hasCloudSync()) return;
    let cancelled = false;
    refreshFromSheets().then((result) => {
      if (cancelled) return;
      setSheetLoad(result.success ? "done" : "error");
      setSheetMessage(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchAttempt]);

  const blocked = sheetLoad === "loading" || sheetLoad === "error";

  return (
    <div className="flex min-h-full flex-1 flex-col bg-white text-black md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-black bg-white md:w-56 md:border-b-0 md:border-r">
        <div className="border-b border-black px-4 py-2.5 md:py-5">
          <h1 className="text-base font-semibold text-black">Sahyadri ERP</h1>
          <p className="mt-0.5 hidden text-xs text-black md:block">Transport & Logistics</p>
        </div>

        <nav className="flex flex-row overflow-x-auto p-1.5 md:flex-1 md:flex-col md:p-2">
          {MODULES.map((mod) => (
            <button
              key={mod.id}
              type="button"
              onClick={() => setActiveModule(mod.id)}
              className={`shrink-0 whitespace-nowrap px-3 py-2 text-left text-sm text-black md:mb-0.5 md:w-full ${
                activeModule === mod.id ? "font-semibold underline" : "font-normal"
              }`}
            >
              {mod.label}
            </button>
          ))}
        </nav>

        <div className="hidden md:block">
          <LocalDataPanel />
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-white p-3 sm:p-5 md:p-8">
        {sheetLoad === "loading" && (
          <div className="border border-black px-6 py-10 text-center">
            <p className="text-base font-semibold text-black">
              Loading data from Google Sheets…
            </p>
            <p className="mt-2 text-sm text-black">
              All data comes from the spreadsheet — one moment.
            </p>
          </div>
        )}
        {sheetLoad === "error" && (
          <div className="border border-black px-6 py-10 text-center">
            <p className="text-base font-semibold text-black">
              Couldn&apos;t load data from Google Sheets
            </p>
            <p className="mt-2 text-sm text-black">{sheetMessage}</p>
            <div className="mt-4 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSheetLoad("loading");
                  setFetchAttempt((n) => n + 1);
                }}
                className="border border-black bg-white px-5 py-2.5 text-sm font-semibold text-black"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => setSheetLoad("done")}
                className="border border-black bg-white px-5 py-2.5 text-sm text-black"
              >
                Continue with last synced copy
              </button>
            </div>
          </div>
        )}
        {sheetLoad === "done" && sheetMessage && (
          <p className="mb-4 border border-black px-4 py-2 text-sm text-black">
            {sheetMessage}{" "}
            <button
              type="button"
              onClick={() => setSheetMessage("")}
              className="font-semibold underline"
            >
              Dismiss
            </button>
          </p>
        )}
        {!hasCloudSync() && activeModule !== "records" && (
          <p className="mb-4 border border-black px-4 py-2 text-sm text-black">
            Data is saved in this browser only. Open{" "}
            <button
              type="button"
              onClick={() => setActiveModule("records")}
              className="font-semibold underline"
            >
              Saved Records
            </button>{" "}
            to view entries in table form, or use Export in the sidebar.
          </p>
        )}
        {!blocked && FORM_MAP[activeModule]}
      </main>
    </div>
  );
}
