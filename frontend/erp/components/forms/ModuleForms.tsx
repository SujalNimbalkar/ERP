"use client";

import { useEffect, useState } from "react";
import { SheetForm } from "@/components/forms/SheetForm";
import { LEDGER_FIELDS, injectOptions } from "@/lib/sheetConfig";
import { getVehicleNoOptions } from "@/lib/vehicleStore";
import type { FieldConfig } from "@/lib/types";

function injectVehicleNo(fields: FieldConfig[], options: string[]): FieldConfig[] {
  return injectOptions(fields, "vehicleNo", options);
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
