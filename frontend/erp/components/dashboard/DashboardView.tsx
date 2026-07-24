"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collectInfraTrips,
  collectTrips,
  driverSummary,
  monthlyPL,
  monthRange,
  plTotals,
  staffPayrollSummary,
  vehicleFuelEfficiency,
  vehicleSummary,
  type DashboardFilters,
} from "@/lib/dashboard";
import { formatMoney, formatMonthLabel, formatQty } from "@/lib/billing";
import { COMPANIES, companyName } from "@/lib/companies";
import { getAllCargoSources, type CargoSourceType } from "@/lib/sheetConfig";
import { downloadCsv } from "@/lib/recordColumns";
import { getAllVehicles } from "@/lib/vehicleStore";
import { VehiclePerformanceSection } from "@/components/dashboard/VehiclePerformanceSection";
import type { VehicleMetrics } from "@/lib/vehiclePerformance";

/** Local YYYY-MM-DD (no UTC shift from toISOString). */
function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateOffset(monthsFromNow: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsFromNow);
  return formatDate(d);
}

const selectClass =
  "w-full border border-black bg-white px-2.5 py-1.5 text-sm text-black outline-none";

const cell = "border border-black/40 px-2 py-1 text-xs";
const cellRight = `${cell} text-right whitespace-nowrap`;
const headCell = "border border-black px-2 py-1 text-xs font-semibold text-left";

/**
 * Fixed hue assignment (validated categorical palette, see the dataviz
 * skill) — every color here means the same thing everywhere it appears
 * (KPI tile accent, table header dot, bar fill), reading straight off the
 * shared design tokens in globals.css so Dashboard and the forms never
 * drift apart. Revenue is the brand anchor (the real company orange,
 * sampled from the logo); the five cost categories each get their own hue
 * so a reader can match a bar or header dot to its meaning at a glance
 * without re-reading the label. Profit/Loss uses the reserved status pair
 * (green/red), never the categorical green/red, so it never impersonates
 * a cost category.
 */
const COLOR = {
  revenue: "var(--color-brand)",
  diesel: "var(--color-diesel)",
  toll: "#1baf7a",
  maintenance: "var(--color-maintenance)",
  salary: "#4a3aa7",
  driverExpense: "#e87ba4",
  good: "var(--color-good)",
  critical: "var(--color-critical)",
} as const;

/** Small identity dot for a table header — pairs a column with its color
 * everywhere else that color appears (bar fill, KPI accent). */
function ColorDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
      style={{ backgroundColor: color }}
    />
  );
}

/** Inline bar — width as % of the section's max value. 4px rounded data-end
 * (grows from the left baseline), square at the baseline, per mark spec. */
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  if (max <= 0 || value === 0) return null;
  const width = Math.min(100, Math.round((Math.abs(value) / max) * 100));
  return (
    <span
      aria-hidden
      className="ml-2 inline-block h-2 rounded-r-full align-middle"
      style={{ width: `${Math.max(width, 3)}%`, maxWidth: "60px", backgroundColor: color }}
    />
  );
}

function money(n: number): string {
  return formatMoney(n);
}

