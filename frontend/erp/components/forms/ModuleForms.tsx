"use client";

import { useEffect, useState } from "react";
import { SheetForm } from "@/components/forms/SheetForm";
import { INFRA_FIELDS, LEDGER_FIELDS } from "@/lib/sheetConfig";
import { getVehicleNoOptions } from "@/lib/vehicleStore";
import type { FieldConfig } from "@/lib/types";

function injectVehicleNo(fields: FieldConfig[], options: string[]): FieldConfig[] {
  if (options.length === 0) return fields;
  return fields.map((f) =>
    f.name === "vehicleNo" ? { ...f, type: "select" as const, options } : f
  );
}

function useVehicleNoOptions(): string[] {
  const [options, setOptions] = useState(() => getVehicleNoOptions());
  useEffect(() => {
    const sync = () => setOptions(getVehicleNoOptions());
    window.addEventListener("sahyadri-vehicle-update", sync);
    return () => window.removeEventListener("sahyadri-vehicle-update", sync);
  }, []);
  return options;
}

export function InfraCrusherForm() {
  const vehicleNoOptions = useVehicleNoOptions();

  return (
    <SheetForm
      title="Infra & Crusher Transport"
      sheetType="infra"
      fields={injectVehicleNo(INFRA_FIELDS, vehicleNoOptions)}
      headerExtra={
        <p className="mt-1 text-sm text-black">
          Crusher and sand transport entries for the Sahyadri Infra tab.
        </p>
      }
    />
  );
}

export function CustomerLedgerForm() {
  const vehicleNoOptions = useVehicleNoOptions();

  return (
    <SheetForm
      title="Customer Ledger"
      sheetType="ledger"
      fields={injectVehicleNo(LEDGER_FIELDS, vehicleNoOptions)}
      headerExtra={
        <p className="mt-1 text-sm text-black">
          Debit and credit entries for customer accounts.
        </p>
      }
    />
  );
}
