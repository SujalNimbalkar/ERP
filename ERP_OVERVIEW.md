# Sahyadri Infra ERP — System Overview

> **Stack:** Next.js 15 (App Router, Turbopack) · TypeScript · Tailwind CSS (black-on-white)  
> **Dual storage:** Browser localStorage (default offline) → Google Sheets via Google Apps Script (when URL is configured)

---

## 1. Module Map

| Module | Sidebar Label | Sub-tabs | Storage |
|--------|--------------|----------|---------|
| Cargo Transport | Cargo Transport | 6 cargo sources (tabs) | localStorage + Sheets |
| Infra & Crusher | Infra & Crusher | — | localStorage + Sheets |
| Diesel Tank | Diesel Tank | — | localStorage + Sheets |
| Drivers | Drivers | Driver Master · Driver Salary | localStorage + Sheets |
| Customer Ledger | Customer Ledger | — | localStorage + Sheets |
| Material Master | Material Master | Browse · Add custom | localStorage only* |
| Vehicles | Vehicles | Fleet (Master) · Maintenance Log | localStorage only* |
| Saved Records | Saved Records | Per-type tabs · Audit Log | reads localStorage |

\* Planned for Sheets migration — column mapping already in Code.gs.

---

## 2. Architecture

```
Browser
├── localStorage  ← primary offline store
│   ├── sahyadri_erp_records          (cargo, infra, diesel, drivers, salary, ledger)
│   ├── sahyadri_audit_log            (edit / delete history, max 500)
│   ├── sahyadri_custom_materials     (user-added materials)
│   ├── sahyadri_vehicle_master       (fleet records)
│   ├── sahyadri_vehicle_maintenance  (service / repair records)
│   ├── sahyadri_last_diesel_fill     (last fill per session)
│   └── sahyadri_diesel_fill_history  (last 200 fills, for cargo auto-suggest)
│
└── Google Apps Script Web App  ← optional cloud sync
    └── Google Spreadsheet
        ├── H19
        ├── J14
        ├── J15 -  J16
        ├── Matoshri enterprise
        ├── Minerva Enterprises
        ├── Machine Shop - Shirwal
        ├── Sahyadri Infra
        ├── Return Pallets         (reserved)
        ├── Diesel Tank
        ├── Drivers
        ├── Salary
        ├── Ledger
        ├── Material Master        (future)
        ├── Vehicle Master         (future)
        └── Vehicle Maintenance    (future)
```

---

## 3. Event Bus (Custom DOM Events)

All cross-module live updates use `window.dispatchEvent` / `window.addEventListener`.

| Event | Fired by | Consumed by |
|-------|----------|-------------|
| `sahyadri-local-update` | `localStore.ts` on every save / update / delete | RecordsView, DieselTankForm (driver list), DriverSalaryForm, CargoTransportForm (diesel fill list) |
| `sahyadri-material-update` | `materialStore.ts` on add / delete custom material | MaterialMasterModule, CargoTransportForm |
| `sahyadri-vehicle-update` | `vehicleStore.ts` on any fleet / maintenance change | VehicleMasterForm, VehicleMaintenanceForm, CargoTransportForm, DieselTankForm, InfraCrusherForm, CustomerLedgerForm |

---

## 4. Inter-Module Dependencies

