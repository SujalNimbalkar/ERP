import { getLocalRecordsByType } from "./localStore";
import { type CargoSourceType } from "./sheetConfig";
import { getAllMaintenance, getAllVehicles } from "./vehicleStore";
import { getAllStaff } from "./staffStore";
import { round2 } from "./billing";
import type { LocalRecord } from "./types";

/**
 * Dashboard aggregations — pure reads over the hydrated stores.
 *
 * Correctness rules:
 * - Cargo rows are per material line; a *trip* is the group of rows sharing
 *   type + vehicleNo + date + lrNo; per-line transportAmount is summed.
 * - Trip-level amounts (toll, diesel-used) live in their own Trip Expense
 *   record (one row per trip), referenced from cargo rows via
 *   `tripExpenseRef` — see `tripExpenseMap()`. Rows saved before that record
 *   existed still carry the amount inline on every row of the trip; those
 *   fall back to reading it off the first row, same as before.
 * - Diesel cost comes from actual tank fills (fillAmount), not the per-trip
 *   estimates, so fuel money is never double counted.
 * - Infra & Crusher's earning is the crusher-to-sale margin ("difference"),
 *   not the raw sale price ("totalAmount") — see `infraEarning()`. Total
 *   Amount ignores what was paid to the crusher, so using it directly would
 *   overstate profit by the crusher cost on every trip.
 * - Each Infra & Crusher record is one trip of its own (see
 *   `collectInfraTrips()`) — counted in trip totals alongside cargo trips,
 *   but with no kg weight (infra quantities are brass).
 */

export interface DashboardFilters {
  /** Inclusive YYYY-MM-DD range */
  fromDate: string;
  toDate: string;
  companyId?: string;
  vehicleNo?: string;
  driverId?: string;
  plantType?: CargoSourceType | "";
}

export interface Trip {
  key: string;
  plantType: CargoSourceType;
  date: string;
  month: string;
  vehicleNo: string;
  lrNo: string;
  companyId: string;
  driverId: string;
  driverName: string;
  lineCount: number;
  totalWt: number;
  earning: number;
  toll: number;
  dieselUsed: number;
  documentNos: string[];
}

export interface VehicleSummaryRow {
  vehicleNo: string;
  trips: number;
  totalWt: number;
  earnings: number;
  dieselCost: number;
  maintenanceCost: number;
  toll: number;
  profit: number;
}

export interface DriverSummaryRow {
  driverId: string;
  driverName: string;
  trips: number;
  totalWt: number;
  earningsHauled: number;
  salaryPaid: number;
  dailyExpenses: number;
  expensesByType: Record<string, number>;
  totalCost: number;
}

export interface StaffPayrollRow {
  staffId: string;
  name: string;
  role: string;
  salaryPaid: number;
  dailyExpenses: number;
  expensesByType: Record<string, number>;
  totalCost: number;
}

export interface MonthlyPLRow {
  month: string;
  revenue: number;
  diesel: number;
  toll: number;
  maintenance: number;
  salary: number;
  driverExpenses: number;
  profit: number;
  revenueByCompany: Record<string, number>;
}

function num(v: string | number | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Infra & Crusher's real earning is the crusher-to-sale margin ("difference"
 * = Total Amount − Crusher Amount), not the raw sale price — Total Amount
 * alone overstates profit since it ignores what was paid to the crusher.
 * Falls back to Total Amount for rows saved before "difference" existed, or
 * where no crusher cost was tracked (difference never computed at all —
 * checked by presence, not by being numerically 0, so a genuine break-even
 * trip isn't mistaken for an untracked one).
 */
function infraEarning(data: Record<string, string | number>): number {
  const diff = data.difference;
  if (diff !== undefined && diff !== null && String(diff).trim() !== "") {
    return num(diff);
  }
  return num(data.totalAmount);
}

function inRange(date: string, filters: DashboardFilters): boolean {
  if (!date) return false;
  return date >= filters.fromDate && date <= filters.toDate;
}

/** driverId → name map from the Drivers records. */
function driverNameMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of getLocalRecordsByType("drivers")) {
    const id = String(r.data.driverId ?? "");
    if (!id) continue;
    const name = [r.data.firstName, r.data.middleName, r.data.surname]
      .map((p) => String(p ?? "").trim())
      .filter(Boolean)
      .join(" ");
    map.set(id, name);
  }
  return map;
}

