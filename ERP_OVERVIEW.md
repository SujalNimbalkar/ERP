# Sahyadri Infra ERP — System Overview

> **Stack:** Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS (black-on-white, responsive down to mobile)
> **Storage:** Google Sheets is the **source of truth** (via Google Apps Script Web App). Browser localStorage is a cache — hydrated per module as you navigate, and in full via the sidebar "Refresh from Sheets" button.
> **Access:** Firebase email/password sign-in, admin-provisioned accounts only (no self-signup).

---

## 1. Module Map

Real Next.js routes, one per module — `/dashboard`, `/cargo`, `/infra`, etc. — under a shared route-group layout that renders the sidebar/mobile chrome once and swaps module content underneath it.

| Route | Sidebar Label | Sub-tabs | Notes |
|-------|--------------|----------|-------|
| `/dashboard` | Dashboard | — | Vehicle & driver analytics, monthly transport P/L, filters |
| `/cargo` | Cargo Transport | 6 cargo sources (tabs) | Every trip is tagged with a **Billing Company** and a **Driver**; Confirm & Save auto-captures a receipt image to Drive |
| `/infra` | Infra & Crusher | — | Every trip links to a **Client Company / Project** (pick existing or add new inline) |
| `/diesel` | Diesel Tank | — | |
| `/payroll` | Payroll | — | |
| `/billing` | Billing | Cargo Transport · Infra & Crusher | Two independent invoice generators sharing one Bills tab (`moduleType` discriminator); both have a Save as Excel button |
| `/drivers` | Drivers | Driver Master · Driver Salary · **Daily Expenses** | Expenses = food, travel etc., separate from salary |
| `/staff` | Staff Master | — | Accountants, Hamals, etc. |
| `/ledger` | Customer Ledger | — | |
| `/materials` | Material Master | Browse · Add custom | Synced to Sheets |
| `/parties` | Plants & Vendors | — | Locations master; also drives Cargo's per-plant tabs |
| `/vehicles` | Vehicles | Fleet (Master) · Maintenance Log | Synced to Sheets |
| `/records` | Saved Records | Per-type tabs · Audit Log | Audit Log tab fetches full history from Sheets |
| `/login` | — | — | Only reachable signed-out; redirects to `/dashboard` if already signed in |

On phones/tablets the sidebar collapses into a compact top bar: a hamburger button opens the module list as a left-edge drawer that slides in over the page (dimmed backdrop, closes on backdrop tap/✕/navigation), and a profile avatar on the right opens the signed-in email + Sign out.

---

## 2. Architecture — Routes, Auth Gate, Per-Module Sheets Fetch

```
app/
├── page.tsx                 → redirects to /dashboard (or /login, via proxy.ts)
├── login/page.tsx            sign-in card
├── (app)/layout.tsx          reads the session, renders ChromeBoundary → AppChrome
├── (app)/<module>/page.tsx   one per module — thin, just <ModuleClient id="…"/>
└── actions/
    ├── auth.ts                loginWithPassword / logout server actions
    └── sheets.ts               listSheets / appendRows / upsertRow / deleteRow / uploadTripReceipt

proxy.ts (Next 16's renamed middleware) — route-level gate:
  no session + auth configured → redirect to /login?next=<path>
  session + visiting /login    → redirect to /dashboard
  auth not configured yet      → everything passes through (keeps the app usable pre-setup)
```

**Auth** — Firebase email/password, admin-provisioned accounts (create/reset in the Firebase console → Authentication → Users; no self-signup UI). The password exchange happens server-side against Firebase's Identity Toolkit REST API (`lib/server/auth.ts:firebaseSignIn`) — the browser never loads the Firebase SDK or sees the API key. On success a 7-day HS256 JWT is set as an `httpOnly` cookie (`sahyadri_session`); `lib/authShared.ts` holds the cookie name + verify logic shared between `proxy.ts` (edge-safe, no `next/headers`) and the server-only `lib/server/auth.ts`. The session carries a `role` field (everyone is `"admin"` today) so per-role module gating can be added later without re-issuing sessions. Server actions in `app/actions/sheets.ts` re-check the session themselves (`sessionAllowed()`) — the proxy redirect is UX, not the only lock. Both `AUTH_SECRET` and `FIREBASE_API_KEY` are server-only env vars; with either missing, auth is simply off (matches the existing "cloud sync optional" pattern).

