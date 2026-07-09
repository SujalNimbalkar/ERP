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
        <div className="mt-4 flex flex-wrap border border-black">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-sm text-black ${
                activeTab === tab.id ? "font-semibold underline" : "font-normal"
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