/** staffId → {name, role} map from the Staff Master — non-driver payees. */
function staffInfoMap(): Map<string, { name: string; role: string }> {
  const map = new Map<string, { name: string; role: string }>();
  for (const s of getAllStaff()) {
    if (!s.id) continue;
    map.set(s.id, { name: s.name, role: s.role });
  }
  return map;
}

/** fillRef → driverId map from Diesel Tank records (legacy driver fallback). */
function fillDriverMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of getLocalRecordsByType("diesel")) {
    const ref = String(r.data.fillRef ?? "");
    const driver = String(r.data.driverId ?? "");
    if (ref && driver) map.set(ref, driver);
  }
  return map;
}

/** registrationNo → assignedDriverId map (last-resort driver fallback). */
function vehicleDriverMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const v of getAllVehicles()) {
    if (v.registrationNo && v.assignedDriverId) {
      map.set(v.registrationNo, v.assignedDriverId);
    }
  }
  return map;
}

/** id → {toll, dieselUsed} map from Trip Expense records, referenced by a
 * cargo row's `tripExpenseRef` — see the module doc comment above. */
function tripExpenseMap(): Map<string, { toll: number; dieselUsed: number }> {
  const map = new Map<string, { toll: number; dieselUsed: number }>();
  for (const r of getLocalRecordsByType("trip-expense")) {
    const id = String(r.data.id ?? "");
    if (!id) continue;
    map.set(id, {
      toll: num(r.data.tollOverloadAmount),
      dieselUsed: num(r.data.dieselUsedThisTrip),
    });
  }
  return map;
}