```
Vehicle Master ──────────────────────────────────────────────────────┐
  vehicleNo options live-synced via sahyadri-vehicle-update           │
  ↓ injects select dropdown into:                                     │
  ├── Cargo Transport  (vehicleNo field, trip level)                  │
  ├── Diesel Tank      (vehicleNo field → also auto-builds fillRef)   │
  ├── Infra & Crusher  (vehicleNo field)                              │
  ├── Customer Ledger  (vehicleNo field)                              │
  └── Vehicle Maintenance (vehicleId select → vehicleNo auto-fill)   │
                                                                      │
Driver Master ────────────────────────────────────────────────────────┤
  driverOptions live-synced via sahyadri-local-update                 │
  ↓                                                                   │
  ├── Diesel Tank      (driverName select → driverId auto-fill)       │
  └── Driver Salary    (driverId select → driverName + amount auto)   │
                                                                      │
Material Master ──────────────────────────────────────────────────────┤
  getAllMaterials() called on materialCode change                      │
  ↓ auto-fills into Cargo Transport per material line:                │
  ├── materialDescription  (name)                                     │
  ├── perPartWt            (weightPerPieceKg)                         │
  └── transportRate        (ratePerKg if set, else weight-tier)       │
                                                                      │
Diesel Tank ──────────────────────────────────────────────────────────┘
  fillRef saved to sahyadri_diesel_fill_history (max 200)
  ↓ auto-suggests in Cargo Transport:
  └── dieselFillRef dropdown (filtered to same vehicleNo)
```

---

## 5. Google Sheets Column Order

### 5a. Cargo Transport (all 6 sources share same columns)

Sheet tabs: **H19, J14, J15 - J16, Matoshri enterprise, Minerva Enterprises, Machine Shop - Shirwal**

| # | Column | Source |
|---|--------|--------|
| 1 | documentNo | Invoice / DC No (per invoice) |
| 2 | date | Date (per invoice) |
| 3 | fromLocation | Auto-filled from source tab |
| 4 | toParty | Destination (select) |
| 5 | vehicleNo | Vehicle select (from Vehicle Master) |
| 6 | lrNo | L.R. No. |
| 7 | materialCode | Material code (per line) |
| 8 | materialDescription | Auto-filled from Material Master |
| 9 | hsnCode | HSN / SAC code |
| 10 | quantity | Qty (per line) |
| 11 | uom | EA / KG / Brass |
| 12 | perPartWt | Per piece weight kg (auto from Material Master) |
| 13 | totalWt | Total weight kg (qty × perPartWt) |
| 14 | transportRate | Rs/kg — material rate or weight-tier |
| 15 | transportAmount | totalWt × transportRate |
| 16 | rateTier | "Material rate — Rs X/kg" or tier label |
| 17 | dieselFillRef | Fill ref (format: VEHICLENO-YYYY-MM-DD) |
| 18 | dieselUsedThisTrip | Diesel share for this trip (Rs) |
| 19 | tollOverloadAmount | Toll + overload charges (Rs) |
| 20 | receivedQty | Received quantity (optional) |
| 21 | receivedDate | Received date (optional) |

> One **row per material line** × per invoice. A single trip can produce multiple rows.

### 5b. Sahyadri Infra

| # | Column |
|---|--------|
| 1 | date |
| 2 | vehicleNo |
| 3 | crusherChallanNo |
| 4 | materialType |
| 5 | crusherRate |
| 6 | crusherBrass |
| 7 | crusherAmount |
| 8 | diesel |
| 9 | challanNo |
| 10 | customerName |
| 11 | qtyBrass |
| 12 | rate |
| 13 | totalAmount |
| 14 | difference |

### 5c. Diesel Tank

| # | Column | Note |
|---|--------|------|
| 1 | fillRef | Auto: `VEHICLENO-YYYY-MM-DD` |
| 2 | date | Fill date |
| 3 | vehicleNo | Vehicle select |
| 4 | fillAmount | Total paid (Rs) |
| 5 | liters | Liters filled |
| 6 | driverId | Auto-filled from driverName selection |
| 7 | driverName | Driver select (label: "DRV-001 - Name") |
| 8 | expectedTrips | How many trips this fill covers |
| 9 | note | Free text |

### 5d. Drivers

| # | Column | Note |
|---|--------|------|
| 1 | driverId | Auto: DRV-001, DRV-002… |
| 2 | firstName | |
| 3 | middleName | |
| 4 | surname | |
| 5 | mobileNumber | |
| 6 | aadharNumber | |
| 7 | accountNumber | |
| 8 | totalSalary | Used as default in Salary form |

### 5e. Salary

