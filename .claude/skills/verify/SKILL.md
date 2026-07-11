---
name: verify
description: Build, launch, and drive the Sahyadri ERP frontend to verify changes at the browser surface.
---

# Verifying the Sahyadri ERP frontend

The app is a Next.js SPA in `frontend/erp` — all modules render client-side
(`ssr: false`), so curling pages proves nothing; you must drive a real browser.

## Build / launch

- Typecheck & build: `cd frontend/erp && npx tsc --noEmit` / `npm run build`.
- Dev server: `npm run dev` — **check first whether one is already running on
  port 3000** (the user usually has it up; a second `next dev` exits with
  code 1 and tells you the PID). Just target `http://localhost:3000`.

## Driving the UI

No Playwright in the repo. Working recipe: `npm i puppeteer-core` in the
scratchpad and launch the system Chrome headless:

- Chrome: `C:\Program Files\Google\Chrome\Application\chrome.exe`
  (Edge also present at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`).
- All data is localStorage-backed. Seed state with
  `page.evaluateOnNewDocument` **before** `goto`:
  - Trip/form records: key `sahyadri_erp_records`, array of
    `{ id, type, data, savedAt }` (`type` = SheetType, e.g. `cargo-h19`).
  - Saved bills: `sahyadri_erp_bills`; vehicles `sahyadri_vehicle_master`.
- Navigation is a single page: click the sidebar `<button>` by text
  (e.g. "Billing", "Cargo Transport").
- Inputs are React-controlled — set values via the native value setter +
  `dispatchEvent(new Event("input", { bubbles: true }))`; plain `el.value =`
  does nothing.
- Save flows go through a ConfirmDialog (`[role="dialog"]`, confirm button
  text "Save"); errors surface in `[role="alert"]`.
- Bill print layout: assert with `page.emulateMediaType("print")` —
  only `.bill-print-area` should stay visible.

## Gotchas

- When faking the Apps Script backend with `page.setRequestInterception`,
  `req.respond` must include `"Access-Control-Allow-Origin": "*"` — the app
  fetches cross-origin, so a fake without CORS headers silently sends the
  app down its error path. On app start the shell GETs `?action=list` to
  hydrate localStorage from Sheets; intercept it or the real Sheet is read.

- `next dev` on a busy port 3000 falls back to 3001 then **exits** — don't
  assume your background server is the one serving.
- Month picker in Billing is a native `type="month"` input (`#field-month`),
  value format `YYYY-MM`.
