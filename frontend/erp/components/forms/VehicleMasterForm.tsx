"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FUEL_TYPES,
  MANUFACTURERS,
  OWNERSHIP_TYPES,
  PERMIT_TYPES,
  VEHICLE_COMPLIANCE_FIELDS,
  VEHICLE_TYPES,
  type VehicleMasterRecord,
  deleteVehicle,
  getAllVehicles,
  getComplianceDaysLeft,
  getNextVehicleId,
  saveVehicle,
} from "@/lib/vehicleStore";
import { getDriverOptions, type DriverOption } from "@/lib/driverStore";

// ── helpers ──────────────────────────────────────────────────────────────────

function emptyForm(id: string): VehicleMasterRecord {
  return {
    id,
    registrationNo: "", engineNo: "", chassisNo: "",
    vehicleType: "", makeModel: "", manufacturer: "",
    yearOfManufacture: "", loadCapacityKg: "", fuelType: "",
    ownershipType: "", ownerName: "",
    assignedDriverId: "", assignedDriverName: "",
    insurancePolicyNo: "", insuranceCompany: "",
    insuranceValidUpto: "", fitnessValidUpto: "", pucValidUpto: "",
    roadTaxValidUpto: "", permitType: "", permitValidUpto: "",
    rtoPassingDate: "", notes: "",
    addedAt: "", updatedAt: "",
  };
}

function complianceCell(dateStr: string): { text: string; urgent: boolean } {
  if (!dateStr) return { text: "—", urgent: false };
  const days = getComplianceDaysLeft(dateStr);
  if (days < 0) return { text: "EXPIRED", urgent: true };
  const formatted = new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "2-digit",
  });
  if (days <= 30) return { text: `${formatted} · ${days}d`, urgent: true };
  return { text: formatted, urgent: false };
}

function nearestExpiry(v: VehicleMasterRecord): number {
  return Math.min(
    ...VEHICLE_COMPLIANCE_FIELDS.map(({ key }) =>
      getComplianceDaysLeft(v[key] as string)
    )
  );
}

const FIELD_CLASS =
  "w-full border border-black bg-white px-3 py-2 text-sm text-black outline-none";

