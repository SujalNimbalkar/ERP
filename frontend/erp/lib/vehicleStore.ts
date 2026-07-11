import { syncMasterRecord } from "./api";
import type { FieldConfig, FieldSection } from "./types";

export interface VehicleMasterRecord {
  id: string;
  registrationNo: string;
  engineNo: string;
  chassisNo: string;
  vehicleType: string;
  makeModel: string;
  manufacturer: string;
  yearOfManufacture: string;
  loadCapacityKg: string;
  fuelType: string;
  ownershipType: string;
  ownerName: string;
  assignedDriverId: string;
  assignedDriverName: string;
  insurancePolicyNo: string;
  insuranceCompany: string;
  insuranceValidUpto: string;
  fitnessValidUpto: string;
  pucValidUpto: string;
  roadTaxValidUpto: string;
  permitType: string;
  permitValidUpto: string;
  rtoPassingDate: string;
  notes: string;
  addedAt: string;
  updatedAt: string;
}

export interface VehicleMaintenanceRecord {
  id: string;
  vehicleId: string;
  vehicleNo: string;
  date: string;
  maintenanceType: string;
  partName: string;
  partNumber: string;
  description: string;
  vendorName: string;
  invoiceNo: string;
  labourCost: string;
  partsCost: string;
  totalCost: string;
  odometerKm: string;
  nextServiceKm: string;
  nextServiceDate: string;
  doneBy: string;
  remarks: string;
  addedAt: string;
}

export interface VehicleOption {
  value: string;
  label: string;
  registrationNo: string;
}

export const VEHICLE_TYPES = [
  "Truck","Dumper", "Trailer", "Tempo", "Pickup", "Container", "Other",
] as const;

export const MANUFACTURERS = [
  "Tata", "Ashok Leyland", "Mahindra", "Eicher", "Force", "BharatBenz", "Other",
] as const;

export const FUEL_TYPES = ["Diesel", "CNG", "Petrol"] as const;

export const OWNERSHIP_TYPES = ["Own", "Contracted"] as const;

export const PERMIT_TYPES = ["National", "State", "Contract Carriage"] as const;

export const MAINTENANCE_TYPES = [
  "Oil Change",
  "Full Service",
  "Tyre Replacement",
  "Battery Replacement",
  "Brake Repair",
  "Engine Repair",
  "Body Work",
  "Part Replacement",
  "AC Service",
  "Electrical Repair",
  "Suspension",
  "Other",
] as const;

export const VEHICLE_COMPLIANCE_FIELDS: Array<{
  key: keyof VehicleMasterRecord;
  label: string;
}> = [
  { key: "insuranceValidUpto", label: "Insurance" },
  { key: "fitnessValidUpto", label: "Fitness" },
  { key: "pucValidUpto", label: "PUC" },
  { key: "roadTaxValidUpto", label: "Road Tax" },
  { key: "permitValidUpto", label: "Permit" },
];

export const VEHICLE_MASTER_SECTIONS: FieldSection[] = [
  {
    id: "basic",
    title: "Basic Details",
    fields: [
      { name: "registrationNo", label: "Registration No", type: "text", required: true, placeholder: "e.g. MH11CH2030" },
      { name: "vehicleType", label: "Vehicle Type", type: "select", options: [...VEHICLE_TYPES] },
      { name: "makeModel", label: "Make & Model", type: "text", placeholder: "e.g. Tata Signa 4825.T" },
      { name: "manufacturer", label: "Manufacturer", type: "select", options: [...MANUFACTURERS] },
      { name: "yearOfManufacture", label: "Year of Manufacture", type: "number", placeholder: "e.g. 2019", min: "1990", max: "2099" },
      { name: "loadCapacityKg", label: "Load Capacity (kg)", type: "number", step: "0.01", placeholder: "e.g. 9000" },
      { name: "fuelType", label: "Fuel Type", type: "select", options: [...FUEL_TYPES] },
      { name: "engineNo", label: "Engine No", type: "text" },
      { name: "chassisNo", label: "Chassis No", type: "text" },
    ],
  },
  {
    id: "ownership",
    title: "Ownership",
    fields: [
      { name: "ownershipType", label: "Ownership Type", type: "select", options: [...OWNERSHIP_TYPES] },
      { name: "ownerName", label: "Owner Name", type: "text", placeholder: "Vehicle owner / contractor" },
      { name: "assignedDriverId", label: "Assigned Driver", type: "select", options: [] },
      { name: "assignedDriverName", label: "Driver Name (auto)", type: "text", readOnly: true },
    ],
  },
  {
    id: "compliance",
    title: "Compliance & Documents",
    fields: [
      { name: "insurancePolicyNo", label: "Insurance Policy No", type: "text" },
      { name: "insuranceCompany", label: "Insurance Company", type: "text" },
      { name: "insuranceValidUpto", label: "Insurance Valid Upto", type: "date" },
      { name: "fitnessValidUpto", label: "Fitness Valid Upto", type: "date" },
      { name: "pucValidUpto", label: "PUC Valid Upto", type: "date" },
      { name: "roadTaxValidUpto", label: "Road Tax Valid Upto", type: "date" },
      { name: "permitType", label: "Permit Type", type: "select", options: [...PERMIT_TYPES] },
      { name: "permitValidUpto", label: "Permit Valid Upto", type: "date" },
      { name: "rtoPassingDate", label: "RTO Passing Date", type: "date" },
    ],
  },
  {
    id: "notes",
    title: "Notes",
    fields: [
      { name: "notes", label: "Remarks", type: "textarea", placeholder: "Any remarks about this vehicle…", colSpan: 2 },
    ],
  },
];