function exportRows(filename: string, header: string[], rows: (string | number)[][]) {
  const csv = [header, ...rows]
    .map((row) =>
      row
        .map((v) => {
          const s = String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\n");
  downloadCsv(filename, csv);
}

export function DashboardView() {
  const [fromDate, setFromDate] = useState(() => dateOffset(-1));
  const [toDate, setToDate] = useState(() => dateOffset(0));
  const [companyId, setCompanyId] = useState("");
  const [plantType, setPlantType] = useState<CargoSourceType | "">("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [driverId, setDriverId] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener("sahyadri-local-update", bump);
    window.addEventListener("sahyadri-vehicle-update", bump);
    window.addEventListener("sahyadri-location-update", bump);
    window.addEventListener("sahyadri-staff-update", bump);
    return () => {
      window.removeEventListener("sahyadri-local-update", bump);
      window.removeEventListener("sahyadri-vehicle-update", bump);
      window.removeEventListener("sahyadri-location-update", bump);
      window.removeEventListener("sahyadri-staff-update", bump);
    };
  }, []);

  const cargoSources = useMemo(() => getAllCargoSources(), [version]);

  const filters: DashboardFilters = useMemo(
    () => ({ fromDate, toDate, companyId, vehicleNo, driverId, plantType }),
    [fromDate, toDate, companyId, vehicleNo, driverId, plantType]
  );

  // version bump re-reads localStorage when any record changes
  /* eslint-disable react-hooks/exhaustive-deps */
  const totals = useMemo(() => plTotals(filters), [filters, version]);
  const vehicles = useMemo(() => vehicleSummary(filters), [filters, version]);
  const drivers = useMemo(() => driverSummary(filters), [filters, version]);
  const staffPayroll = useMemo(() => staffPayrollSummary(filters), [filters, version]);
  const months = useMemo(() => monthlyPL(filters), [filters, version]);
  const fuelEfficiency = useMemo(() => vehicleFuelEfficiency(filters), [filters, version]);
  const vehiclesMaster = useMemo(() => getAllVehicles(), [version]);
  const allTrips = useMemo(() => {
    const unscoped = { ...filters, vehicleNo: "", driverId: "" };
    return [...collectTrips(unscoped), ...collectInfraTrips(unscoped)];
  }, [fromDate, toDate, companyId, plantType, version]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const monthCount = useMemo(
    () => Math.max(1, monthRange(fromDate.slice(0, 7), toDate.slice(0, 7)).length),
    [fromDate, toDate]
  );

  const capacityByVehicle = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of vehiclesMaster) {
      const capacity = Number(v.loadCapacityKg);
      if (v.registrationNo && capacity > 0) map.set(v.registrationNo, capacity);
    }
    return map;
  }, [vehiclesMaster]);

  const vehiclePerformanceMetrics: VehicleMetrics[] = useMemo(
    () =>
      vehicles
        .filter((v) => v.trips > 0)
        .map((v) => {
          const capacity = capacityByVehicle.get(v.vehicleNo);
          const fuel = fuelEfficiency.find((f) => f.vehicleNo === v.vehicleNo);
          return {
            vehicleNo: v.vehicleNo,
            profitMarginPercent: v.earnings > 0 ? (v.profit / v.earnings) * 100 : null,
            capacityUtilizationPercent: capacity ? ((v.totalWt / v.trips) / capacity) * 100 : null,
            fuelEfficiencyKmPerLiter: fuel ? fuel.kmPerLiter : null,
            tripsPerMonth: v.trips / monthCount,
          };
        }),
    [vehicles, capacityByVehicle, fuelEfficiency, monthCount]
  );

  const vehicleOptions = useMemo(
    () => Array.from(new Set(allTrips.map((t) => t.vehicleNo).filter(Boolean))).sort(),
    [allTrips]
  );
  const driverOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of allTrips) {
      if (t.driverId) map.set(t.driverId, t.driverName || t.driverId);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [allTrips]);

  const scoped = !!(companyId || plantType || driverId);
  const maxMonthRevenue = Math.max(0, ...months.map((m) => m.revenue));

  const profitColor = totals.profit < 0 ? COLOR.critical : COLOR.good;
  const kpis: {
    label: string;
    value: string;
    accent: string | null;
    strong?: boolean;
    valueColor?: string;
  }[] = [
    { label: "Revenue", value: `Rs ${money(totals.revenue)}`, accent: COLOR.revenue },
    { label: "Expenses", value: `Rs ${money(totals.expenses)}`, accent: null },
    {
      label: totals.profit < 0 ? "Loss" : "Profit",
      value: `${totals.profit < 0 ? "−" : ""}Rs ${money(Math.abs(totals.profit))}`,
      strong: true,
      accent: profitColor,
      valueColor: profitColor,
    },
    { label: "Trips", value: formatQty(totals.trips), accent: null },
    { label: "Weight (kg)", value: formatQty(totals.totalWt), accent: null },
  ];

  return (
    <div className="max-w-6xl">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-black">Dashboard</h2>
        {/* <p className="mt-1 text-sm text-black">
          Vehicle earnings vs costs, trips, driver costs and monthly transportation
          profit / loss — computed from all saved records.
        </p> */}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 border border-black p-3 sm:grid-cols-3 lg:grid-cols-6">
        <label className="flex flex-col gap-0.5 text-xs font-medium text-black">
          From Date
          <input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={(e) => setFromDate(e.target.value)}
            className={selectClass}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs font-medium text-black">
          To Date
          <input
            type="date"
            value={toDate}
            min={fromDate}
            onChange={(e) => setToDate(e.target.value)}
            className={selectClass}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs font-medium text-black">
          Company
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={selectClass}>
            <option value="">All companies</option>
            {COMPANIES.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-xs font-medium text-black">
          Plant / Source
          <select
            value={plantType}
            onChange={(e) => setPlantType(e.target.value as CargoSourceType | "")}
            className={selectClass}
          >
            <option value="">All plants</option>
            {cargoSources.map((s) => (
              <option key={s.type} value={s.type}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-xs font-medium text-black">
          Vehicle
          <select value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} className={selectClass}>
            <option value="">All vehicles</option>
            {vehicleOptions.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-xs font-medium text-black">
          Driver
          <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className={selectClass}>
            <option value="">All drivers</option>
            {driverOptions.map(([id, name]) => (
              <option key={id} value={id}>{id} - {name}</option>
            ))}
          </select>
        </label>
      </div>

      {scoped && (
        <p className="mb-4 border border-black px-3 py-1.5 text-xs text-black">
          Company / plant / driver filters show trip revenue and toll only — shared costs
          (diesel fills, maintenance, salaries) cannot be split by these filters.
        </p>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="border border-black bg-white px-3 py-2.5"
            style={
              kpi.accent
                ? { borderTop: `3px solid ${kpi.accent}`, backgroundColor: `${kpi.accent}0d` }
                : undefined
            }
          >
            <p className="text-xs font-medium uppercase tracking-wide text-black/60">
              {kpi.label}
            </p>
            <p
              className={`mt-0.5 text-lg sm:text-xl ${kpi.strong ? "font-bold" : "font-semibold"}`}
              style={kpi.valueColor ? { color: kpi.valueColor } : { color: "#0b0b0b" }}
            >
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      <section className="mb-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3
            className="border-l-[3px] pl-2 text-base font-semibold text-black"
            style={{ borderColor: COLOR.revenue }}
          >
            Vehicles — earnings vs expenses
          </h3>
          <button
            type="button"
            onClick={() =>
              exportRows(
                `dashboard-vehicles-${fromDate}-${toDate}.csv`,
                ["Vehicle", "Trips", "Weight (kg)", "Earnings", "Diesel", "Maintenance", "Toll", "Profit"],
                vehicles.map((v) => [v.vehicleNo, v.trips, v.totalWt, v.earnings, v.dieselCost, v.maintenanceCost, v.toll, v.profit])
              )
            }
            className="text-xs text-black underline"
          >
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto border border-black">
          <table className="w-full border-collapse text-black">
            <thead>
              <tr>
                <th className={headCell}>Vehicle</th>
                <th className={headCell}>Trips</th>
                <th className={headCell}>Weight (kg)</th>
                <th className={headCell}><ColorDot color={COLOR.revenue} />Earnings</th>
                <th className={headCell}><ColorDot color={COLOR.diesel} />Diesel</th>
                <th className={headCell}><ColorDot color={COLOR.maintenance} />Maintenance</th>
                <th className={headCell}><ColorDot color={COLOR.toll} />Toll</th>
                <th className={headCell}>Profit</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.length === 0 ? (
                <tr><td className={cell} colSpan={8}>No trips in this range.</td></tr>
              ) : (
                vehicles.map((v) => (
                  <tr key={v.vehicleNo}>
                    <td className={`${cell} font-medium whitespace-nowrap`}>{v.vehicleNo}</td>
                    <td className={cellRight}>{v.trips}</td>
                    <td className={cellRight}>{formatQty(v.totalWt)}</td>
                    <td className={cellRight}>{money(v.earnings)}</td>
                    <td className={cellRight}>{money(v.dieselCost)}</td>
                    <td className={cellRight}>{money(v.maintenanceCost)}</td>
                    <td className={cellRight}>{money(v.toll)}</td>
                    <td
                      className={`${cellRight} font-semibold`}
                      style={{ color: v.profit < 0 ? COLOR.critical : COLOR.good }}
                    >
                      {v.profit < 0 ? `−${money(Math.abs(v.profit))}` : money(v.profit)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-6">
        <h3
          className="mb-2 border-l-[3px] pl-2 text-base font-semibold text-black"
          style={{ borderColor: COLOR.diesel }}
        >
          Vehicle Efficiency
        </h3>
        <VehiclePerformanceSection metrics={vehiclePerformanceMetrics} />
      </section>

      <section className="mb-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3
            className="border-l-[3px] pl-2 text-base font-semibold text-black"
            style={{ borderColor: COLOR.salary }}
          >
            Drivers — trips & costs
          </h3>
          <button
            type="button"
            onClick={() =>
              exportRows(
                `dashboard-drivers-${fromDate}-${toDate}.csv`,
                ["Driver ID", "Driver", "Trips", "Weight (kg)", "Earnings Hauled", "Salary Paid", "Daily Expenses", "Total Cost"],
                drivers.map((d) => [d.driverId, d.driverName, d.trips, d.totalWt, d.earningsHauled, d.salaryPaid, d.dailyExpenses, d.totalCost])
              )
            }
            className="text-xs text-black underline"
          >
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto border border-black">
          <table className="w-full border-collapse text-black">
            <thead>
              <tr>
                <th className={headCell}>Driver</th>
                <th className={headCell}>Trips</th>
                <th className={headCell}>Weight (kg)</th>
                <th className={headCell}><ColorDot color={COLOR.revenue} />Earnings Hauled</th>
                <th className={headCell}><ColorDot color={COLOR.salary} />Salary Paid</th>
                <th className={headCell}><ColorDot color={COLOR.driverExpense} />Daily Expenses</th>
                <th className={headCell}>Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {drivers.length === 0 ? (
                <tr><td className={cell} colSpan={7}>No driver activity in this range.</td></tr>
              ) : (
                drivers.map((d) => (
                  <tr key={d.driverId || "unassigned"}>
                    <td className={`${cell} whitespace-nowrap`}>
                      <span className="font-medium">{d.driverName}</span>
                      {d.driverId && <span className="text-black/60"> · {d.driverId}</span>}
                    </td>
                    <td className={cellRight}>{d.trips}</td>
                    <td className={cellRight}>{formatQty(d.totalWt)}</td>
                    <td className={cellRight}>{money(d.earningsHauled)}</td>
                    <td className={cellRight}>{money(d.salaryPaid)}</td>
                    <td className={cellRight}>
                      {money(d.dailyExpenses)}
                      {Object.keys(d.expensesByType).length > 0 && (
                        <span className="block text-[10px] text-black/60">
                          {Object.entries(d.expensesByType)
                            .map(([t, amt]) => `${t} ${money(amt)}`)
                            .join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className={`${cellRight} font-semibold`}>{money(d.totalCost)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3
            className="border-l-[3px] pl-2 text-base font-semibold text-black"
            style={{ borderColor: COLOR.salary }}
          >
            Staff Payroll — accountants, hamals & other staff
          </h3>
          <button
            type="button"
            onClick={() =>
              exportRows(
                `dashboard-staff-payroll-${fromDate}-${toDate}.csv`,
                ["Staff ID", "Name", "Role", "Salary Paid", "Daily Expenses", "Total Cost"],
                staffPayroll.map((s) => [s.staffId, s.name, s.role, s.salaryPaid, s.dailyExpenses, s.totalCost])
              )
            }
            className="text-xs text-black underline"
          >
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto border border-black">
          <table className="w-full border-collapse text-black">
            <thead>
              <tr>
                <th className={headCell}>Name</th>
                <th className={headCell}>Role</th>
                <th className={headCell}><ColorDot color={COLOR.salary} />Salary Paid</th>
                <th className={headCell}><ColorDot color={COLOR.driverExpense} />Daily Expenses</th>
                <th className={headCell}>Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {staffPayroll.length === 0 ? (
                <tr><td className={cell} colSpan={5}>No staff payroll activity in this range.</td></tr>
              ) : (
                staffPayroll.map((s) => (
                  <tr key={s.staffId}>
                    <td className={`${cell} whitespace-nowrap`}>
                      <span className="font-medium">{s.name}</span>
                      <span className="text-black/60"> · {s.staffId}</span>
                    </td>
                    <td className={cell}>{s.role}</td>
                    <td className={cellRight}>{money(s.salaryPaid)}</td>
                    <td className={cellRight}>
                      {money(s.dailyExpenses)}
                      {Object.keys(s.expensesByType).length > 0 && (
                        <span className="block text-[10px] text-black/60">
                          {Object.entries(s.expensesByType)
                            .map(([t, amt]) => `${t} ${money(amt)}`)
                            .join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className={`${cellRight} font-semibold`}>{money(s.totalCost)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3
            className="border-l-[3px] pl-2 text-base font-semibold text-black"
            style={{ borderColor: COLOR.revenue }}
          >
            Monthly profit / loss
          </h3>
          <button
            type="button"
            onClick={() =>
              exportRows(
                `dashboard-monthly-pl-${fromDate}-${toDate}.csv`,
                ["Month", "Revenue", "Diesel", "Toll", "Maintenance", "Salary", "Driver Expenses", "Profit"],
                months.map((m) => [m.month, m.revenue, m.diesel, m.toll, m.maintenance, m.salary, m.driverExpenses, m.profit])
              )
            }
            className="text-xs text-black underline"
          >
            Export CSV
          </button>
        </div>
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-black/70">
          <span><ColorDot color={COLOR.revenue} />Revenue</span>
          <span><ColorDot color={COLOR.diesel} />Diesel</span>
          <span><ColorDot color={COLOR.toll} />Toll</span>
          <span><ColorDot color={COLOR.maintenance} />Maintenance</span>
          <span><ColorDot color={COLOR.salary} />Salary</span>
          <span><ColorDot color={COLOR.driverExpense} />Driver Expenses</span>
          <span><ColorDot color={COLOR.good} />Profit <span className="text-black/40">/</span> <ColorDot color={COLOR.critical} />Loss</span>
        </div>
        <div className="overflow-x-auto border border-black">
          <table className="w-full border-collapse text-black">
            <thead>
              <tr>
                <th className={headCell}>Month</th>
                <th className={headCell}><ColorDot color={COLOR.revenue} />Revenue</th>
                <th className={headCell}><ColorDot color={COLOR.diesel} />Diesel</th>
                <th className={headCell}><ColorDot color={COLOR.toll} />Toll</th>
                <th className={headCell}><ColorDot color={COLOR.maintenance} />Maintenance</th>
                <th className={headCell}><ColorDot color={COLOR.salary} />Salary</th>
                <th className={headCell}><ColorDot color={COLOR.driverExpense} />Driver Exp.</th>
                <th className={headCell}>Profit</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month}>
                  <td className={`${cell} whitespace-nowrap font-medium`}>
                    {formatMonthLabel(m.month)}
                    {Object.keys(m.revenueByCompany).length > 1 && (
                      <span className="block text-[10px] text-black/60">
                        {Object.entries(m.revenueByCompany)
                          .map(([c, amt]) => `${companyName(c)} ${money(amt)}`)
                          .join(" · ")}
                      </span>
                    )}
                  </td>
                  <td className={cellRight}>
                    {money(m.revenue)}
                    <Bar value={m.revenue} max={maxMonthRevenue} color={COLOR.revenue} />
                  </td>
                  <td className={cellRight}>{money(m.diesel)}</td>
                  <td className={cellRight}>{money(m.toll)}</td>
                  <td className={cellRight}>{money(m.maintenance)}</td>
                  <td className={cellRight}>{money(m.salary)}</td>
                  <td className={cellRight}>{money(m.driverExpenses)}</td>
                  <td
                    className={`${cellRight} font-semibold`}
                    style={{ color: m.profit < 0 ? COLOR.critical : COLOR.good }}
                  >
                    {m.profit < 0 ? `−${money(Math.abs(m.profit))}` : money(m.profit)}
                    <Bar
                      value={m.profit}
                      max={maxMonthRevenue}
                      color={m.profit < 0 ? COLOR.critical : COLOR.good}
                    />
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className={cell}>Total</td>
                <td className={cellRight}>{money(totals.revenue)}</td>
                <td className={cellRight}>{money(totals.diesel)}</td>
                <td className={cellRight}>{money(totals.toll)}</td>
                <td className={cellRight}>{money(totals.maintenance)}</td>
                <td className={cellRight}>{money(totals.salary)}</td>
                <td className={cellRight}>{money(totals.driverExpenses)}</td>
                <td
                  className={cellRight}
                  style={{ color: totals.profit < 0 ? COLOR.critical : COLOR.good }}
                >
                  {totals.profit < 0
                    ? `−${money(Math.abs(totals.profit))}`
                    : money(totals.profit)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