| # | Column | Note |
|---|--------|------|
| 1 | driverId | Select → joins to Drivers sheet |
| 2 | driverName | Auto-filled from driverId |
| 3 | paymentType | Regular / Advance / Delayed |
| 4 | scheduledSalaryDate | 1st / 8th / 15th / 22nd |
| 5 | paymentDate | Actual payment date |
| 6 | amount | Defaults to driver's totalSalary for Regular |
| 7 | reason | Required for Advance / Delayed |

### 5f. Ledger

| # | Column |
|---|--------|
| 1 | date |
| 2 | receiptNo |
| 3 | particular |
| 4 | vehicleNo |
| 5 | rate |
| 6 | brass |
| 7 | debit |
| 8 | credit |

### 5g. Material Master *(localStorage → Sheets, future)*

| # | Column | Note |
|---|--------|------|
| 1 | id | Slug ID |
| 2 | code | SAP / material code |
| 3 | name | Display name |
| 4 | weightPerPieceKg | Per-piece weight; auto-fills cargo form |
| 5 | ratePerKg | Flat Rs/kg — overrides weight-tier in cargo |
| 6 | addedAt | ISO timestamp |

### 5h. Vehicle Master *(localStorage → Sheets, future)*

| # | Column | # | Column |
|---|--------|---|--------|
| 1 | id | 14 | assignedDriverName |
| 2 | registrationNo | 15 | insurancePolicyNo |
| 3 | engineNo | 16 | insuranceCompany |
| 4 | chassisNo | 17 | insuranceValidUpto |
| 5 | vehicleType | 18 | fitnessValidUpto |
| 6 | makeModel | 19 | pucValidUpto |
| 7 | manufacturer | 20 | roadTaxValidUpto |
| 8 | yearOfManufacture | 21 | permitType |
| 9 | loadCapacityKg | 22 | permitValidUpto |
| 10 | fuelType | 23 | rtoPassingDate |
| 11 | ownershipType | 24 | notes |
| 12 | ownerName | 25 | addedAt |
| 13 | assignedDriverId | | |

### 5i. Vehicle Maintenance *(localStorage → Sheets, future)*

| # | Column | Note |
|---|--------|------|
| 1 | id | MNT-0001, MNT-0002… |
| 2 | vehicleId | FK → Vehicle Master id |
| 3 | vehicleNo | Denormalized reg no (readable without VLOOKUP) |
| 4 | date | Service date |
| 5 | maintenanceType | Oil Change / Full Service / Tyre… |
| 6 | partName | |
| 7 | partNumber | |
| 8 | description | Work done |
| 9 | vendorName | Workshop / supplier |
| 10 | invoiceNo | |
| 11 | labourCost | Rs |
| 12 | partsCost | Rs |
| 13 | totalCost | Auto: labourCost + partsCost |
| 14 | odometerKm | Reading at service |
| 15 | nextServiceKm | Due at km |
| 16 | nextServiceDate | Due date |
| 17 | doneBy | Mechanic / driver |
| 18 | remarks | |
| 19 | addedAt | ISO timestamp |

---

## 6. Auto-Computed Fields

| Form | Trigger field | Auto-filled field(s) |
|------|--------------|---------------------|
| Cargo — material line | `materialCode` | `materialDescription`, `perPartWt`, `transportRate`, `transportAmount`, `rateTier` |
| Cargo — material line | `quantity` or `perPartWt` | `totalWt`, `transportRate`, `transportAmount`, `rateTier` |
| Cargo — trip | `vehicleNo` | `dieselFillRef` (suggests latest fill for that vehicle) |
| Diesel Tank | `vehicleNo` + `date` | `fillRef` (`VEHICLENO-YYYY-MM-DD`) |
| Diesel Tank | `driverName` | `driverId` |
| Driver Salary | `driverId` | `driverName`, `amount` (if Regular Salary) |
| Vehicle Master | `assignedDriverId` | `assignedDriverName` |
| Vehicle Maintenance | `vehicleId` | `vehicleNo` |
| Vehicle Maintenance | `labourCost` or `partsCost` | `totalCost` |

