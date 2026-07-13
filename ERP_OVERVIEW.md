# Sahyadri Infra ERP — System Overview

> **Stack:** Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS (black-on-white, responsive down to mobile)
> **Storage:** Google Sheets is the **source of truth** (via Google Apps Script Web App). Browser localStorage is a cache — hydrated from Sheets on every app start and via the sidebar "Refresh from Sheets" button.

---

## 1. Module Map

| Module | Sidebar Label | Sub-tabs | Notes |
|--------|--------------|----------|-------|
| Cargo Transport | Cargo Transport | 6 cargo sources (tabs) | Every trip is tagged with a **Billing Company** and a **Driver** |
| Billing | Billing | — | Monthly tax invoices per company × plant × category |
| Dashboard | Dashboard | — | Vehicle & driver analytics, monthly transport P/L, filters |
| Infra & Crusher | Infra & Crusher | — | |
| Diesel Tank | Diesel Tank | — | |
| Drivers | Drivers | Driver Master · Driver Salary · **Daily Expenses** | Expenses = food, travel etc., separate from salary |
| Customer Ledger | Customer Ledger | — | |
| Material Master | Material Master | Browse · Add custom | Synced to Sheets |
| Vehicles | Vehicles | Fleet (Master) · Maintenance Log | Synced to Sheets |
| Saved Records | Saved Records | Per-type tabs · Audit Log | Audit Log tab fetches full history from Sheets |

On phones/tablets the sidebar collapses into a horizontally scrollable top nav.

---

## 2. Architecture — Sheets-First Data Flow

```
App start (or "Refresh from Sheets")
  └── GET {GAS_URL}?action=list          ← all tabs except Audit Log
        ├── replaces sahyadri_erp_records         (all form records)
        ├── replaces sahyadri_vehicle_master / _maintenance
        ├── replaces sahyadri_custom_materials
        └── replaces sahyadri_erp_bills           (rebuilt from billJson column)
      UI is blocked ("Loading data from Google Sheets…") until this finishes.
      On failure: error screen with Retry + "Continue with last synced copy".
      Records with synced === false (failed uploads) survive the replace.

Form save
  ├── written to localStorage cache immediately (instant UI)
  ├── POST to Apps Script (append / upsert)  → Sheet row
  └── audit entry appended + synced to the Audit Log tab
```

### localStorage keys (cache only)

| Key | Contents |
|-----|----------|
| `sahyadri_erp_records` | cargo, infra, pallets, diesel, drivers, salary, driver-expense, ledger |
| `sahyadri_erp_bills` | saved bills (full snapshots) |
| `sahyadri_audit_log` | rolling recent audit cache (max 1000; full history lives in the Sheet) |
| `sahyadri_custom_materials` | user-added materials |
| `sahyadri_vehicle_master` / `sahyadri_vehicle_maintenance` | fleet + service records |
| `sahyadri_last_diesel_fill` / `sahyadri_diesel_fill_history` | diesel fill refs (max 200) |
| `sahyadri_last_sheet_fetch` | timestamp of last successful Sheets fetch |

### Spreadsheet tabs

```
H19 · J14 · J15 -  J16 · Matoshri enterprise · Minerva Enterprises · Machine Shop - Shirwal
Sahyadri Infra · Return Pallets · Diesel Tank · Drivers · Salary · Driver Expenses · Ledger
Material Master · Vehicle Master · Vehicle Maintenance · Bills · Audit Log
```

**Header-row guarantee (Code.gs):** row 1 of every tab always holds the column names; data is written and read from row 2. The script self-heals: empty/blank tabs get the header written automatically, and legacy tabs whose data starts at row 1 get a header row inserted above the data on first read/write. Upsert/delete match ids from row 2 only — the header can never be edited or deleted.

**Apps Script API:**
- `POST` — `append` (default), `upsert` (match by id column), `delete` (by id)
- `GET ?action=list` — all tabs as JSON (audit excluded)
- `GET ?action=list&type=a,b` — specific tabs (e.g. `type=audit` for the audit history)

---

## 3. Event Bus (Custom DOM Events)