/** Cargo rows deduped into trips, with the driver resolved per trip. */
export function collectTrips(filters: DashboardFilters): Trip[] {
  const fillDrivers = fillDriverMap();
  const vehicleDrivers = vehicleDriverMap();
  const names = driverNameMap();
  const tripExpenses = tripExpenseMap();
  const trips = new Map<string, Trip>();

  for (const record of getLocalRecordsByType("cargo")) {
    const data = record.data;
    const type = String(data.plantType ?? "");
    if (filters.plantType && type !== filters.plantType) continue;
    const date = String(data.date ?? "");
    if (!inRange(date, filters)) continue;
    const companyId = String(data.billingCompany ?? "");
    if (filters.companyId && companyId && companyId !== filters.companyId) continue;
    if (filters.companyId && !companyId) continue;
    const vehicleNo = String(data.vehicleNo ?? "");
    if (filters.vehicleNo && vehicleNo !== filters.vehicleNo) continue;

    const key = `${type}|${vehicleNo}|${date}|${String(data.lrNo ?? "")}`;
    let trip = trips.get(key);
    if (!trip) {
      // explicit driver on the row wins; legacy rows resolve via the
      // diesel fill's driver, then the vehicle's assigned driver
      const driverId =
        String(data.driverId ?? "") ||
        fillDrivers.get(String(data.dieselFillRef ?? "")) ||
        vehicleDrivers.get(vehicleNo) ||
        "";
      // Trip-level values — resolved via the linked Trip Expense record
      // (one row per trip, no double counting). Rows saved before that
      // record existed still carry the amount inline, so fall back to
      // reading it straight off this (first) row for those.
      const linkedExpense = tripExpenses.get(String(data.tripExpenseRef ?? ""));
      trip = {
        key,
        plantType: type,
        date,
        month: date.slice(0, 7),
        vehicleNo,
        lrNo: String(data.lrNo ?? ""),
        companyId,
        driverId,
        driverName: driverId ? (names.get(driverId) ?? driverId) : "",
        lineCount: 0,
        totalWt: 0,
        earning: 0,
        toll: linkedExpense ? linkedExpense.toll : num(data.tollOverloadAmount),
        dieselUsed: linkedExpense ? linkedExpense.dieselUsed : num(data.dieselUsedThisTrip),
        documentNos: [],
      };
      trips.set(key, trip);
    }
    trip.lineCount += 1;
    trip.totalWt = round2(trip.totalWt + num(data.totalWt));
    trip.earning = round2(trip.earning + num(data.transportAmount));
    const docNo = String(data.documentNo ?? "");
    if (docNo && !trip.documentNos.includes(docNo)) trip.documentNos.push(docNo);
  }

  const list = Array.from(trips.values());
  if (filters.driverId) return list.filter((t) => t.driverId === filters.driverId);
  return list.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Infra & Crusher records as trips — one record = one trip. Excluded from
 * company/plant/driver-scoped views, same rule as the shared-cost blocks in
 * vehicleSummary/monthlyPL (infra rows carry no company or plant, and legacy
 * rows no driver — a scoped view would silently miscount them).
 */
export function collectInfraTrips(filters: DashboardFilters): Trip[] {
  if (filters.companyId || filters.plantType || filters.driverId) return [];
  const fillDrivers = fillDriverMap();
  const vehicleDrivers = vehicleDriverMap();
  const names = driverNameMap();
  const tripExpenses = tripExpenseMap();
  const trips: Trip[] = [];

  for (const record of getLocalRecordsByType("infra")) {
    const data = record.data;
    const date = String(data.date ?? "");
    if (!inRange(date, filters)) continue;
    const vehicleNo = String(data.vehicleNo ?? "");
    if (filters.vehicleNo && vehicleNo !== filters.vehicleNo) continue;
    const driverId =
      String(data.driverId ?? "") ||
      fillDrivers.get(String(data.dieselFillRef ?? "")) ||
      vehicleDrivers.get(vehicleNo) ||
      "";
    const linkedExpense = tripExpenses.get(String(data.tripExpenseRef ?? ""));
    const challanNo = String(data.challanNo ?? "");
    trips.push({
      key: `infra|${record.id}`,
      plantType: "infra",
      date,
      month: date.slice(0, 7),
      vehicleNo,
      lrNo: challanNo,
      companyId: "",
      driverId,
      driverName: driverId ? (names.get(driverId) ?? driverId) : "",
      lineCount: 1,
      // Infra quantities are in brass, not kg — kept out of the weight totals.
      totalWt: 0,
      earning: infraEarning(data),
      toll: linkedExpense ? linkedExpense.toll : num(data.tollOverloadAmount),
      dieselUsed: linkedExpense ? linkedExpense.dieselUsed : num(data.dieselUsedThisTrip),
      documentNos: challanNo ? [challanNo] : [],
    });
  }
  return trips.sort((a, b) => b.date.localeCompare(a.date));
}

/** Generic filtered read of dated record types (diesel, salary, expenses…). */
function datedRecords(type: Parameters<typeof getLocalRecordsByType>[0], filters: DashboardFilters, dateKey = "date"): LocalRecord[] {
  return getLocalRecordsByType(type).filter((r) =>
    inRange(String(r.data[dateKey] ?? ""), filters)
  );
}

export function vehicleSummary(filters: DashboardFilters): VehicleSummaryRow[] {
  const rows = new Map<string, VehicleSummaryRow>();
  const get = (vehicleNo: string): VehicleSummaryRow => {
    let row = rows.get(vehicleNo);
    if (!row) {
      row = {
        vehicleNo,
        trips: 0,
        totalWt: 0,
        earnings: 0,
        dieselCost: 0,
        maintenanceCost: 0,
        toll: 0,
        profit: 0,
      };
      rows.set(vehicleNo, row);
    }
    return row;
  };

  for (const trip of collectTrips(filters)) {
    const row = get(trip.vehicleNo || "(no vehicle)");
    row.trips += 1;
    row.totalWt = round2(row.totalWt + trip.totalWt);
    row.earnings = round2(row.earnings + trip.earning);
    row.toll = round2(row.toll + trip.toll);
  }

  // Company / plant / driver filters scope the view to trip numbers only —
  // infra earnings and shared vehicle costs (fills, maintenance) carry no
  // company/plant/driver and would make the filtered profit misleading.
  const scoped = !!(filters.companyId || filters.plantType || filters.driverId);

  if (!scoped) {
    for (const trip of collectInfraTrips(filters)) {
      const row = get(trip.vehicleNo || "(no vehicle)");
      row.trips += 1;
      row.earnings = round2(row.earnings + trip.earning);
      row.toll = round2(row.toll + trip.toll);
    }

    for (const r of datedRecords("diesel", filters)) {
      const vehicleNo = String(r.data.vehicleNo ?? "");
      if (!vehicleNo || (filters.vehicleNo && vehicleNo !== filters.vehicleNo)) continue;
      get(vehicleNo).dieselCost = round2(
        get(vehicleNo).dieselCost + num(r.data.fillAmount)
      );
    }

    for (const m of getAllMaintenance()) {
      if (!inRange(m.date, filters)) continue;
      const vehicleNo = m.vehicleNo;
      if (!vehicleNo || (filters.vehicleNo && vehicleNo !== filters.vehicleNo)) continue;
      get(vehicleNo).maintenanceCost = round2(
        get(vehicleNo).maintenanceCost + num(m.totalCost)
      );
    }
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      profit: round2(row.earnings - row.dieselCost - row.maintenanceCost - row.toll),
    }))
    .sort((a, b) => b.earnings - a.earnings);
}

