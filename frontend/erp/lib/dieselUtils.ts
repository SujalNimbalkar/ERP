/** Build a unique fill reference to link tank fills with cargo trips */
export function buildDieselFillRef(vehicleNo: string, date: string): string {
  const vehicle = vehicleNo.trim().toUpperCase().replace(/\s+/g, "");
  const day = date.trim();
  if (!vehicle || !day) return "";
  return `${vehicle}-${day}`;
}

export const LAST_DIESEL_FILL_KEY = "sahyadri_last_diesel_fill";
export const DIESEL_FILL_HISTORY_KEY = "sahyadri_diesel_fill_history";

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

export function saveLastDieselFill(fill: LastDieselFill) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_DIESEL_FILL_KEY, JSON.stringify(fill));
  saveDieselFillHistory(fill);
}

export function loadLastDieselFill(): LastDieselFill | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(LAST_DIESEL_FILL_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LastDieselFill;
  } catch {
    return null;
  }
}

export function loadDieselFillHistory(): LastDieselFill[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(DIESEL_FILL_HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is LastDieselFill =>
        Boolean(
          item &&
            typeof item.fillRef === "string" &&
            typeof item.vehicleNo === "string" &&
            typeof item.fillAmount === "string" &&
            typeof item.date === "string"
        )
    );
  } catch {
    return [];
  }
}

export function saveDieselFillHistory(fill: LastDieselFill) {
  if (typeof window === "undefined") return;
  const existing = loadDieselFillHistory();
  const withoutSameRef = existing.filter((entry) => entry.fillRef !== fill.fillRef);
  const next = [fill, ...withoutSameRef].sort(sortByLatestDate).slice(0, 200);
  localStorage.setItem(DIESEL_FILL_HISTORY_KEY, JSON.stringify(next));
}

export function findLatestDieselFillByVehicle(vehicleNo: string): LastDieselFill | null {
  const normalizedVehicle = normalizeVehicle(vehicleNo);
  if (!normalizedVehicle) return null;
  const matched = loadDieselFillHistory()
    .filter((entry) => normalizeVehicle(entry.vehicleNo) === normalizedVehicle)
    .sort(sortByLatestDate);
  return matched[0] ?? null;
}

export function listDieselFillsByVehicle(vehicleNo: string): LastDieselFill[] {
  const normalizedVehicle = normalizeVehicle(vehicleNo);
  if (!normalizedVehicle) return [];
  return loadDieselFillHistory()
    .filter((entry) => normalizeVehicle(entry.vehicleNo) === normalizedVehicle)
    .sort(sortByLatestDate);
}
