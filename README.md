# Sahyadri Infra ERP

Internal operations ERP for a transport, crushing & infra business — cargo trips, billing/invoicing, diesel, payroll, fleet compliance, and a live dashboard, all backed by a Google Sheet as the system of record.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Firebase Auth · Google Sheets via Apps Script Web App · Capacitor (Android)

## Repo layout

| Path | What it is |
|------|-----------|
| [`frontend/erp/`](frontend/erp/) | The Next.js web app — every module, the auth gate, and the server actions that talk to Sheets. Start here to run or build it. |
| [`google-apps-script/`](google-apps-script/) | `Code.gs` — the Apps Script Web App backing the frontend: the Sheets read/write API, header-row self-healing, and Drive upload for receipt images. |
| [`android-app/`](android-app/) | A thin Capacitor WebView shell so staff can install a home-screen app icon — points at the live deployed site, no logic duplicated. |

## Documentation

- **[ERP_OVERVIEW.md](ERP_OVERVIEW.md)** — the full system reference: module map, data-flow architecture, event bus, billing logic, every Sheet's column layout, and the checklist for adding a new record type. Start here to understand how the system fits together.
- **[frontend/erp/README.md](frontend/erp/README.md)** — running and building the web app locally.

## Modules

Dashboard · Cargo Transport · Infra & Crusher · Diesel Tank · Payroll · Billing (Cargo + Infra & Crusher) · Drivers (Master / Salary / Daily Expenses) · Staff Master · Customer Ledger · Material Master · Plants & Vendors · Vehicles (Fleet / Maintenance) · Saved Records (per-type + Audit Log)

## Quick start

```bash
cd frontend/erp
cp .env.local.example .env.local   # fill in your Apps Script + Firebase config
npm install
npm run dev
```

See [frontend/erp/README.md](frontend/erp/README.md) for the full setup (including the production-Sheet warning for local dev) and [ERP_OVERVIEW.md](ERP_OVERVIEW.md) for everything else.