export function driverSummary(filters: DashboardFilters): DriverSummaryRow[] {
  const names = driverNameMap();
  const rows = new Map<string, DriverSummaryRow>();
  const get = (driverId: string): DriverSummaryRow => {
    let row = rows.get(driverId);
    if (!row) {
      row = {
        driverId,
        driverName: driverId ? (names.get(driverId) ?? driverId) : "(unassigned)",
        trips: 0,
        totalWt: 0,
        earningsHauled: 0,
        salaryPaid: 0,
        dailyExpenses: 0,
        expensesByType: {},
        totalCost: 0,
      };
      rows.set(driverId, row);
    }
    return row;
  };

  for (const trip of collectTrips(filters)) {
    const row = get(trip.driverId);
    row.trips += 1;
    row.totalWt = round2(row.totalWt + trip.totalWt);
    row.earningsHauled = round2(row.earningsHauled + trip.earning);
  }

  // Only ids that resolve to an actual driver land here — staff payroll
  // (accountants, hamals) is aggregated separately by staffPayrollSummary().
  for (const r of datedRecords("salary", filters, "paymentDate")) {
    const driverId = String(r.data.driverId ?? "");
    if (!driverId || !names.has(driverId)) continue;
    if (filters.driverId && driverId !== filters.driverId) continue;
    get(driverId).salaryPaid = round2(get(driverId).salaryPaid + num(r.data.amount));
  }

  for (const r of datedRecords("driver-expense", filters)) {
    const driverId = String(r.data.driverId ?? "");
    if (!driverId || !names.has(driverId)) continue;
    if (filters.driverId && driverId !== filters.driverId) continue;
    const row = get(driverId);
    const amount = num(r.data.amount);
    const type = String(r.data.expenseType ?? "Other") || "Other";
    row.dailyExpenses = round2(row.dailyExpenses + amount);
    row.expensesByType[type] = round2((row.expensesByType[type] ?? 0) + amount);
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      totalCost: round2(row.salaryPaid + row.dailyExpenses),
    }))
    .sort((a, b) => b.trips - a.trips || b.totalCost - a.totalCost);
}

/** Salary + daily-expense totals for non-driver staff (accountants, hamals, etc). */
export function staffPayrollSummary(filters: DashboardFilters): StaffPayrollRow[] {
  const staff = staffInfoMap();
  const rows = new Map<string, StaffPayrollRow>();
  const get = (staffId: string): StaffPayrollRow => {
    let row = rows.get(staffId);
    if (!row) {
      const info = staff.get(staffId);
      row = {
        staffId,
        name: info?.name ?? staffId,
        role: info?.role ?? "",
        salaryPaid: 0,
        dailyExpenses: 0,
        expensesByType: {},
        totalCost: 0,
      };
      rows.set(staffId, row);
    }
    return row;
  };

  for (const r of datedRecords("salary", filters, "paymentDate")) {
    const staffId = String(r.data.driverId ?? "");
    if (!staffId || !staff.has(staffId)) continue;
    get(staffId).salaryPaid = round2(get(staffId).salaryPaid + num(r.data.amount));
  }

  for (const r of datedRecords("driver-expense", filters)) {
    const staffId = String(r.data.driverId ?? "");
    if (!staffId || !staff.has(staffId)) continue;
    const row = get(staffId);
    const amount = num(r.data.amount);
    const type = String(r.data.expenseType ?? "Other") || "Other";
    row.dailyExpenses = round2(row.dailyExpenses + amount);
    row.expensesByType[type] = round2((row.expensesByType[type] ?? 0) + amount);
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      totalCost: round2(row.salaryPaid + row.dailyExpenses),
    }))
    .sort((a, b) => b.totalCost - a.totalCost);
}

