"use client";

import { useState } from "react";
import { DriverSalaryForm } from "@/components/forms/DriverSalaryForm";
import { DriverExpenseForm } from "@/components/forms/DriverExpenseForm";

const PAYROLL_TABS = [
  { id: "salary", label: "Salary" },
  { id: "expense", label: "Daily Expenses" },
] as const;

export function PayrollModule() {
  const [activeTab, setActiveTab] = useState<(typeof PAYROLL_TABS)[number]["id"]>("salary");

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-black">Payroll</h2>
        <p className="mt-1 text-sm text-black">
          Salary and daily wage/expense entries for drivers and staff.
        </p>
        <div className="mt-4 flex flex-wrap border border-black">
          {PAYROLL_TABS.map((tab) => (
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

      {activeTab === "salary" ? <DriverSalaryForm /> : <DriverExpenseForm />}
    </div>
  );
}