// ── sub-renders ───────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}
function Field({ label, children, required }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-black">
        {label}{required && " *"}
      </label>
      {children}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export function VehicleMasterForm() {
  const [vehicles, setVehicles] = useState<VehicleMasterRecord[]>([]);
  const [driverOptions, setDriverOptions] = useState<DriverOption[]>(() => getDriverOptions());
  const [mode, setMode] = useState<"none" | "add" | "edit">("none");
  const [formValues, setFormValues] = useState<VehicleMasterRecord>(() =>
    emptyForm(getNextVehicleId())
  );
  const [search, setSearch] = useState("");

  function refresh() {
    setVehicles(getAllVehicles());
  }

  useEffect(() => {
    refresh();
    const onVehicle = () => refresh();
    const onDriver = () => setDriverOptions(getDriverOptions());
    window.addEventListener("sahyadri-vehicle-update", onVehicle);
    window.addEventListener("sahyadri-local-update", onDriver);
    return () => {
      window.removeEventListener("sahyadri-vehicle-update", onVehicle);
      window.removeEventListener("sahyadri-local-update", onDriver);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((v) =>
      [v.id, v.registrationNo, v.vehicleType, v.makeModel, v.manufacturer, v.ownerName]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [vehicles, search]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setFormValues((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "assignedDriverId") {
        const d = driverOptions.find((o) => o.value === value);
        next.assignedDriverName = d?.name ?? "";
      }
      return next;
    });
  }

  function startAdd() {
    setFormValues(emptyForm(getNextVehicleId()));
    setMode("add");
  }

  function startEdit(v: VehicleMasterRecord) {
    setFormValues({ ...v });
    setMode("edit");
  }

  function cancelForm() {
    setMode("none");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const now = new Date().toISOString();
    const record: VehicleMasterRecord = {
      ...formValues,
      addedAt: mode === "add" ? now : (formValues.addedAt || now),
      updatedAt: mode === "edit" ? now : "",
    };
    saveVehicle(record);
    setMode("none");
    setFormValues(emptyForm(getNextVehicleId()));
    refresh();
  }

  function handleDelete(v: VehicleMasterRecord) {
    if (
      !confirm(
        `Delete vehicle ${v.registrationNo} (${v.id})? All details will be removed. This cannot be undone.`
      )
    )
      return;
    deleteVehicle(v.id);
    if (mode === "edit" && formValues.id === v.id) setMode("none");
    refresh();
  }

  return (
    <div>
      {/* ── toolbar ── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reg no, type, make, owner…"
          className="min-w-52 flex-1 border border-black bg-white px-3 py-2 text-sm text-black outline-none"
        />
        {mode === "none" ? (
          <button
            type="button"
            onClick={startAdd}
            className="border border-black px-4 py-2 text-sm font-medium text-black"
          >
            + Add Vehicle
          </button>
        ) : (
          <button
            type="button"
            onClick={cancelForm}
            className="border border-black px-4 py-2 text-sm text-black"
          >
            Cancel
          </button>
        )}
      </div>

      {/* ── add / edit form ── */}
      {mode !== "none" && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 border border-black p-5 space-y-5"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-black">
              {mode === "add" ? "Add New Vehicle" : `Edit — ${formValues.registrationNo} (${formValues.id})`}
            </h3>
            <div className="flex gap-2">
              <button
                type="submit"
                className="border border-black bg-white px-5 py-1.5 text-sm font-semibold text-black"
              >
                {mode === "add" ? "Save Vehicle" : "Update"}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                className="border border-black px-4 py-1.5 text-sm text-black"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Vehicle ID (readonly) */}
          <div>
            <Field label="Vehicle ID (auto)">
              <input
                type="text"
                value={formValues.id}
                readOnly
                className={FIELD_CLASS + " w-40 bg-white"}
              />
            </Field>
          </div>

          {/* Basic Details */}
          <section>
            <p className="mb-3 border-b border-black pb-1 text-xs font-semibold uppercase tracking-wide text-black">
              Basic Details
            </p>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              <Field label="Registration No" required>
                <input
                  name="registrationNo"
                  type="text"
                  required
                  value={formValues.registrationNo}
                  onChange={handleChange}
                  placeholder="e.g. MH11CH2030"
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="Vehicle Type">
                <select
                  name="vehicleType"
                  value={formValues.vehicleType}
                  onChange={handleChange}
                  className={FIELD_CLASS}
                >
                  <option value="">Select…</option>
                  {VEHICLE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Make & Model">
                <input
                  name="makeModel"
                  type="text"
                  value={formValues.makeModel}
                  onChange={handleChange}
                  placeholder="e.g. Tata Signa 4825.T"
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="Manufacturer">
                <select
                  name="manufacturer"
                  value={formValues.manufacturer}
                  onChange={handleChange}
                  className={FIELD_CLASS}
                >
                  <option value="">Select…</option>
                  {MANUFACTURERS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </Field>
              <Field label="Year of Manufacture">
                <input
                  name="yearOfManufacture"
                  type="number"
                  value={formValues.yearOfManufacture}
                  onChange={handleChange}
                  placeholder="e.g. 2019"
                  min="1990"
                  max="2099"
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="Load Capacity (kg)">
                <input
                  name="loadCapacityKg"
                  type="number"
                  step="0.01"
                  value={formValues.loadCapacityKg}
                  onChange={handleChange}
                  placeholder="e.g. 9000"
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="Fuel Type">
                <select
                  name="fuelType"
                  value={formValues.fuelType}
                  onChange={handleChange}
                  className={FIELD_CLASS}
                >
                  <option value="">Select…</option>
                  {FUEL_TYPES.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </Field>
              <Field label="Engine No">
                <input
                  name="engineNo"
                  type="text"
                  value={formValues.engineNo}
                  onChange={handleChange}
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="Chassis No">
                <input
                  name="chassisNo"
                  type="text"
                  value={formValues.chassisNo}
                  onChange={handleChange}
                  className={FIELD_CLASS}
                />
              </Field>
            </div>
          </section>

          {/* Ownership */}
          <section>
            <p className="mb-3 border-b border-black pb-1 text-xs font-semibold uppercase tracking-wide text-black">
              Ownership
            </p>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              <Field label="Ownership Type">
                <select
                  name="ownershipType"
                  value={formValues.ownershipType}
                  onChange={handleChange}
                  className={FIELD_CLASS}
                >
                  <option value="">Select…</option>
                  {OWNERSHIP_TYPES.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </Field>
              <Field label="Owner Name">
                <input
                  name="ownerName"
                  type="text"
                  value={formValues.ownerName}
                  onChange={handleChange}
                  placeholder="Vehicle owner / contractor"
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="Assigned Driver">
                <select
                  name="assignedDriverId"
                  value={formValues.assignedDriverId}
                  onChange={handleChange}
                  className={FIELD_CLASS}
                >
                  <option value="">None / Unassigned</option>
                  {driverOptions.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Driver Name (auto)">
                <input
                  type="text"
                  value={formValues.assignedDriverName}
                  readOnly
                  className={FIELD_CLASS}
                />
              </Field>
            </div>
          </section>

          {/* Compliance & Documents */}
          <section>
            <p className="mb-3 border-b border-black pb-1 text-xs font-semibold uppercase tracking-wide text-black">
              Compliance &amp; Documents
            </p>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              <Field label="Insurance Policy No">
                <input
                  name="insurancePolicyNo"
                  type="text"
                  value={formValues.insurancePolicyNo}
                  onChange={handleChange}
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="Insurance Company">
                <input
                  name="insuranceCompany"
                  type="text"
                  value={formValues.insuranceCompany}
                  onChange={handleChange}
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="Insurance Valid Upto">
                <input
                  name="insuranceValidUpto"
                  type="date"
                  value={formValues.insuranceValidUpto}
                  onChange={handleChange}
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="Fitness Valid Upto">
                <input
                  name="fitnessValidUpto"
                  type="date"
                  value={formValues.fitnessValidUpto}
                  onChange={handleChange}
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="PUC Valid Upto">
                <input
                  name="pucValidUpto"
                  type="date"
                  value={formValues.pucValidUpto}
                  onChange={handleChange}
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="Road Tax Valid Upto">
                <input
                  name="roadTaxValidUpto"
                  type="date"
                  value={formValues.roadTaxValidUpto}
                  onChange={handleChange}
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="Permit Type">
                <select
                  name="permitType"
                  value={formValues.permitType}
                  onChange={handleChange}
                  className={FIELD_CLASS}
                >
                  <option value="">Select…</option>
                  {PERMIT_TYPES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </Field>
              <Field label="Permit Valid Upto">
                <input
                  name="permitValidUpto"
                  type="date"
                  value={formValues.permitValidUpto}
                  onChange={handleChange}
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="RTO Passing Date">
                <input
                  name="rtoPassingDate"
                  type="date"
                  value={formValues.rtoPassingDate}
                  onChange={handleChange}
                  className={FIELD_CLASS}
                />
              </Field>
            </div>
          </section>

          {/* Notes */}
          <section>
            <p className="mb-3 border-b border-black pb-1 text-xs font-semibold uppercase tracking-wide text-black">
              Notes
            </p>
            <textarea
              name="notes"
              value={formValues.notes}
              onChange={handleChange}
              rows={3}
              placeholder="Any remarks about this vehicle…"
              className={FIELD_CLASS}
            />
          </section>
        </form>
      )}

      {/* ── browse table ── */}
      {vehicles.length === 0 ? (
        <p className="border border-black px-4 py-6 text-sm text-black">
          No vehicles added yet. Click <strong>+ Add Vehicle</strong> to register the first one.
        </p>
      ) : filtered.length === 0 ? (
        <p className="border border-black px-4 py-6 text-sm text-black">
          No vehicles match &ldquo;{search}&rdquo;.
        </p>
      ) : (
        <div className="overflow-x-auto border border-black">
          <table className="w-full border-collapse text-left text-xs text-black">
            <thead>
              <tr className="border-b border-black bg-white">
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">Actions</th>
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">ID</th>
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">Reg No</th>
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">Type</th>
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">Make / Model</th>
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">Cap (kg)</th>
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">Owner</th>
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">Insurance</th>
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">Fitness</th>
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">PUC</th>
                <th className="whitespace-nowrap border-r border-black/30 px-3 py-2 font-semibold">Road Tax</th>
                <th className="whitespace-nowrap px-3 py-2 font-semibold">Permit</th>
              </tr>
            </thead>
            <tbody>
              {filtered
                .slice()
                .sort((a, b) => nearestExpiry(a) - nearestExpiry(b))
                .map((v) => {
                  const isEditing = mode === "edit" && formValues.id === v.id;
                  return (
                    <tr
                      key={v.id}
                      className={`border-b border-black/20 ${isEditing ? "bg-black/5" : "hover:bg-black/5"}`}
                    >
                      <td className="whitespace-nowrap border-r border-black/20 px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => isEditing ? cancelForm() : startEdit(v)}
                            className="text-black underline"
                          >
                            {isEditing ? "Cancel" : "Edit"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(v)}
                            className="text-black underline"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                      <td className="whitespace-nowrap border-r border-black/20 px-3 py-2 font-mono">{v.id}</td>
                      <td className="whitespace-nowrap border-r border-black/20 px-3 py-2 font-semibold">{v.registrationNo}</td>
                      <td className="whitespace-nowrap border-r border-black/20 px-3 py-2">{v.vehicleType || "—"}</td>
                      <td className="whitespace-nowrap border-r border-black/20 px-3 py-2">{v.makeModel || "—"}</td>
                      <td className="whitespace-nowrap border-r border-black/20 px-3 py-2">{v.loadCapacityKg || "—"}</td>
                      <td className="whitespace-nowrap border-r border-black/20 px-3 py-2">{v.ownerName || "—"}</td>
                      {VEHICLE_COMPLIANCE_FIELDS.map(({ key, label }, idx) => {
                        const cell = complianceCell(v[key] as string);
                        return (
                          <td
                            key={key}
                            title={label}
                            className={`whitespace-nowrap px-3 py-2 ${
                              idx < VEHICLE_COMPLIANCE_FIELDS.length - 1
                                ? "border-r border-black/20"
                                : ""
                            } ${cell.urgent ? "font-semibold" : ""}`}
                          >
                            {cell.text}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-black">
        {filtered.length} vehicle(s){" "}
        {vehicles.length !== filtered.length ? `(of ${vehicles.length} total)` : ""}
        {" "}· Bold compliance cells = expired or expiring within 30 days
      </p>
    </div>
  );
}
