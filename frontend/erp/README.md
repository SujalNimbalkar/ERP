# Sahyadri Infra ERP

Internal operations ERP for a transport, crushing & infra business — cargo trips, billing/invoicing, diesel, payroll, fleet compliance, and a live dashboard, all backed by a Google Sheet as the system of record.

For the full architecture (data flow, event bus, billing logic, Sheet column layout, module checklist) see **[ERP_OVERVIEW.md](../../ERP_OVERVIEW.md)** at the repo root. This file just covers running and building the Next.js frontend.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Firebase Auth (email/password) · Google Sheets via Apps Script Web App

## Modules

Dashboard · Cargo Transport · Infra & Crusher · Diesel Tank · Payroll · Billing (Cargo + Infra & Crusher) · Drivers (Master / Salary / Daily Expenses) · Staff Master · Customer Ledger · Material Master · Plants & Vendors · Vehicles (Fleet / Maintenance) · Saved Records (per-type + Audit Log)

Each is a real route under `app/(app)/`, sharing one sidebar/mobile-drawer chrome and fetching only the Sheet tabs it needs.

## Getting started

1. Copy the env template and fill it in:

   ```bash
   cp .env.local.example .env.local
   ```

   You'll need a deployed Google Apps Script Web App URL + shared API token (Sheets access), and a Firebase project's Web API key + a random session signing secret (sign-in). Both auth vars are optional to start — leave them unset and the app runs open, unauthenticated, for local setup.

2. Install dependencies and run the dev server:

   ```bash
   npm install
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

> **Heads up:** there's no sandbox/staging spreadsheet — the dev server reads and writes the **real production Google Sheet** through the configured Apps Script URL. Point `GAS_WEB_APP_URL` at a test deployment before doing anything destructive locally.

## Build

```bash
npm run build   # forced onto Webpack (--webpack) — Turbopack's production output 404s on Vercel
npm start
```

## Sign-in

Firebase email/password, no self-signup. Accounts are created by an admin in the Firebase console (Authentication → Users → Add user); credentials are handed out directly. See [ERP_OVERVIEW.md §2](../../ERP_OVERVIEW.md#2-architecture--routes-auth-gate-per-module-sheets-fetch) for how the session cookie and route gate work.

## Project layout

```
app/            routes (one folder per module) + server actions (auth, sheets)
components/     forms, billing, dashboard, layout chrome, shared ui
lib/            data stores, Sheets fetch/sync, billing logic, auth
proxy.ts        route-level auth gate (Next 16's renamed middleware)
```

Full breakdown, including every file's purpose, is in [ERP_OVERVIEW.md §13](../../ERP_OVERVIEW.md#13-file-structure).

## Notes

- Security headers + a strict CSP are set in [next.config.ts](next.config.ts) (no inline scripts in production, `frame-ancestors 'none'`, HSTS, etc.).
- `xlsx` (Excel export) is installed from [SheetJS's own CDN](https://cdn.sheetjs.com) rather than npm — the npm package carries known high-severity CVEs.
- Google Sheets access always goes through this app's own server actions (`app/actions/sheets.ts`); the browser never talks to Apps Script or holds its API token directly.