export const VEHICLE_MAINTENANCE_SECTIONS: FieldSection[] = [
  {
    id: "vehicle-date",
    title: "Vehicle & Date",
    fields: [
      { name: "vehicleId", label: "Vehicle", type: "select", required: true, options: [] },
      { name: "vehicleNo", label: "Reg No (auto)", type: "text", readOnly: true },
      { name: "date", label: "Date", type: "date", required: true },
    ],
  },
  {
    id: "type-description",
    title: "Type & Description",
    fields: [
      { name: "maintenanceType", label: "Maintenance Type", type: "select", required: true, options: [...MAINTENANCE_TYPES] },
      { name: "description", label: "Description", type: "text", required: true, placeholder: "Brief description of work done" },
    ],
  },
  {
    id: "parts",
    title: "Part / Spares",
    fields: [
      { name: "partName", label: "Part Name", type: "text", placeholder: "e.g. Engine Oil Filter" },
      { name: "partNumber", label: "Part Number", type: "text" },
      { name: "vendorName", label: "Vendor / Workshop", type: "text", placeholder: "e.g. Sharma Motors" },
      { name: "invoiceNo", label: "Invoice No", type: "text" },
    ],
  },
  {
    id: "cost",
    title: "Cost",
    fields: [
      { name: "labourCost", label: "Labour Cost (Rs)", type: "number", step: "0.01" },
      { name: "partsCost", label: "Parts Cost (Rs)", type: "number", step: "0.01" },
      { name: "totalCost", label: "Total Cost (Rs, auto)", type: "number", step: "0.01", readOnly: true },
    ],
  },
  {
    id: "service",
    title: "Odometer & Next Service",
    fields: [
      { name: "odometerKm", label: "Current Odometer (km)", type: "number", placeholder: "Reading at service" },
      { name: "nextServiceKm", label: "Next Service (km)", type: "number", placeholder: "Due at km" },
      { name: "nextServiceDate", label: "Next Service Date", type: "date" },
      { name: "doneBy", label: "Done By", type: "text", placeholder: "Mechanic / driver name" },
    ],
  },
  {
    id: "remarks",
    title: "Remarks",
    fields: [
      { name: "remarks", label: "Remarks", type: "textarea", placeholder: "Additional notes…", colSpan: 2 },
    ],
  },
];

/** Populate an options-based field (assignedDriverId, vehicleId) with live {value,label} pairs. */
export function injectFieldOptions(
  sections: FieldSection[],
  fieldName: string,
  options: { value: string; label: string }[]
): FieldSection[] {
  return sections.map((section) => ({
    ...section,
    fields: section.fields.map((f): FieldConfig => (f.name === fieldName ? { ...f, options } : f)),
  }));
}

const VEHICLE_MASTER_KEY = "sahyadri_vehicle_master";
const VEHICLE_MAINTENANCE_KEY = "sahyadri_vehicle_maintenance";

function readMaster(): VehicleMasterRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(VEHICLE_MASTER_KEY);
    return raw ? (JSON.parse(raw) as VehicleMasterRecord[]) : [];
  } catch {
    return [];
  }
}

function writeMaster(records: VehicleMasterRecord[]) {
  localStorage.setItem(VEHICLE_MASTER_KEY, JSON.stringify(records));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sahyadri-vehicle-update"));
  }
}

function readMaintenance(): VehicleMaintenanceRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(VEHICLE_MAINTENANCE_KEY);
    return raw ? (JSON.parse(raw) as VehicleMaintenanceRecord[]) : [];
  } catch {
    return [];
  }
}

function writeMaintenance(records: VehicleMaintenanceRecord[]) {
  localStorage.setItem(VEHICLE_MAINTENANCE_KEY, JSON.stringify(records));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sahyadri-vehicle-update"));
  }
}

/** Replaces the local vehicle cache with rows fetched from Google Sheets. */
export function replaceWithSheetVehicles(
  master: Record<string, unknown>[],
  maintenance: Record<string, unknown>[]
): void {
  const toStrings = <T>(row: Record<string, unknown>): T => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = value === undefined || value === null ? "" : String(value);
    }
    return out as T;
  };
  writeMaster(master.map((row) => toStrings<VehicleMasterRecord>(row)).filter((v) => v.id));
  writeMaintenance(
    maintenance.map((row) => toStrings<VehicleMaintenanceRecord>(row)).filter((m) => m.id)
  );
}