**Per-module data fetch** (`lib/moduleData.ts` + `lib/sheetFetch.ts`) — each module route declares the Sheet types it actually needs (`MODULE_SHEET_TYPES`, e.g. `/cargo` needs `cargo, trip-expense, diesel, drivers, materials, locations, vehicle-master, vehicle-maintenance`; `/materials` needs only `materials`). Opening a route fetches only its types, and only the ones not already fetched in the last 5 minutes this session (`getStaleTypes`) — instead of the old startup sweep that pulled every tab on every load. `/records` is the one exception: it needs the full sweep (`ALL_SYNC_TYPES`) since it displays every type. The sidebar's "Refresh from Sheets" button still does a full sweep on demand.

```
Visiting a module route
  └── refreshModuleData(moduleId) → only that module's stale types
        ├── replaces the matching localStorage caches (records / vehicles /
        │     materials / bills / locations / staff / clients — whichever
        │     types were actually requested; others are left untouched)
        └── stamps per-type freshness (in-memory, resets on reload)
      One shared loading screen (animated truck + message) covers every
      wait — first-ever load, a later sync, and lazy module-code loading
      all render the same card, so state changes underneath are invisible.
      On failure: error card with Retry + "Continue with last synced copy"
      (first run) or a slim retry banner over the last cached copy (later syncs).

Form save
  ├── written to localStorage cache immediately (instant UI)
  ├── POST to Apps Script (append / upsert)  → Sheet row
  └── audit entry appended + synced to the Audit Log tab
```

**Module code loading** (`components/layout/moduleRegistry.tsx`) — each module component is its own `next/dynamic({ ssr: false })` chunk, so visiting a route only downloads that module's JS. `ChromeBoundary.tsx` does the same for the whole chrome (`AppChrome` reads localStorage on mount, so it must never render on the server).

### localStorage keys (cache only)

| Key | Contents |
|-----|----------|
| `sahyadri_erp_records` | cargo, infra, pallets, diesel, drivers, salary, driver-expense, ledger, trip-expense |
| `sahyadri_erp_bills` | saved Cargo bills (full snapshots) |
| `sahyadri_erp_infra_bills` | saved Infra & Crusher bills (full snapshots, `moduleType: "infra"`) |
| `sahyadri_audit_log` | rolling recent audit cache (max 1000; full history lives in the Sheet) |
| `sahyadri_custom_materials` | user-added materials |
| `sahyadri_custom_locations` | plants & vendors master |
| `sahyadri_staff_master` | staff master |
| `sahyadri_custom_clients` | Infra & Crusher client company / project master |
| `sahyadri_vehicle_master` / `sahyadri_vehicle_maintenance` | fleet + service records |
| `sahyadri_last_diesel_fill` / `sahyadri_diesel_fill_history` | diesel fill refs (max 200) |
| `sahyadri_last_sheet_fetch` | timestamp of last successful Sheets fetch |

### Spreadsheet tabs

```
Cargo Trips (unified; legacy per-plant tabs H19/J14/J15 - J16/Matoshri/Minerva/Machine Shop
             kept only as an untouched historical backup)
Sahyadri Infra · Return Pallets · Diesel Tank · Drivers · Salary · Driver Expenses · Ledger
Trip Expenses · Material Master · Vehicle Master · Vehicle Maintenance · Locations
Staff Master · Client Companies · Bills · Audit Log
```

**Header-row guarantee (Code.gs):** row 1 of every tab always holds the column names; data is written and read from row 2. The script self-heals: empty/blank tabs get the header written automatically, and legacy tabs whose data starts at row 1 get a header row inserted above the data on first read/write. Upsert/delete match ids from row 2 only — the header can never be edited or deleted.