| Event | Fired by | Consumed by |
|-------|----------|-------------|
| `sahyadri-local-update` | `localStore.ts` on every save / update / delete / hydration | RecordsView, DieselTankForm, DriverSalaryForm, DriverExpenseForm, CargoTransportForm, BillingModule, LocalDataPanel |
| `sahyadri-material-update` | `materialStore.ts` | MaterialMasterModule, CargoTransportForm |
| `sahyadri-vehicle-update` | `vehicleStore.ts` | Vehicle forms, CargoTransportForm, DieselTankForm, InfraCrusherForm, CustomerLedgerForm |
| `sahyadri-bill-update` | `billingStore.ts` | BillingModule (saved bills list) |

---

## 4. Billing Module

Generates the two-page monthly tax invoices (page 1: rate-wise summary + GST; page 2: trip-wise detail) from saved cargo trips.

### Companies (`lib/companies.ts`)

| Company | GST | Letterhead |
|---------|-----|-----------|
| MADHSA GRAMIN ENTERPRISES | 27GTXPS8509G1ZN | `/public/madhsa-header.png` |
| SAHYADRI INFRA | 27FIBPS0630E1ZI | `/public/sahyadri-infra-header.png` |

- Every cargo trip carries a required **`billingCompany`** field — a Madhsa bill pulls only Madhsa-tagged trips (legacy untagged records match either company).
- The letterhead banner image prints at the top of both bill pages; address + proprietor/GST rows render as text below it.
- Add a company in `companies.ts` → all dropdowns, bills and letterheads follow.

### Bill categories (`lib/billingConfig.ts`, extensible)

| Category | Material codes | Behavior |
|----------|---------------|----------|
| Freight | catch-all | everything not claimed by other categories |
| Empty Pallet | 9508507, 6002594 | own bill, page-2 title "Empty Pallet Details" |
| KOPA Castings | 6002593, 6002818, 7000680 | own bill |

### Bill computation (`lib/billing.ts`)

- Trips filtered by company + plant + month (YYYY-MM) + category.
- Page 1 groups lines **rate-wise** (one row per distinct Rs/kg) → Total → CGST + SGST (GST % editable, split half/half) → Grand Total.
- Description auto-suggested from the actual routes driven that month; customer details pre-filled per plant (`PLANT_CUSTOMER_DEFAULTS`) — all editable.
- Invoice numbers auto-increment **per company**; duplicate guard blocks a second bill for the same company + plant + category + month.

### Saved bills (`lib/billingStore.ts`)

- Bills snapshot their line items — editing trips later never changes an issued invoice.
- Synced to the **Bills** tab as a flat register row; the `billJson` column holds the full snapshot so any device can reopen/print the exact bill.
- Print / Save PDF via `window.print()` — print CSS shows only the bill, one invoice page per sheet.

---

## 4b. Dashboard Module

Analytics over all saved records (`lib/dashboard.ts` + `components/dashboard/DashboardView.tsx`), filterable by month range, company, plant, vehicle and driver.

- **Trip identity:** cargo rows are per material line; the dashboard dedupes them into trips (`type|vehicleNo|date|lrNo`). Trip-level amounts (toll, diesel-used) count once per trip; per-line `transportAmount` is summed.
- **Diesel cost** = actual Diesel Tank fills (`fillAmount`), never the per-trip estimates — no double counting.
- **Driver attribution:** the trip's `driverId`, else the diesel fill's driver (via `dieselFillRef`), else the vehicle's assigned driver.
- **KPI tiles:** Revenue · Expenses · Profit/Loss · Trips · Weight.
- **Tables** (each with CSV export): per-vehicle earnings vs diesel/maintenance/toll with profit; per-driver trips, weight, salary paid, daily expenses (per-type breakdown), total cost; monthly P/L with per-company revenue split and totals row. Monochrome inline bars, no chart library.
- **Scoping rule:** company/plant/driver filters show trip revenue + toll only — shared costs (fills, maintenance, salaries) cannot be split by those filters, and the UI says so.

---

## 5. Google Sheets Column Order

### 5a. Cargo Transport (all 6 sources share same columns)

