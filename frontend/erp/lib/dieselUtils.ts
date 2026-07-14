import { listSheets } from "@/app/actions/sheets";
import { hasCloudSync } from "./storageMode";

/** Build a unique fill reference to link tank fills with cargo trips */
export function buildDieselFillRef(vehicleNo: string, date: string): string {
  const vehicle = vehicleNo.trim().toUpperCase().replace(/\s+/g, "");
  const day = date.trim();
  if (!vehicle || !day) return "";
  return `${vehicle}-${day}`;
}

/**
 * Auto-calculator between amount and liters at the entered rate:
 * editing the amount (or the rate) derives liters; editing liters derives
 * the amount. Shared by any form that embeds a Diesel Tank Fill block
 * (Diesel Tank module itself, and Infra & Crusher's "Diesel filled?" checkbox).
 */
export function applyDieselCalc(
  values: Record<string, string>,
  changedField: string
): Record<string, string> {
  const rate = Number(values.ratePerLiter);
  if (!(rate > 0)) return values;
  const amount = Number(values.fillAmount);
  const liters = Number(values.liters);

  if (changedField === "fillAmount" || changedField === "ratePerLiter") {
    if (amount > 0) {
      return { ...values, liters: String(Math.round((amount / rate) * 100) / 100) };
    }
    if (changedField === "fillAmount") return { ...values, liters: "" };
    if (liters > 0) {
      return { ...values, fillAmount: String(Math.round(liters * rate * 100) / 100) };
    }
  }
  if (changedField === "liters") {
    return {
      ...values,
      fillAmount: liters > 0 ? String(Math.round(liters * rate * 100) / 100) : "",
    };
  }
  return values;
}

export interface LastDieselFill {
  fillRef: string;
  vehicleNo: string;
  fillAmount: string;
  date: string;
}

function normalizeVehicle(vehicleNo: string): string {
  return vehicleNo.trim().toUpperCase().replace(/\s+/g, "");
}

function sortByLatestDate(a: LastDieselFill, b: LastDieselFill): number {
  const dateDiff = (b.date || "").localeCompare(a.date || "");
  if (dateDiff !== 0) return dateDiff;
  return b.fillRef.localeCompare(a.fillRef);
}

/**
 * Every diesel fill row, fetched live from the Diesel Tank sheet tab — the
 * Sheet is the only source of truth here, nothing is cached in localStorage.
 * Returns [] if cloud sync isn't configured or the fetch fails, so callers
 * (the "recent fills" dropdowns, vehicle-change auto-suggestions) degrade to
 * "no suggestions" rather than throwing.
 */
export async function fetchAllDieselFills(): Promise<LastDieselFill[]> {
  if (!hasCloudSync()) return [];
  try {
    const json = await listSheets(["diesel"]);
    if (!json.success || !Array.isArray(json.data?.diesel)) return [];
    return json.data.diesel
      .map((row) => ({
        fillRef: String(row.fillRef ?? ""),
        vehicleNo: String(row.vehicleNo ?? ""),
        fillAmount: String(row.fillAmount ?? ""),
        date: String(row.date ?? ""),
      }))
      .filter((f) => f.fillRef);
  } catch {
    return [];
  }
}

/** Filters an already-fetched fill list down to one vehicle, newest first. */
export function filterDieselFillsByVehicle(
  fills: LastDieselFill[],
  vehicleNo: string
): LastDieselFill[] {
  const normalizedVehicle = normalizeVehicle(vehicleNo);
  if (!normalizedVehicle) return [];
  return fills
    .filter((entry) => normalizeVehicle(entry.vehicleNo) === normalizedVehicle)
    .sort(sortByLatestDate);
}

/** The most recent fill for one vehicle from an already-fetched fill list. */
export function latestDieselFillForVehicle(
  fills: LastDieselFill[],
  vehicleNo: string
): LastDieselFill | null {
  return filterDieselFillsByVehicle(fills, vehicleNo)[0] ?? null;
}
