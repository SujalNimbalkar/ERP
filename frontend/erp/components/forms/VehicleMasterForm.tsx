"use client";

import { useEffect, useMemo, useState } from "react";
import {
  VEHICLE_COMPLIANCE_FIELDS,
  VEHICLE_MASTER_SECTIONS,
  type VehicleMasterRecord,
  deleteVehicle,
  getAllVehicles,
  getComplianceDaysLeft,
  getNextVehicleId,
  injectFieldOptions,
  saveVehicle,
} from "@/lib/vehicleStore";
import { getDriverOptions, type DriverOption } from "@/lib/driverStore";
import { FormField } from "@/components/ui/FormField";
import { FormSection } from "@/components/ui/FormSection";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast } from "@/components/ui/Toast";
import { useConfirmSave } from "@/components/ui/useConfirmSave";

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

// ── main component ────────────────────────────────────────────────────────────

export function VehicleMasterForm() {
  const [vehicles, setVehicles] = useState<VehicleMasterRecord[]>([]);
  const [driverOptions, setDriverOptions] = useState<DriverOption[]>(() => getDriverOptions());
  const [mode, setMode] = useState<"none" | "add" | "edit">("none");
  const [formValues, setFormValues] = useState<VehicleMasterRecord>(() =>
    emptyForm(getNextVehicleId())
  );
  const [search, setSearch] = useState("");
  const { confirmOpen, requestConfirm, confirmSave, cancel, toast, notify, dismissToast } =
    useConfirmSave();

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

  const sections = useMemo(
    () =>
      injectFieldOptions(
        VEHICLE_MASTER_SECTIONS,
        "assignedDriverId",
        driverOptions.map((d) => ({ value: d.value, label: d.label }))
      ),
    [driverOptions]
  );

  function handleChange(name: string, value: string) {
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

  function performSave() {
    const now = new Date().toISOString();
    const wasEditing = mode === "edit";
    const record: VehicleMasterRecord = {
      ...formValues,
      addedAt: mode === "add" ? now : (formValues.addedAt || now),
      updatedAt: mode === "edit" ? now : "",
    };
    saveVehicle(record);
    setMode("none");
    setFormValues(emptyForm(getNextVehicleId()));
    refresh();
    notify(`Vehicle ${record.registrationNo || record.id} ${wasEditing ? "updated" : "saved"}.`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    requestConfirm(performSave);
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
          className="min-w-52 flex-1 rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
        {mode === "none" ? (
          <button
            type="button"
            onClick={startAdd}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
          >
            + Add Vehicle
          </button>
        ) : (
          <button
            type="button"
            onClick={cancelForm}
            className="rounded-md border border-black/15 px-4 py-2 text-sm text-black transition-colors hover:bg-black/5"
          >
            Cancel
          </button>
        )}
      </div>

      {/* ── add / edit form ── */}
      {mode !== "none" && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 space-y-5 rounded-lg border border-black/10 bg-white p-5 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-black">
              {mode === "add" ? "Add New Vehicle" : `Edit — ${formValues.registrationNo} (${formValues.id})`}
            </h3>
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-md bg-brand px-5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
              >
                {mode === "add" ? "Save Vehicle" : "Update"}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                className="rounded-md border border-black/15 px-4 py-1.5 text-sm text-black transition-colors hover:bg-black/5"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Vehicle ID (readonly) */}
          <div className="w-40">
            <FormField
              field={{ name: "id", label: "Vehicle ID (auto)", type: "text", readOnly: true }}
              value={formValues.id}
              onChange={() => {}}
            />
          </div>

          {sections.map((section) => (
            <FormSection
              key={section.id}
              title={section.title}
              columns={section.id === "ownership" ? 4 : section.id === "notes" ? 2 : 3}
            >
              {section.fields.map((field) => (
                <FormField
                  key={field.name}
                  field={field}
                  value={formValues[field.name as keyof VehicleMasterRecord] as string}
                  onChange={handleChange}
                />
              ))}
            </FormSection>
          ))}
        </form>
      )}

      {/* ── browse table ── */}
      {vehicles.length === 0 ? (
        <p className="rounded-lg border border-black/10 bg-white px-4 py-6 text-sm text-black shadow-sm">
          No vehicles added yet. Click <strong>+ Add Vehicle</strong> to register the first one.
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-black/10 bg-white px-4 py-6 text-sm text-black shadow-sm">
          No vehicles match &ldquo;{search}&rdquo;.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/10 shadow-sm">
          <table className="w-full border-collapse text-left text-xs text-black">
            <thead>
              <tr className="border-b border-black/10 bg-page">
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">Actions</th>
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">ID</th>
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">Reg No</th>
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">Type</th>
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">Make / Model</th>
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">Cap (kg)</th>
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">Owner</th>
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">Insurance</th>
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">Fitness</th>
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">PUC</th>
                <th className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">Road Tax</th>
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
                      className={`border-b border-black/10 ${isEditing ? "bg-black/5" : "hover:bg-black/5"}`}
                    >
                      <td className="whitespace-nowrap border-r border-black/10 px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => isEditing ? cancelForm() : startEdit(v)}
                            className="text-brand-text underline"
                          >
                            {isEditing ? "Cancel" : "Edit"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(v)}
                            className="text-critical underline"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                      <td className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-mono">{v.id}</td>
                      <td className="whitespace-nowrap border-r border-black/10 px-3 py-2 font-semibold">{v.registrationNo}</td>
                      <td className="whitespace-nowrap border-r border-black/10 px-3 py-2">{v.vehicleType || "—"}</td>
                      <td className="whitespace-nowrap border-r border-black/10 px-3 py-2">{v.makeModel || "—"}</td>
                      <td className="whitespace-nowrap border-r border-black/10 px-3 py-2">{v.loadCapacityKg || "—"}</td>
                      <td className="whitespace-nowrap border-r border-black/10 px-3 py-2">{v.ownerName || "—"}</td>
                      {VEHICLE_COMPLIANCE_FIELDS.map(({ key, label }, idx) => {
                        const cell = complianceCell(v[key] as string);
                        return (
                          <td
                            key={key}
                            title={label}
                            className={`whitespace-nowrap px-3 py-2 ${
                              idx < VEHICLE_COMPLIANCE_FIELDS.length - 1
                                ? "border-r border-black/10"
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

      <ConfirmDialog
        open={confirmOpen}
        message={mode === "edit" ? "Update this vehicle?" : "Save this vehicle?"}
        onConfirm={confirmSave}
        onCancel={cancel}
      />
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={dismissToast} />
      )}
    </div>
  );
}