Tabs: **H19, J14, J15 - J16, Matoshri enterprise, Minerva Enterprises, Machine Shop - Shirwal**

| # | Column | # | Column |
|---|--------|---|--------|
| 1 | id (H19-000001…) | 12 | uom (EA / KG / Brass) |
| 2 | documentNo | 13 | perPartWt |
| 3 | date | 14 | totalWt |
| 4 | fromLocation | 15 | transportRate |
| 5 | toParty | 16 | transportAmount |
| 6 | vehicleNo | 17 | rateTier |
| 7 | lrNo | 18 | dieselFillRef |
| 8 | materialCode | 19 | dieselUsedThisTrip |
| 9 | materialDescription | 20 | tollOverloadAmount |
| 10 | hsnCode | 21 | receivedQty |
| 11 | quantity | 22 | receivedDate |
| | | 23 | **billingCompany** (madhsa-gramin / sahyadri-infra) |
| | | 24 | **driverId** (auto-suggested from vehicle's assigned driver) |
| | | 25 | **driverName** |

> One **row per material line** × per invoice. `billingCompany` decides which company's monthly bill the row lands on; `driverId` powers the Dashboard's driver analytics (legacy rows without it fall back to the diesel-fill driver, then the vehicle's assigned driver). Receipt values are entered per unit in the form — `receivedDate` per invoice, `receivedQty` per material line — so multi-invoice trips carry the right receipt on every row.

### 5b–5f. Other operational tabs

- **Sahyadri Infra**: id, date, vehicleNo, crusherChallanNo, materialType, crusherRate, crusherBrass, crusherAmount, diesel, challanNo, customerName, qtyBrass, rate, totalAmount, difference
- **Return Pallets**: id, date, dcNo, plant, toParty, materialCode, materialDescription, uom, qty, vehicleNo, lrNo, freightAmount, remarks, **billingCompany**
- **Diesel Tank**: id, fillRef (`VEHICLENO-YYYY-MM-DD`), date, vehicleNo, fillAmount, liters, driverId, driverName, expectedTrips, note, **ratePerLiter** (auto-calculator: amount ⇄ liters, default Rs 99.24/L)
- **Drivers**: driverId (DRV-001…), firstName, middleName, surname, mobileNumber, aadharNumber, accountNumber, totalSalary
- **Salary**: id, driverId, driverName, paymentType (Regular/Advance/Delayed), scheduledSalaryDate (1st/8th/15th/22nd), paymentDate, amount, reason
- **Driver Expenses**: id (DEX-000001…), driverId, driverName, date, expenseType (Food / Travel / Lodging / Toll / Recharge / Medical / Repair on Road / Other), amount, paymentMode (Cash / UPI / Company Account), note
- **Ledger**: id, date, receiptNo, particular, vehicleNo, rate, brass, debit, credit
- **Material Master**: id, code, name, weightPerPieceKg, ratePerKg, addedAt
- **Vehicle Master**: id, registrationNo, engineNo, chassisNo, vehicleType, makeModel, manufacturer, yearOfManufacture, loadCapacityKg, fuelType, ownershipType, ownerName, assignedDriverId, assignedDriverName, insurance/fitness/PUC/road-tax/permit fields, rtoPassingDate, notes, addedAt
- **Vehicle Maintenance**: id (MNT-0001…), vehicleId, vehicleNo, date, maintenanceType, partName, partNumber, description, vendorName, invoiceNo, labourCost, partsCost, totalCost, odometerKm, nextServiceKm, nextServiceDate, doneBy, remarks, addedAt

### 5g. Bills (invoice register)

id, invoiceNo, invoiceDate, month, company, plant, category, hsnNo, customerName, customerAddress, customerPin, customerGst, gstPercent, rateSummary, totalWeightKg, subTotal, cgst, sgst, grandTotal, description, lineCount, createdAt, **billJson** (full snapshot for reopen/print)

### 5h. Audit Log

id, timestamp, action (create/edit/delete), recordType, recordId, documentNo, summary, beforeJson, afterJson

---

## 6. Auto-Computed Fields

| Form | Trigger field | Auto-filled field(s) |
|------|--------------|---------------------|
| Cargo — material line | `materialCode` | `materialDescription`, `perPartWt`, `transportRate`, `transportAmount`, `rateTier` |
| Cargo — material line | `quantity` or `perPartWt` | `totalWt`, rate/amount recalc |
| Cargo — trip | `vehicleNo` | `dieselFillRef` (latest fill for that vehicle) |
| Billing | company / plant / category / month | invoice no, HSN, customer details, description, all totals |
| Diesel Tank | `vehicleNo` + `date` | `fillRef` |
| Diesel Tank | `fillAmount` / `liters` / `ratePerLiter` | the other of amount ⇄ liters (default rate Rs 99.24/L) |
| Diesel Tank | `driverName` | `driverId` |
| Driver Salary | `driverId` | `driverName`, `amount` (if Regular) |
| Driver Expense | `driverId` | `driverName`, month-total hint |
| Vehicle Master | `assignedDriverId` | `assignedDriverName` |
| Vehicle Maintenance | `vehicleId` / costs | `vehicleNo`, `totalCost` |

---

## 7. Transport Pricing Logic (Cargo)

### Weight-tier rates (trip total weight)

| Total trip weight | Rate |
|------------------|------|
| < 5,500 kg | Rs 0.78 / kg |
| 5,500 – 9,000 kg | Rs 0.74 / kg |
| > 9,000 kg | Rs 0.72 / kg |

### Per-material flat rate overrides (override the tier)

| Material | Code | Rate |
|----------|------|------|
| Burn Sand | 9700062 | Rs 0.60 / kg |
| Reclaimed Sand | RSAND | Rs 0.35 / kg |
| Resin Coated Sand | 6000436 | Rs 1.10 / kg |

Custom materials with a `ratePerKg` also override the tier. Mixed-rate trips show "Mixed rates · Rs Y/kg effective avg" in the Transport Summary.

---

## 8. Save Confirmation Flow

Every form save goes through a **ConfirmDialog**. The Cargo form shows a full review of the entry (trip details, invoices + material lines, weights, amount, expenses) with three actions:

| Button | Color | Effect |
|--------|-------|--------|
| Confirm & Save | green | saves the entry |
| Delete Entry | red | discards + clears the form (cargo form only) |
| Edit | plain | back to the form, values kept |

---

## 9. Auto-ID Sequences

| Entity | Format | Derived from |
|--------|--------|-------------|
| Cargo rows | H19-000001, J14-…, MTS-…, MIN-…, MCS-…, J1516-… | records of that type |
| Infra / Pallets / Diesel / Salary / Ledger | INF- / PAL- / DSL- / SAL- / LED-000001 | records of that type |
| Driver expense | DEX-000001 | records of that type |
| Driver | DRV-001 | drivers records |
| Vehicle / Maintenance | VEH-001 / MNT-0001 | vehicle stores |
| Bill invoice no | numeric, **per company** (Madhsa and Sahyadri run separate sequences) | saved bills |

---

## 10. Vehicle Compliance Tracking

Insurance / Fitness / PUC / Road Tax / Permit expiry dates are monitored; fleet table sorts by nearest expiry and bolds items expired or expiring within 30 days. Helpers in `vehicleStore.ts`: `getExpiringCompliance(daysAhead)`, `getMaintenanceCostSummary(vehicleId)`, `getVehicleNoOptions()`.

---

## 11. Audit Log

**Everything is logged**: form-entry creations (one entry per submission), edits/deletes in Saved Records, bill save/delete, vehicle + maintenance changes, material changes. Hydration refreshes are not logged (not user actions).

- Each entry: id, timestamp, action (create/edit/delete), recordType, recordId, documentNo, one-line summary, full before/after JSON snapshots.
- Pushed to the Sheet's **Audit Log** tab (unlimited history); localStorage keeps the most recent 1000 as an offline cache.
- **Saved Records → Audit Log** fetches the full history from the Sheet when opened (`?type=audit`), falling back to the local cache offline. Searchable by action, type, id, invoice no, or summary.
- The audit history is excluded from the startup data sweep so app start stays fast.

---

## 12. Saved Records View

Tabs: Cargo Transport · Infra & Crusher · Diesel Tank · Driver Master · Driver Salaries · **Driver Expenses** · Customer Ledger · Audit Log.

Per tab: search, Export CSV, inline Edit, Delete with confirm — every edit/delete writes an audit entry. Failed Sheet uploads can be retried from here. Vehicle Master/Maintenance are managed in the Vehicles module instead.

---

## 13. File Structure

```
erp/
├── ERP_OVERVIEW.md                  ← this file
├── frontend/erp/
│   ├── public/
│   │   ├── madhsa-header.png        letterhead banners printed on bills
│   │   └── sahyadri-infra-header.png
│   ├── components/
│   │   ├── dashboard/
│   │   │   └── DashboardView.tsx    (filters, KPIs, vehicle/driver/P-L tables)
│   │   ├── billing/
│   │   │   ├── BillingModule.tsx    (bill setup, preview, saved bills)
│   │   │   └── BillPreview.tsx      (2-page invoice, print layout)
│   │   ├── forms/
│   │   │   ├── CargoTransportForm.tsx (+ full-entry confirm review)
│   │   │   ├── DieselTankForm.tsx
│   │   │   ├── DriverMasterForm.tsx
│   │   │   ├── DriverSalaryForm.tsx
│   │   │   ├── DriverExpenseForm.tsx  (daily expenses: food, travel…)
│   │   │   ├── DriversModule.tsx      (3 tabs)
│   │   │   ├── MaterialMasterModule.tsx
│   │   │   ├── ModuleForms.tsx
│   │   │   ├── SheetForm.tsx
│   │   │   └── Vehicle*.tsx
│   │   ├── layout/
│   │   │   ├── AppShell.tsx         (responsive shell, sheets-first loading gate)
│   │   │   └── LocalDataPanel.tsx   (Refresh from Sheets, export)
│   │   ├── ui/                      (FormField, FormSection, ConfirmDialog with
│   │   │                             review content + green/red actions, Toast)
│   │   └── views/RecordsView.tsx    (records + sheet-backed audit tab)
│   └── lib/
│       ├── api.ts                   (submitToSheet, syncMasterRecord, retrySync,
│       │                             audit entry per form submission)
│       ├── auditLog.ts              (audit entries + Sheet sync)
│       ├── billing.ts               (bill line collection, rate groups, GST)
│       ├── billingConfig.ts         (categories, plant customer defaults)
│       ├── billingStore.ts          (saved bills + Bills-tab sync)
│       ├── companies.ts             (company master + letterheads)
│       ├── dashboard.ts             (trip dedup + vehicle/driver/monthly P-L aggregations)
│       ├── dieselUtils.ts
│       ├── driverStore.ts
│       ├── localStore.ts            (records cache + id sequences)
│       ├── materialMaster.ts        (built-in materials + weight-tier calc)
│       ├── materialStore.ts
│       ├── recordColumns.ts         (RECORD_VIEWS + CSV export)
│       ├── sheetConfig.ts           (MODULES, all field configs)
│       ├── sheetFetch.ts            (refreshFromSheets, fetchAuditLog)
│       ├── storageMode.ts
│       ├── types.ts
│       └── vehicleStore.ts
└── google-apps-script/
    └── Code.gs                      (doPost append/upsert/delete, doGet list API,
                                      header-row guarantee on every tab)
```

---

## 14. Adding a New Record Type (checklist)

1. Add the `SheetType` to `lib/types.ts`
2. Add its field config array to `lib/sheetConfig.ts`
3. Add an id prefix to `ID_PREFIXES` in `lib/localStore.ts`
4. Add the tab name to `SHEET_MAP` + column order to `COLUMN_ORDER` in `google-apps-script/Code.gs` (redeploy)
5. Add the type to `RECORD_TYPES` + `TYPE_LABELS` in `lib/sheetFetch.ts` (so it hydrates from Sheets)
6. Add a view config to `RECORD_VIEWS` in `lib/recordColumns.ts`
7. Create the form component in `components/forms/` and register it (sidebar module in `MODULES`/`FORM_MAP`, or a tab inside an existing module)
8. Create the tab in the spreadsheet — headers are written automatically on first save/read
