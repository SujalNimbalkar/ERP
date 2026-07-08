"use client";

import { useState } from "react";
import { MODULES } from "@/lib/sheetConfig";
import { CargoTransportForm } from "@/components/forms/CargoTransportForm";
import { DriversModule } from "@/components/forms/DriversModule";
import {
  InfraCrusherForm,
  CustomerLedgerForm,
} from "@/components/forms/ModuleForms";
import { DieselTankForm } from "@/components/forms/DieselTankForm";
import { MaterialMasterModule } from "@/components/forms/MaterialMasterModule";
import { RecordsView } from "@/components/views/RecordsView";
import { LocalDataPanel } from "@/components/layout/LocalDataPanel";
import { isLocalStorageMode } from "@/lib/storageMode";

const FORM_MAP: Record<string, React.ReactNode> = {
  cargo: <CargoTransportForm />,
  infra: <InfraCrusherForm />,
  diesel: <DieselTankForm />,
  drivers: <DriversModule />,
  ledger: <CustomerLedgerForm />,
  materials: <MaterialMasterModule />,
  records: <RecordsView />,
};

export function AppShell() {
  const [activeModule, setActiveModule] = useState(MODULES[0].id);

  return (
    <div className="flex min-h-full flex-1 bg-white text-black">
      <aside className="flex w-56 shrink-0 flex-col border-r border-black bg-white">
        <div className="border-b border-black px-4 py-5">
          <h1 className="text-base font-semibold text-black">Sahyadri ERP</h1>
          <p className="mt-0.5 text-xs text-black">Transport & Logistics</p>
        </div>

        <nav className="flex-1 p-2">
          {MODULES.map((mod) => (
            <button
              key={mod.id}
              type="button"
              onClick={() => setActiveModule(mod.id)}
              className={`mb-0.5 w-full px-3 py-2 text-left text-sm text-black ${
                activeModule === mod.id ? "font-semibold underline" : "font-normal"
              }`}
            >
              {mod.label}
            </button>
          ))}
        </nav>

        <LocalDataPanel />
      </aside>

      <main className="flex-1 overflow-y-auto bg-white p-6 md:p-8">
        {isLocalStorageMode() && activeModule !== "records" && (
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
        {FORM_MAP[activeModule]}
      </main>
    </div>
  );
}
