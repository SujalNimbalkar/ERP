"use client";

import { useState } from "react";
import { VehicleMasterForm } from "@/components/forms/VehicleMasterForm";
import { VehicleMaintenanceForm } from "@/components/forms/VehicleMaintenanceForm";

const TABS = [
  { id: "master", label: "Fleet (Vehicle Master)" },
  { id: "maintenance", label: "Maintenance Log" },
] as const;

export function VehicleModule() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["id"]>("master");

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-black">Vehicles</h2>
        <div className="mt-4 flex flex-wrap rounded-lg border border-black/10 bg-white p-1 shadow-sm">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                activeTab === tab.id
                  ? "bg-brand-tint font-semibold text-brand-text"
                  : "font-normal text-black hover:bg-black/5"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "master" ? <VehicleMasterForm /> : <VehicleMaintenanceForm />}
    </div>
  );
}
