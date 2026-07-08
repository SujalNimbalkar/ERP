"use client";

import { useState } from "react";
import { DriverMasterForm } from "@/components/forms/DriverMasterForm";
import { DriverSalaryForm } from "@/components/forms/DriverSalaryForm";

const DRIVER_TABS = [
  { id: "master", label: "Driver Master" },
  { id: "salary", label: "Driver Salary" },
] as const;

export function DriversModule() {
  const [activeTab, setActiveTab] = useState<(typeof DRIVER_TABS)[number]["id"]>("master");

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-black">Drivers</h2>
        <div className="mt-4 flex flex-wrap border border-black">
          {DRIVER_TABS.map((tab) => (
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

      {activeTab === "master" ? <DriverMasterForm /> : <DriverSalaryForm />}
    </div>
  );
}
