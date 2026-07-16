"use client";

import { useState } from "react";
import { CargoBillingModule } from "@/components/billing/CargoBillingModule";
import { InfraBillingModule } from "@/components/billing/InfraBillingModule";

const TABS = [
  { id: "cargo", label: "Cargo Transport" },
  { id: "infra", label: "Infra & Crusher" },
] as const;

type BillingTab = (typeof TABS)[number]["id"];

/** Billing module entry point — a thin tab switcher between the two bill
 * generators. Each sub-module owns its own form state, saved-bills list,
 * and storage, so switching tabs never loses in-progress work on the other. */
export function BillingModule() {
  const [activeTab, setActiveTab] = useState<BillingTab>("cargo");

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-black/10 print:hidden">
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px rounded-t-md border border-b-0 px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-black/10 bg-white text-brand-text"
                  : "border-transparent text-black hover:bg-black/5"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "cargo" ? <CargoBillingModule /> : <InfraBillingModule />}
    </div>
  );
}