---

## 7. Transport Pricing Logic (Cargo)

### Weight-tier rates (trip total weight)

| Total trip weight | Rate |
|------------------|------|
| < 5,500 kg | Rs 0.78 / kg |
| 5,500 – 9,000 kg | Rs 0.74 / kg |
| > 9,000 kg | Rs 0.72 / kg |

### Per-material flat rate overrides

These **override** the weight-tier when the material code is matched:

| Material | Code | Rate |
|----------|------|------|
| Burn Sand | 9700062 | Rs 0.60 / kg |
| Reclaimed Sand | RSAND | Rs 0.35 / kg |
| Resin Coated Sand | RCSAND | Rs 1.10 / kg |

> Custom materials added via Material Master can also have a `ratePerKg` set, which overrides the tier.

### Rate applied per line

```
getLineEffectiveRate(line, tripCalc):
  if material.ratePerKg is set  →  use material.ratePerKg
  else                          →  use tripCalc.transportRate (weight-tier)
```

### Transport Summary display logic

| Situation | Rate card shows |
|-----------|----------------|
| All lines use same tier rate | "Rs X/kg · Tier label" |
| All lines use same material rate | "Rs X/kg · Material rate" |
| Mixed (some tier, some material, or different material rates) | "Mixed rates · Rs Y/kg effective avg" |

---

## 8. Diesel Fill Reference Flow

```
Diesel Tank Form
  vehicleNo + date  →  fillRef = "MH11CH2030-2026-07-03"
  On save:
    ├── Written to Diesel Tank sheet
    ├── Saved to sahyadri_last_diesel_fill (last fill display)
    └── Appended to sahyadri_diesel_fill_history (max 200 entries)

Cargo Transport Form
  On vehicleNo change:
    └── listDieselFillsByVehicle(vehicleNo)
        → populates dieselFillRef dropdown
        → latest fill for that vehicle is pre-selected
```

---

## 9. Auto-ID Sequences

| Entity | Format | Storage |
|--------|--------|---------|
| Driver | DRV-001, DRV-002 | Derived from `sahyadri_erp_records` (type=drivers) |
| Vehicle | VEH-001, VEH-002 | Derived from `sahyadri_vehicle_master` |
| Maintenance record | MNT-0001, MNT-0002 | Derived from `sahyadri_vehicle_maintenance` |

> IDs are computed by reading existing records and incrementing the max numeric suffix. Safe for offline use — no server sequence needed.

---

## 10. Vehicle Compliance Tracking

Five date fields on each vehicle are monitored:

| Field | Label |
|-------|-------|
| insuranceValidUpto | Insurance |
| fitnessValidUpto | Fitness |
| pucValidUpto | PUC |
| roadTaxValidUpto | Road Tax |
| permitValidUpto | Permit |

**Fleet browse table** sorts vehicles by nearest expiry date (most urgent first). Cells are **bold** when expired or expiring within 30 days.

**Dashboard-ready functions** (from `vehicleStore.ts`):

```typescript
// All compliance items expiring within N days, sorted by urgency
getExpiringCompliance(daysAhead?: number)
  → [{ vehicleId, vehicleNo, label, validUpto, daysLeft }]

// Maintenance spend per vehicle
getMaintenanceCostSummary(vehicleId)
  → { total, thisYear, last30Days, count }

// Registration numbers for dropdowns across all forms
getVehicleNoOptions()
  → string[]   // ["MH11CH2030", "MH11CH2031", ...]
```

---

## 11. Audit Log

Stored in `sahyadri_audit_log` (localStorage), capped at 500 entries.

| Field | Type | Description |
|-------|------|-------------|
| id | string | UUID |
| action | "edit" \| "delete" | |
| recordId | string | ID of the affected LocalRecord |
| recordType | string | SheetType of the record |
| timestamp | string | ISO datetime |
| before | object | Full data snapshot before change |
| after | object \| undefined | Full data snapshot after edit (absent for delete) |

