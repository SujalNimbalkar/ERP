"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collectTrips,
  driverSummary,
  monthlyPL,
  plTotals,
  staffPayrollSummary,
  vehicleSummary,
  type DashboardFilters,
} from "@/lib/dashboard";
import { formatMoney, formatMonthLabel, formatQty } from "@/lib/billing";
import { COMPANIES, companyName } from "@/lib/companies";
import { getAllCargoSources, type CargoSourceType } from "@/lib/sheetConfig";
import { downloadCsv } from "@/lib/recordColumns";

function monthOffset(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const selectClass =
  "w-full border border-black bg-white px-2.5 py-1.5 text-sm text-black outline-none";

const cell = "border border-black/40 px-2 py-1 text-xs";
const cellRight = `${cell} text-right whitespace-nowrap`;
const headCell = "border border-black px-2 py-1 text-xs font-semibold text-left";

/** Monochrome inline bar — width as % of the section's max value. */
function Bar({ value, max, negative }: { value: number; max: number; negative?: boolean }) {
  if (max <= 0) return null;
  const width = Math.min(100, Math.round((Math.abs(value) / max) * 100));
  return (
    <span
      aria-hidden
      className={`ml-2 inline-block h-2 align-middle ${negative ? "bg-black/30" : "bg-black"}`}
      style={{ width: `${Math.max(width, 2)}%`, maxWidth: "60px" }}
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
  const [fromMonth, setFromMonth] = useState(() => monthOffset(-5));
  const [toMonth, setToMonth] = useState(() => monthOffset(0));
  const [companyId, setCompanyId] = useState("");
  const [plantType, setPlantType] = useState<CargoSourceType | "">("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [driverId, setDriverId] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener("sahyadri-local-update", bump);
    window.addEventListener("sahyadri-vehicle-update", bump);
    window.addEventListener("sahyadri-cargo-source-update", bump);
    window.addEventListener("sahyadri-staff-update", bump);
    return () => {
      window.removeEventListener("sahyadri-local-update", bump);
      window.removeEventListener("sahyadri-vehicle-update", bump);
      window.removeEventListener("sahyadri-cargo-source-update", bump);
      window.removeEventListener("sahyadri-staff-update", bump);
    };
  }, []);

  const cargoSources = useMemo(() => getAllCargoSources(), [version]);

  const filters: DashboardFilters = useMemo(
    () => ({ fromMonth, toMonth, companyId, vehicleNo, driverId, plantType }),
    [fromMonth, toMonth, companyId, vehicleNo, driverId, plantType]
  );

  // version bump re-reads localStorage when any record changes
  /* eslint-disable react-hooks/exhaustive-deps */
  const totals = useMemo(() => plTotals(filters), [filters, version]);
  const vehicles = useMemo(() => vehicleSummary(filters), [filters, version]);
  const drivers = useMemo(() => driverSummary(filters), [filters, version]);
  const staffPayroll = useMemo(() => staffPayrollSummary(filters), [filters, version]);
  const months = useMemo(() => monthlyPL(filters), [filters, version]);
  const allTrips = useMemo(
    () => collectTrips({ ...filters, vehicleNo: "", driverId: "" }),
    [fromMonth, toMonth, companyId, plantType, version]
  );
  /* eslint-enable react-hooks/exhaustive-deps */

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
  const maxVehicleEarning = Math.max(0, ...vehicles.map((v) => v.earnings));
  const maxMonthRevenue = Math.max(0, ...months.map((m) => m.revenue));

  const kpis = [
    { label: "Revenue", value: `Rs ${money(totals.revenue)}` },
    { label: "Expenses", value: `Rs ${money(totals.expenses)}` },
    {
      label: totals.profit < 0 ? "Loss" : "Profit",
      value: `Rs ${money(totals.profit)}`,
      strong: true,
      negative: totals.profit < 0,
    },
    { label: "Trips", value: formatQty(totals.trips) },
    { label: "Weight (kg)", value: formatQty(totals.totalWt) },
  ];

  return (
    <div className="max-w-6xl">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-black">Dashboard</h2>
        <p className="mt-1 text-sm text-black">
          Vehicle earnings vs costs, trips, driver costs and monthly transportation
          profit / loss — computed from all saved records.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 border border-black p-3 sm:grid-cols-3 lg:grid-cols-6">
        <label className="flex flex-col gap-0.5 text-xs font-medium text-black">
          From Month
          <input
            type="month"
            value={fromMonth}
            max={toMonth}
            onChange={(e) => setFromMonth(e.target.value)}
            className={selectClass}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs font-medium text-black">
          To Month
          <input
            type="month"
            value={toMonth}
            min={fromMonth}
            onChange={(e) => setToMonth(e.target.value)}
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

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="border border-black px-2.5 py-2">
            <p className="text-xs font-medium text-black">{kpi.label}</p>
            <p
              className={`text-sm sm:text-base ${kpi.strong ? "font-semibold" : ""} ${
                kpi.negative ? "underline" : ""
              } text-black`}
            >
              {kpi.negative ? "−" : ""}
              {kpi.value.replace("-", "")}
            </p>
          </div>
        ))}
      </div>

      <section className="mb-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-black">
            Vehicles — earnings vs expenses
          </h3>
          <button
            type="button"
            onClick={() =>
              exportRows(
                `dashboard-vehicles-${fromMonth}-${toMonth}.csv`,
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
                <th className={headCell}>Earnings</th>
                <th className={headCell}>Diesel</th>
                <th className={headCell}>Maintenance</th>
                <th className={headCell}>Toll</th>
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
                    <td className={cellRight}>
                      {money(v.earnings)}
                      <Bar value={v.earnings} max={maxVehicleEarning} />
                    </td>
                    <td className={cellRight}>{money(v.dieselCost)}</td>
                    <td className={cellRight}>{money(v.maintenanceCost)}</td>
                    <td className={cellRight}>{money(v.toll)}</td>
                    <td className={`${cellRight} font-semibold`}>
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
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-black">
            Drivers — trips & costs
          </h3>
          <button
            type="button"
            onClick={() =>
              exportRows(
                `dashboard-drivers-${fromMonth}-${toMonth}.csv`,
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
                <th className={headCell}>Earnings Hauled</th>
                <th className={headCell}>Salary Paid</th>
                <th className={headCell}>Daily Expenses</th>
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
          <h3 className="text-base font-semibold text-black">
            Staff Payroll — accountants, hamals & other staff
          </h3>
          <button
            type="button"
            onClick={() =>
              exportRows(
                `dashboard-staff-payroll-${fromMonth}-${toMonth}.csv`,
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
                <th className={headCell}>Salary Paid</th>
                <th className={headCell}>Daily Expenses</th>
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
          <h3 className="text-base font-semibold text-black">
            Monthly profit / loss
          </h3>
          <button
            type="button"
            onClick={() =>
              exportRows(
                `dashboard-monthly-pl-${fromMonth}-${toMonth}.csv`,
                ["Month", "Revenue", "Diesel", "Toll", "Maintenance", "Salary", "Driver Expenses", "Profit"],
                months.map((m) => [m.month, m.revenue, m.diesel, m.toll, m.maintenance, m.salary, m.driverExpenses, m.profit])
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
                <th className={headCell}>Month</th>
                <th className={headCell}>Revenue</th>
                <th className={headCell}>Diesel</th>
                <th className={headCell}>Toll</th>
                <th className={headCell}>Maintenance</th>
                <th className={headCell}>Salary</th>
                <th className={headCell}>Driver Exp.</th>
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
                    <Bar value={m.revenue} max={maxMonthRevenue} />
                  </td>
                  <td className={cellRight}>{money(m.diesel)}</td>
                  <td className={cellRight}>{money(m.toll)}</td>
                  <td className={cellRight}>{money(m.maintenance)}</td>
                  <td className={cellRight}>{money(m.salary)}</td>
                  <td className={cellRight}>{money(m.driverExpenses)}</td>
                  <td className={`${cellRight} font-semibold`}>
                    {m.profit < 0 ? `−${money(Math.abs(m.profit))}` : money(m.profit)}
                    <Bar value={m.profit} max={maxMonthRevenue} negative={m.profit < 0} />
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
                <td className={cellRight}>
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