/** Every YYYY-MM between from and to, inclusive. */
export function monthRange(fromMonth: string, toMonth: string): string[] {
  const months: string[] = [];
  const [fy, fm] = fromMonth.split("-").map(Number);
  const [ty, tm] = toMonth.split("-").map(Number);
  if (!fy || !fm || !ty || !tm) return months;
  const cursor = new Date(fy, fm - 1, 1);
  const end = new Date(ty, tm - 1, 1);
  while (cursor <= end && months.length < 120) {
    months.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`
    );
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

export function monthlyPL(filters: DashboardFilters): MonthlyPLRow[] {
  const rows = new Map<string, MonthlyPLRow>();
  for (const month of monthRange(filters.fromDate.slice(0, 7), filters.toDate.slice(0, 7))) {
    rows.set(month, {
      month,
      revenue: 0,
      diesel: 0,
      toll: 0,
      maintenance: 0,
      salary: 0,
      driverExpenses: 0,
      profit: 0,
      revenueByCompany: {},
    });
  }
  const get = (date: string) => rows.get(date.slice(0, 7));

  for (const trip of collectTrips(filters)) {
    const row = get(trip.date);
    if (!row) continue;
    row.revenue = round2(row.revenue + trip.earning);
    row.toll = round2(row.toll + trip.toll);
    if (trip.companyId) {
      row.revenueByCompany[trip.companyId] = round2(
        (row.revenueByCompany[trip.companyId] ?? 0) + trip.earning
      );
    }
  }

  // Company/plant/driver filters scope the P/L to trip revenue+toll only —
  // shared costs (fills, maintenance, salaries) can't be split by company.
  const scoped = !!(filters.companyId || filters.plantType || filters.driverId);

  if (!scoped) {
    for (const trip of collectInfraTrips(filters)) {
      const row = get(trip.date);
      if (!row) continue;
      row.revenue = round2(row.revenue + trip.earning);
      row.toll = round2(row.toll + trip.toll);
    }
    for (const r of datedRecords("diesel", filters)) {
      const row = get(String(r.data.date ?? ""));
      if (!row) continue;
      if (filters.vehicleNo && String(r.data.vehicleNo ?? "") !== filters.vehicleNo) continue;
      row.diesel = round2(row.diesel + num(r.data.fillAmount));
    }
    for (const m of getAllMaintenance()) {
      if (!inRange(m.date, filters)) continue;
      const row = get(m.date);
      if (!row) continue;
      if (filters.vehicleNo && m.vehicleNo !== filters.vehicleNo) continue;
      row.maintenance = round2(row.maintenance + num(m.totalCost));
    }
    if (!filters.vehicleNo) {
      for (const r of datedRecords("salary", filters, "paymentDate")) {
        const row = get(String(r.data.paymentDate ?? ""));
        if (row) row.salary = round2(row.salary + num(r.data.amount));
      }
      for (const r of datedRecords("driver-expense", filters)) {
        const row = get(String(r.data.date ?? ""));
        if (row) row.driverExpenses = round2(row.driverExpenses + num(r.data.amount));
      }
    }
  }

  return Array.from(rows.values()).map((row) => ({
    ...row,
    profit: round2(
      row.revenue - row.diesel - row.toll - row.maintenance - row.salary - row.driverExpenses
    ),
  }));
}

export interface PLTotals {
  revenue: number;
  diesel: number;
  toll: number;
  maintenance: number;
  salary: number;
  driverExpenses: number;
  expenses: number;
  profit: number;
  trips: number;
  totalWt: number;
}

export function plTotals(filters: DashboardFilters): PLTotals {
  const months = monthlyPL(filters);
  const trips = [...collectTrips(filters), ...collectInfraTrips(filters)];
  const sum = (pick: (r: MonthlyPLRow) => number) =>
    round2(months.reduce((acc, r) => acc + pick(r), 0));
  const revenue = sum((r) => r.revenue);
  const diesel = sum((r) => r.diesel);
  const toll = sum((r) => r.toll);
  const maintenance = sum((r) => r.maintenance);
  const salary = sum((r) => r.salary);
  const driverExpenses = sum((r) => r.driverExpenses);
  const expenses = round2(diesel + toll + maintenance + salary + driverExpenses);
  return {
    revenue,
    diesel,
    toll,
    maintenance,
    salary,
    driverExpenses,
    expenses,
    profit: round2(revenue - expenses),
    trips: trips.length,
    totalWt: round2(trips.reduce((acc, t) => acc + t.totalWt, 0)),
  };
}
