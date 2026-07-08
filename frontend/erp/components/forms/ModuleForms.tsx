"use client";

import { SheetForm } from "@/components/forms/SheetForm";
import { INFRA_FIELDS, LEDGER_FIELDS } from "@/lib/sheetConfig";

export function InfraCrusherForm() {
  return (
    <SheetForm
      title="Infra & Crusher Transport"
      sheetType="infra"
      fields={INFRA_FIELDS}
      headerExtra={
        <p className="mt-1 text-sm text-black">
          Crusher and sand transport entries for the Sahyadri Infra tab.
        </p>
      }
    />
  );
}

export function CustomerLedgerForm() {
  return (
    <SheetForm
      title="Customer Ledger"
      sheetType="ledger"
      fields={LEDGER_FIELDS}
      headerExtra={
        <p className="mt-1 text-sm text-black">
          Debit and credit entries for customer accounts.
        </p>
      }
    />
  );
}