**Apps Script API:**
- `POST` — `append` (default), `upsert` (match by id column), `delete` (by id), `uploadImage` (receipt photo → Drive, see §4c)
- `GET ?action=list` — all tabs as JSON (audit excluded)
- `GET ?action=list&type=a,b` — specific tabs (e.g. `type=audit` for the audit history, or a module's own subset per `MODULE_SHEET_TYPES`)

---

## 3. Event Bus (Custom DOM Events)

| Event | Fired by | Consumed by |
|-------|----------|-------------|
| `sahyadri-local-update` | `localStore.ts` on every save / update / delete / hydration | RecordsView, DieselTankForm, DriverSalaryForm, DriverExpenseForm, CargoTransportForm, BillingModule, LocalDataPanel |
| `sahyadri-material-update` | `materialStore.ts` | MaterialMasterModule, CargoTransportForm |
| `sahyadri-vehicle-update` | `vehicleStore.ts` | Vehicle forms, CargoTransportForm, DieselTankForm, InfraCrusherForm, CustomerLedgerForm |
| `sahyadri-bill-update` | `billingStore.ts` | CargoBillingModule (saved bills list) |
| `sahyadri-client-update` | `clientStore.ts` | InfraCrusherForm, InfraBillingModule |

---

## 4. Billing Module

Two independent sub-sections under one Billing tab, switched by an in-page tab bar (`BillingModule.tsx`) — Cargo and Infra & Crusher have separate invoice-number sequences and separate line-item logic, but share the same **Bills** Sheet tab (an inline `moduleType` field in the `billJson` snapshot tells them apart; each side's `replaceWithSheet*` skips rows tagged for the other).

### 4a. Cargo Transport Billing (`CargoBillingModule.tsx`)

Generates the two-page monthly tax invoices (page 1: rate-wise summary + GST; page 2: trip-wise detail) from saved cargo trips.

#### Companies (`lib/companies.ts`)

| Company | GST | Letterhead |
|---------|-----|-----------|
| MADHSA GRAMIN ENTERPRISES | 27GTXPS8509G1ZN | `/public/madhsa-header.png` |
| SAHYADRI INFRA | 27FIBPS0630E1ZI | `/public/sahyadri-infra-header.png` |

- Every cargo trip carries a required **`billingCompany`** field — a Madhsa bill pulls only Madhsa-tagged trips (legacy untagged records match either company).
- The letterhead banner image prints at the top of both bill pages; address + proprietor/GST rows render as text below it.
- Add a company in `companies.ts` → all dropdowns, bills and letterheads follow.

#### Bill categories (`lib/billingConfig.ts`, extensible)

| Category | Material codes | Behavior |
|----------|---------------|----------|
| Freight | catch-all | everything not claimed by other categories |
| Empty Pallet | 9508507, 6002594 | own bill, page-2 title "Empty Pallet Details" |
| KOPA Castings | 6002593, 6002818, 7000680 | own bill |

#### Bill computation (`lib/billing.ts`)

- Trips filtered by company + plant + month (YYYY-MM) + category.
- Page 1 groups lines **rate-wise** (one row per distinct Rs/kg) → Total → CGST + SGST (GST % editable, split half/half) → Grand Total.
- Description auto-suggested from the actual routes driven that month; customer details pre-filled per plant (`PLANT_CUSTOMER_DEFAULTS`) — all editable.
- Invoice numbers auto-increment **per company**; duplicate guard blocks a second bill for the same company + plant + category + month.

### 4b. Infra & Crusher Billing (`InfraBillingModule.tsx`, `InfraBillPreview.tsx`)

Same two-page tax-invoice shape, driven by Infra & Crusher trips instead.

- Bills group by **Client Company/Project + Material Type + Month** (`lib/infraBilling.ts`); the Client/Project is picked from the `clients` master (`lib/clientStore.ts`), which can also be added inline from the Infra & Crusher form itself.
- GST defaults to 5% (2.5 CGST + 2.5 SGST via `lib/infraBillingConfig.ts:INFRA_GST_PERCENT_DEFAULT`), editable per bill like Cargo.
- HSN is auto-suggested per material from the last-used bill for that material (`suggestHsnForMaterial`) — never hardcoded.
- Runs its own invoice-number sequence, independent of Cargo's (`suggestNextInfraInvoiceNo` in `billingStore.ts`).
- Printed invoice is sale-side only (no separate purchase/GRN section).

### 4c. Excel export & Receipt images

- **Save as Excel** — both Cargo and Infra bills have a button (`components/billing/billExcel.ts`) that builds a real `.xlsx` (Summary + Detail sheets) from the same computed rate groups/lines/totals used for print, via the `xlsx` package installed from **SheetJS's own CDN build** (`cdn.sheetjs.com`) rather than the npm registry, which carries known high-severity CVEs.
- **Cargo receipt images** — every Confirm & Save on a Cargo trip renders the confirmation review (`components/forms/CargoTripReceipt.tsx`) off-DOM via `react-dom/client`'s `createRoot`/`flushSync`, captures it as a JPEG with `html-to-image` (chosen over `html2canvas`, which can't parse Tailwind v4's `oklch`/`oklab` colors), and uploads it through `uploadTripReceipt` → Apps Script's `uploadImage` action → Google Drive (folder "Sahyadri ERP Trip Receipts", shared "Anyone with the link"). The resulting URL lands in the row's `receiptImageUrl` column. The whole thing is best-effort — a capture/upload failure never blocks the trip from saving, matching the "local save always succeeds" philosophy elsewhere in this app. Editing a saved Cargo row later regenerates and re-uploads the receipt from the edited data (`RecordsView.tsx:syncCargoTripAfterEdit`), propagating the new URL to every sibling material-line row of that trip.

---

## 4d. Dashboard Module

Analytics over all saved records (`lib/dashboard.ts` + `components/dashboard/DashboardView.tsx`), filterable by month range, company, plant, vehicle and driver.

- **Trip identity:** cargo rows are per material line; the dashboard dedupes them into trips (`type|vehicleNo|date|lrNo`). Trip-level amounts (toll, diesel-used) count once per trip; per-line `transportAmount` is summed.
- **Diesel cost** = actual Diesel Tank fills (`fillAmount`), never the per-trip estimates — no double counting.
- **Driver attribution:** the trip's `driverId`, else the diesel fill's driver (via `dieselFillRef`), else the vehicle's assigned driver.
- **KPI tiles:** Revenue · Expenses · Profit/Loss · Trips · Weight.
- **Tables** (each with CSV export): per-vehicle earnings vs diesel/maintenance/toll with profit; per-driver trips, weight, salary paid, daily expenses (per-type breakdown), total cost; monthly P/L with per-company revenue split and totals row. Monochrome inline bars, no chart library.
- **Scoping rule:** company/plant/driver filters show trip revenue + toll only — shared costs (fills, maintenance, salaries) cannot be split by those filters, and the UI says so.

---

## 5. Google Sheets Column Order

### 5a. Cargo Transport (all 6 legacy sources + the unified tab share these columns)

Live tab: **Cargo Trips** (unified, has a `plantType` column saying which plant). The 6 original per-plant tabs (H19, J14, J15 - J16, Matoshri enterprise, Minerva Enterprises, Machine Shop - Shirwal) are kept only as an untouched historical backup from before the migration.

| # | Column | # | Column |
|---|--------|---|--------|
| 1 | id | 14 | totalWt |
| 2 | documentNo | 15 | transportRate |
| 3 | date | 16 | transportAmount |
| 4 | fromLocation | 17 | rateTier |
| 5 | toParty | 18 | dieselFillRef |
| 6 | vehicleNo | 19 | dieselUsedThisTrip |
| 7 | lrNo | 20 | tollOverloadAmount |
| 8 | materialCode | 21 | receivedQty |
| 9 | materialDescription | 22 | receivedDate |
| 10 | hsnCode | 23 | **billingCompany** (madhsa-gramin / sahyadri-infra) |
| 11 | quantity | 24 | **driverId** |
| 12 | uom (EA / KG / Brass) | 25 | **driverName** |
| 13 | perPartWt | (26+) | *(unified tab only)* `plantType`, then marker columns below |

**Marker/reference columns**, appended last so old rows keep their alignment: `dieselFilled`, `maintenanceThisTrip`, `tripExpenseRef` (links to the Trip Expenses tab — see §5b), **`receiptImageUrl`** (auto-captured receipt photo link, §4c; blank when capture/upload hasn't happened or failed).

> One **row per material line** × per invoice. `billingCompany` decides which company's monthly bill the row lands on; `driverId` powers the Dashboard's driver analytics (legacy rows without it fall back to the diesel-fill driver, then the vehicle's assigned driver). Receipt values are entered per unit in the form — `receivedDate` per invoice, `receivedQty` per material line — so multi-invoice trips carry the right receipt on every row.

### 5b–5j. Other operational tabs

- **Sahyadri Infra** (Infra & Crusher): id, date, vehicleNo, crusherChallanNo, materialType, crusherRate, crusherBrass, crusherAmount, diesel, challanNo, customerName, qtyBrass, rate, totalAmount, difference, driverId, driverName, crusherLocation, clientLocation, dieselFillRef, dieselUsedThisTrip, tollOverloadAmount, dieselFilled, maintenanceThisTrip, tripExpenseRef, **clientRef** (link into the Client Companies tab)
- **Return Pallets**: id, date, dcNo, plant, toParty, materialCode, materialDescription, uom, qty, vehicleNo, lrNo, freightAmount, remarks, **billingCompany**
- **Diesel Tank**: id, fillRef (`VEHICLENO-YYYY-MM-DD`), date, vehicleNo, fillAmount, liters, driverId, driverName, expectedTrips, note, **ratePerLiter** (auto-calculator: amount ⇄ liters, default Rs 99.24/L)
- **Drivers**: driverId (DRV-001…), firstName, middleName, surname, mobileNumber, aadharNumber, accountNumber, totalSalary
- **Salary**: id, driverId, driverName, paymentType (Regular/Advance/Delayed), scheduledSalaryDate (1st/8th/15th/22nd), paymentDate, amount, reason
- **Driver Expenses**: id (DEX-000001…), driverId, driverName, date, expenseType (Food / Travel / Lodging / Toll / Recharge / Medical / Repair on Road / Other), amount, paymentMode (Cash / UPI / Company Account), note
- **Ledger**: id, date, receiptNo, particular, vehicleNo, rate, brass, debit, credit
- **Trip Expenses**: one row per trip — carries `tollOverloadAmount` / diesel-used figures referenced by `tripExpenseRef` on Cargo and Infra rows, instead of repeating them per material line (avoids inflating `SUM()` aggregations)
- **Material Master**: id, code, name, weightPerPieceKg, ratePerKg, addedAt
- **Vehicle Master**: id, registrationNo, engineNo, chassisNo, vehicleType, makeModel, manufacturer, yearOfManufacture, loadCapacityKg, fuelType, ownershipType, ownerName, assignedDriverId, assignedDriverName, insurance/fitness/PUC/road-tax/permit fields, rtoPassingDate, notes, addedAt
- **Vehicle Maintenance**: id (MNT-0001…), vehicleId, vehicleNo, date, maintenanceType, partName, partNumber, description, vendorName, invoiceNo, labourCost, partsCost, totalCost, odometerKm, nextServiceKm, nextServiceDate, doneBy, remarks, addedAt
- **Locations** (Plants & Vendors): id, name, isCargoPlant, plantType (stable slug, assigned once), rate, notes, addedAt, updatedAt
- **Staff Master**: id, name, role (Accountant / Hamal / Other), mobileNumber, …

### 5k. Client Companies

id, name, address, gstNo, shippingName, shippingAddress, projectCode, projectName, notes, addedAt, updatedAt

> One row per **client + project** combo — a client with two sites is two rows. Referenced by Infra & Crusher trips (`clientRef`) and by Infra bills.

### 5l. Bills (invoice register — shared by Cargo and Infra & Crusher)

id, invoiceNo, invoiceDate, month, company, plant, category, hsnNo, customerName, customerAddress, customerPin, customerGst, gstPercent, rateSummary, totalWeightKg, subTotal, cgst, sgst, grandTotal, description, lineCount, createdAt, **billJson** (full snapshot for reopen/print — also carries the `moduleType: "cargo" | "infra"` tag that keeps the two billing sub-sections' saved lists apart)

### 5m. Audit Log

id, timestamp, action (create/edit/delete), recordType, recordId, documentNo, summary, beforeJson, afterJson, **user** (email of the signed-in user who made the change; appended last so older rows stay column-aligned)

---

## 6. Auto-Computed Fields

| Form | Trigger field | Auto-filled field(s) |
|------|--------------|---------------------|
| Cargo — material line | `materialCode` | `materialDescription`, `perPartWt`, `transportRate`, `transportAmount`, `rateTier` |
| Cargo — material line | `quantity` or `perPartWt` | `totalWt`, rate/amount recalc |
| Cargo — trip | `vehicleNo` | `dieselFillRef` (latest fill for that vehicle) |
| Cargo/Infra — Saved Records edit | any saved-field change | receipt image regenerated + re-uploaded (Cargo only, §4c); Trip Expense record created retroactively if missing |
| Infra & Crusher | client/project pick or "Add New" | `customerName`, `clientLocation` (read-only, sourced from the Client Companies master) |
| Billing (Cargo & Infra) | company / plant or client / category / month | invoice no, HSN, customer details, description, all totals |
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

Every form save goes through a **ConfirmDialog**. The Cargo form shows a full review of the entry (trip details, invoices + material lines, weights, amount, expenses) with three actions, and on confirm also auto-captures + uploads the receipt image (§4c):

| Button | Color | Effect |
|--------|-------|--------|
| Confirm & Save | green | saves the entry (+ captures/uploads the receipt image for Cargo, best-effort) |
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
| Bill invoice no | numeric, **per company, and per billing sub-section** (Cargo and Infra & Crusher each run their own sequences; Madhsa and Sahyadri also run separate Cargo sequences) | saved bills |

---

## 10. Vehicle Compliance Tracking

Insurance / Fitness / PUC / Road Tax / Permit expiry dates are monitored; fleet table sorts by nearest expiry and bolds items expired or expiring within 30 days. Helpers in `vehicleStore.ts`: `getExpiringCompliance(daysAhead)`, `getMaintenanceCostSummary(vehicleId)`, `getVehicleNoOptions()`.

---

## 11. Audit Log

**Everything is logged**: form-entry creations (one entry per submission), edits/deletes in Saved Records, bill save/delete, vehicle + maintenance changes, material changes. Hydration refreshes are not logged (not user actions).

- Each entry: id, timestamp, **user** (email of who made the change), action (create/edit/delete), recordType, recordId, documentNo, one-line summary, full before/after JSON snapshots.
- The user is stamped server-side: `app/actions/sheets.ts` reads the verified session cookie (`lib/server/auth.ts`) and sends it with every append/upsert/delete, overwriting whatever the client sent for audit rows — so it can't be spoofed from the browser. `lib/sessionUser.ts` mirrors the session email client-side only for instant local-cache display; it isn't the source of truth. Entries from before this existed, or saved while auth wasn't configured, show "—".
- Pushed to the Sheet's **Audit Log** tab (unlimited history); localStorage keeps the most recent 1000 as an offline cache.
- **Saved Records → Audit Log** fetches the full history from the Sheet when opened (`?type=audit`), falling back to the local cache offline. Table shows a **User** column; searchable by user, action, type, id, invoice no, or summary.
- The audit history is excluded from every sweep (partial or full) so navigation and refresh stay fast.
- Apps Script also writes its own tamper-evident "server audit" rows on every successful mutation (independent of the client-supplied entry above) — these now carry the same `user` value passed from the server action.

---

## 12. Saved Records View

Tabs: Cargo Transport · Infra & Crusher · Diesel Tank · Driver Master · Driver Salaries · **Driver Expenses** · Customer Ledger · Audit Log.

Per tab: search, Export CSV, inline Edit, Delete with confirm — every edit/delete writes an audit entry. Failed Sheet uploads can be retried from here. Vehicle Master/Maintenance are managed in the Vehicles module instead.

- Editing a **Cargo** row with no `tripExpenseRef` yet shows an inline Trip Expenses mini-editor (Diesel Used / Toll+Overload) so a trip's expenses can be filled in retroactively; saving creates the missing Trip Expenses record and stamps the ref onto every sibling material-line row of that trip.
- Any edit to a Cargo row's saved fields regenerates and re-uploads its receipt image (§4c), propagating the new link to all sibling rows.
- The **Receipt Image** column renders its URL as a clickable link that opens in a new tab (same treatment for any URL-shaped cell value).

Column order in every tab: the view's date column leads (right after Actions), original field order follows, **Saved At** trails last. Same order drives CSV export and the inline edit panel's field order (`lib/recordColumns.ts`).

---

## 13. File Structure

```
erp/
├── ERP_OVERVIEW.md                  ← this file
├── frontend/erp/
│   ├── proxy.ts                     route-level auth gate (Next 16's renamed middleware)
│   ├── public/
│   │   ├── madhsa-header.png        letterhead banners printed on bills
│   │   ├── sahyadri-infra-header.png
│   │   └── Sahyadri-infra-Log.png   source of app/icon.png
│   ├── app/
│   │   ├── page.tsx                 redirects to /dashboard
│   │   ├── login/page.tsx           sign-in card
│   │   ├── icon.png                 app/tab icon (Next.js picks this up automatically)
│   │   ├── (app)/
│   │   │   ├── layout.tsx           reads session → ChromeBoundary
│   │   │   └── <module>/page.tsx    one thin route file per module (dashboard, cargo,
│   │   │                            infra, diesel, payroll, billing, drivers, staff,
│   │   │                            ledger, materials, parties, vehicles, records)
│   │   └── actions/
│   │       ├── auth.ts              loginWithPassword, logout
│   │       └── sheets.ts            listSheets, appendRows, upsertRow, deleteRow,
│   │                                 uploadTripReceipt
│   ├── components/
│   │   ├── auth/LoginCard.tsx
│   │   ├── dashboard/DashboardView.tsx
│   │   ├── billing/
│   │   │   ├── BillingModule.tsx        (tab switcher: Cargo vs Infra & Crusher)
│   │   │   ├── CargoBillingModule.tsx
│   │   │   ├── InfraBillingModule.tsx
│   │   │   ├── BillPreview.tsx           (Cargo 2-page invoice, print layout)
│   │   │   ├── InfraBillPreview.tsx      (Infra & Crusher 2-page invoice)
│   │   │   └── billExcel.ts              (Save as Excel, both modules)
│   │   ├── forms/
│   │   │   ├── CargoTransportForm.tsx (+ full-entry confirm review)
│   │   │   ├── CargoTripReceipt.tsx   (shared receipt layout + capture/upload)
│   │   │   ├── InfraCrusherForm.tsx   (+ inline client/project add)
│   │   │   ├── DieselTankForm.tsx
│   │   │   ├── DriverMasterForm.tsx
│   │   │   ├── DriverSalaryForm.tsx
│   │   │   ├── DriverExpenseForm.tsx  (daily expenses: food, travel…)
│   │   │   ├── PayrollModule.tsx
│   │   │   ├── StaffMasterModule.tsx
│   │   │   ├── PlantsVendorsModule.tsx
│   │   │   ├── MaterialMasterModule.tsx
│   │   │   ├── ModuleForms.tsx
│   │   │   ├── SheetForm.tsx
│   │   │   └── Vehicle*.tsx
│   │   ├── layout/
│   │   │   ├── ChromeBoundary.tsx   (ssr:false wrapper around AppChrome)
│   │   │   ├── AppChrome.tsx        (sidebar nav + mobile hamburger drawer/profile
│   │   │   │                         menu, sheets-first loading gate — lives in the
│   │   │   │                         (app) layout, persists across module routes)
│   │   │   ├── moduleRegistry.tsx   (per-module lazy chunks, ModuleClient)
│   │   │   └── LocalDataPanel.tsx   (Refresh from Sheets, export)
│   │   ├── ui/                      (FormField, FormSection, ConfirmDialog with
│   │   │                             review content + green/red actions, Toast,
│   │   │                             LoadingAnimation/LoadingCard)
│   │   └── views/RecordsView.tsx    (records + sheet-backed audit tab)
│   └── lib/
│       ├── api.ts                   (submitToSheet, syncMasterRecord, retrySync,
│       │                             uploadReceiptImage, audit entry per submission)
│       ├── auditLog.ts              (audit entries + Sheet sync)
│       ├── authShared.ts            (session cookie name + JWT verify, edge-safe)
│       ├── server/auth.ts           (server-only: Firebase sign-in, JWT issue/read)
│       ├── billing.ts               (Cargo bill line collection, rate groups, GST)
│       ├── billingConfig.ts         (Cargo categories, plant customer defaults)
│       ├── billingStore.ts          (saved Cargo + Infra bills, shared Bills-tab sync)
│       ├── infraBilling.ts          (Infra bill computation)
│       ├── infraBillingConfig.ts    (Infra GST default, HSN suggestion)
│       ├── clientStore.ts           (Client Company / Project master)
│       ├── companies.ts             (company master + letterheads)
│       ├── dashboard.ts             (trip dedup + vehicle/driver/monthly P-L aggregations)
│       ├── dieselUtils.ts
│       ├── driverStore.ts
│       ├── localStore.ts            (records cache + id sequences)
│       ├── locationStore.ts         (plants & vendors master)
│       ├── staffStore.ts            (staff master)
│       ├── materialMaster.ts        (built-in materials + weight-tier calc)
│       ├── materialRates.ts         (per-material rate/threshold table)
│       ├── materialStore.ts
│       ├── moduleData.ts            (MODULE_SHEET_TYPES, staleModuleTypes,
│       │                             refreshModuleData — per-route Sheets fetch)
│       ├── recordColumns.ts         (RECORD_VIEWS + CSV export)
│       ├── sessionUser.ts           (client-side mirror of the signed-in
│       │                             email, for local audit-cache display only)
│       ├── sheetConfig.ts           (MODULES, all field configs)
│       ├── sheetFetch.ts            (refreshFromSheets, fetchAuditLog, ALL_SYNC_TYPES)
│       ├── storageMode.ts
│       ├── types.ts
│       └── vehicleStore.ts
└── google-apps-script/
    └── Code.gs                      (doPost append/upsert/delete/uploadImage,
                                      doGet list API, header-row guarantee on every
                                      tab, Drive upload for receipt images)
```

---

## 14. Adding a New Record Type (checklist)

1. Add the `SheetType` to `lib/types.ts`
2. Add its field config array to `lib/sheetConfig.ts`
3. Add an id prefix to `ID_PREFIXES` in `lib/localStore.ts`
4. Add the tab name to `SHEET_MAP` + column order to `COLUMN_ORDER` in `google-apps-script/Code.gs` (redeploy)
5. Add the type to `RECORD_TYPES`/`ALL_SYNC_TYPES` + `TYPE_LABELS` in `lib/sheetFetch.ts` (so it hydrates from Sheets), and to whichever modules' entries in `MODULE_SHEET_TYPES` (`lib/moduleData.ts`) need it
6. Add a view config to `RECORD_VIEWS` in `lib/recordColumns.ts`
7. Create the form component in `components/forms/` and register it: add to `MODULES` (`lib/sheetConfig.ts`) and to `MODULE_COMPONENTS` (`components/layout/moduleRegistry.tsx`), plus a matching `app/(app)/<id>/page.tsx` route file — or nest it as a tab inside an existing module instead
8. Create the tab in the spreadsheet — headers are written automatically on first save/read
