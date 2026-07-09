import { syncMasterRecord } from "./api";

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
