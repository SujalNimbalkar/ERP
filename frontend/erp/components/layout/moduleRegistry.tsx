"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

/**
 * One lazy, client-only chunk per module. Every module component reads
 * localStorage in its mount path, so ssr:false is required — and it must
 * live in a "use client" file, hence this registry instead of dynamic()
 * calls inside the (server) route pages. Each dynamic() entry code-splits
 * into its own chunk, so visiting a route loads only that module's code.
 */

const loading = () => (
  <p className="rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black/60 shadow-sm">
    Loading module…
  </p>
);

const MODULE_COMPONENTS: Record<string, ComponentType> = {
  dashboard: dynamic(
    () => import("@/components/dashboard/DashboardView").then((m) => ({ default: m.DashboardView })),
    { ssr: false, loading }
  ),
  cargo: dynamic(
    () => import("@/components/forms/CargoTransportForm").then((m) => ({ default: m.CargoTransportForm })),
    { ssr: false, loading }
  ),
  infra: dynamic(
    () => import("@/components/forms/InfraCrusherForm").then((m) => ({ default: m.InfraCrusherForm })),
    { ssr: false, loading }
  ),
  diesel: dynamic(
    () => import("@/components/forms/DieselTankForm").then((m) => ({ default: m.DieselTankForm })),
    { ssr: false, loading }
  ),
  payroll: dynamic(
    () => import("@/components/forms/PayrollModule").then((m) => ({ default: m.PayrollModule })),
    { ssr: false, loading }
  ),
  billing: dynamic(
    () => import("@/components/billing/BillingModule").then((m) => ({ default: m.BillingModule })),
    { ssr: false, loading }
  ),
  drivers: dynamic(
    () => import("@/components/forms/DriverMasterForm").then((m) => ({ default: m.DriverMasterForm })),
    { ssr: false, loading }
  ),
  staff: dynamic(
    () => import("@/components/forms/StaffMasterModule").then((m) => ({ default: m.StaffMasterModule })),
    { ssr: false, loading }
  ),
  ledger: dynamic(
    () => import("@/components/forms/ModuleForms").then((m) => ({ default: m.CustomerLedgerForm })),
    { ssr: false, loading }
  ),
  materials: dynamic(
    () => import("@/components/forms/MaterialMasterModule").then((m) => ({ default: m.MaterialMasterModule })),
    { ssr: false, loading }
  ),
  parties: dynamic(
    () => import("@/components/forms/PlantsVendorsModule").then((m) => ({ default: m.PlantsVendorsModule })),
    { ssr: false, loading }
  ),
  vehicles: dynamic(
    () => import("@/components/forms/VehicleModule").then((m) => ({ default: m.VehicleModule })),
    { ssr: false, loading }
  ),
  records: dynamic(
    () => import("@/components/views/RecordsView").then((m) => ({ default: m.RecordsView })),
    { ssr: false, loading }
  ),
};

export function ModuleClient({ id }: { id: string }) {
  const Component = MODULE_COMPONENTS[id];
  return Component ? <Component /> : null;
}