Accessible in **Saved Records → Audit Log tab**. Searchable by action, record type, or record ID.

---

## 12. Saved Records View

Shows all `sahyadri_erp_records` entries. Tabs:

| Tab | Types shown |
|-----|------------|
| Cargo Transport | cargo-h19, cargo-j14, cargo-j15-j16, cargo-matoshri, cargo-minerva, cargo-machine-shop |
| Infra & Crusher | infra |
| Diesel Tank | diesel |
| Driver Master | drivers |
| Driver Salaries | salary |
| Customer Ledger | ledger |
| Audit Log | reads `sahyadri_audit_log` (separate key) |

Features per tab: search, Export CSV, Edit inline (4-column grid, columns ordered by view config), Delete with confirm. Every edit and delete writes to the Audit Log.

> **Vehicle Master** and **Vehicle Maintenance** are managed directly in the Vehicles module and do not appear in Saved Records — they have their own browse/edit/delete UI.

---

## 13. File Structure

```
erp/
├── ERP_OVERVIEW.md                  ← this file
├── frontend/erp/
│   ├── app/                         next.js app router
│   ├── components/
│   │   ├── forms/
│   │   │   ├── CargoTransportForm.tsx
│   │   │   ├── DieselTankForm.tsx
│   │   │   ├── DriverMasterForm.tsx
│   │   │   ├── DriverSalaryForm.tsx
│   │   │   ├── DriversModule.tsx
│   │   │   ├── MaterialMasterModule.tsx
│   │   │   ├── ModuleForms.tsx      (InfraCrusherForm, CustomerLedgerForm)
│   │   │   ├── SheetForm.tsx        (generic form component)
│   │   │   ├── VehicleMasterForm.tsx
│   │   │   ├── VehicleMaintenanceForm.tsx
│   │   │   └── VehicleModule.tsx
│   │   ├── layout/
│   │   │   ├── AppShell.tsx         (sidebar + main area)
│   │   │   └── LocalDataPanel.tsx   (export / clear panel)
│   │   ├── ui/
│   │   │   ├── FormField.tsx        (text / number / date / select / textarea)
│   │   │   ├── FormSection.tsx
│   │   │   └── StatusMessage.tsx
│   │   └── views/
│   │       └── RecordsView.tsx
│   └── lib/
│       ├── api.ts                   (submitToSheet → GAS or localStorage)
│       ├── auditLog.ts              (append / read audit entries)
│       ├── dieselUtils.ts           (fillRef build + history)
│       ├── driverStore.ts           (getDriverOptions, findDriverById, getNextDriverId)
│       ├── localStore.ts            (save / get / update / delete LocalRecord)
│       ├── materialMaster.ts        (built-in material list + calcCargoTransportByWeight)
│       ├── materialRates.ts
│       ├── materialStore.ts         (custom materials CRUD + findMaterialByCodeAll)
│       ├── recordColumns.ts         (RECORD_VIEWS config + CSV export helpers)
│       ├── sheetConfig.ts           (MODULES, all field configs, CARGO_SOURCES)
│       ├── storageMode.ts           (isLocalStorageMode, storageModeLabel)
│       ├── types.ts                 (SheetType, FieldConfig, LocalRecord, etc.)
│       └── vehicleStore.ts          (fleet + maintenance CRUD + dashboard helpers)
└── google-apps-script/
    └── Code.gs                      (doPost → append rows to Sheets)
```

---

## 14. Adding a New Module (checklist)

1. Add `SheetType` to `lib/types.ts`
2. Add field config array to `lib/sheetConfig.ts`
3. Add module entry to `MODULES` in `lib/sheetConfig.ts`
4. Add sheet tab name + column order to `google-apps-script/Code.gs`
5. Add view config to `RECORD_VIEWS` in `lib/recordColumns.ts`
6. Create form component in `components/forms/`
7. Register in `FORM_MAP` in `components/layout/AppShell.tsx`