export function getNextVehicleId(): string {
  const ids = readMaster()
    .map((v) => Number(v.id.replace(/^VEH-/, "")))
    .filter((n) => Number.isFinite(n));
  return `VEH-${String((ids.length ? Math.max(...ids) : 0) + 1).padStart(3, "0")}`;
}

export function getNextMaintenanceId(): string {
  const ids = readMaintenance()
    .map((m) => Number(m.id.replace(/^MNT-/, "")))
    .filter((n) => Number.isFinite(n));
  return `MNT-${String((ids.length ? Math.max(...ids) : 0) + 1).padStart(4, "0")}`;
}

export function getAllVehicles(): VehicleMasterRecord[] {
  return readMaster();
}

export function getVehicleById(id: string): VehicleMasterRecord | undefined {
  return readMaster().find((v) => v.id === id);
}

export function getVehicleOptions(): VehicleOption[] {
  return readMaster().map((v) => ({
    value: v.id,
    label: `${v.id} - ${v.registrationNo}`,
    registrationNo: v.registrationNo,
  }));
}

export function getVehicleNoOptions(): string[] {
  return readMaster()
    .map((v) => v.registrationNo)
    .filter(Boolean);
}

export function saveVehicle(record: VehicleMasterRecord): VehicleMasterRecord {
  const all = readMaster().filter((v) => v.id !== record.id);
  writeMaster([record, ...all]);
  void syncMasterRecord({ type: "vehicle-master", action: "upsert", data: record as unknown as Record<string, unknown> });
  return record;
}

export function updateVehicle(
  id: string,
  updates: Partial<VehicleMasterRecord>
): boolean {
  const all = readMaster();
  const idx = all.findIndex((v) => v.id === id);
  if (idx === -1) return false;
  all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
  writeMaster(all);
  void syncMasterRecord({ type: "vehicle-master", action: "upsert", data: all[idx] as unknown as Record<string, unknown> });
  return true;
}

export function deleteVehicle(id: string): boolean {
  const all = readMaster();
  const idx = all.findIndex((v) => v.id === id);
  if (idx === -1) return false;
  all.splice(idx, 1);
  writeMaster(all);
  void syncMasterRecord({ type: "vehicle-master", action: "delete", id });
  return true;
}

export function getAllMaintenance(): VehicleMaintenanceRecord[] {
  return readMaintenance();
}

export function getMaintenanceByVehicle(vehicleId: string): VehicleMaintenanceRecord[] {
  return readMaintenance()
    .filter((m) => m.vehicleId === vehicleId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function saveMaintenance(
  record: VehicleMaintenanceRecord
): VehicleMaintenanceRecord {
  const all = readMaintenance().filter((m) => m.id !== record.id);
  writeMaintenance([record, ...all]);
  void syncMasterRecord({ type: "vehicle-maintenance", action: "upsert", data: record as unknown as Record<string, unknown> });
  return record;
}

export function deleteMaintenance(id: string): boolean {
  const all = readMaintenance();
  const idx = all.findIndex((m) => m.id === id);
  if (idx === -1) return false;
  all.splice(idx, 1);
  writeMaintenance(all);
  void syncMasterRecord({ type: "vehicle-maintenance", action: "delete", id });
  return true;
}

export function getComplianceDaysLeft(dateStr: string): number {
  if (!dateStr) return Infinity;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export function getMaintenanceCostSummary(vehicleId: string): {
  total: number;
  thisYear: number;
  last30Days: number;
  count: number;
} {
  const now = Date.now();
  const thirtyAgo = now - 30 * 86400000;
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  return getMaintenanceByVehicle(vehicleId).reduce(
    (acc, m) => {
      const cost = Number(m.totalCost) || 0;
      const t = new Date(m.date).getTime();
      return {
        total: acc.total + cost,
        thisYear: acc.thisYear + (t >= yearStart ? cost : 0),
        last30Days: acc.last30Days + (t >= thirtyAgo ? cost : 0),
        count: acc.count + 1,
      };
    },
    { total: 0, thisYear: 0, last30Days: 0, count: 0 }
  );
}

export function getExpiringCompliance(daysAhead = 30) {
  return readMaster()
    .flatMap((v) =>
      VEHICLE_COMPLIANCE_FIELDS.map(({ key, label }) => ({
        vehicleId: v.id,
        vehicleNo: v.registrationNo,
        field: key as string,
        label,
        validUpto: v[key] as string,
        daysLeft: getComplianceDaysLeft(v[key] as string),
      }))
    )
    .filter((item) => item.validUpto && item.daysLeft <= daysAhead)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
