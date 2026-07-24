/**
 * Sahyadri Infra ERP — Google Apps Script Web App
 *
 * Cargo columns match the structured form sections (document → receipt).
 * Pallet columns match Delivery Challan format from sample bills.
 */

/**
 * Runtime configuration lives in Script Properties (Project Settings →
 * Script Properties), never in code:
 *   SPREADSHEET_ID — the spreadsheet to operate on
 *   API_TOKEN      — shared secret the Next.js server sends with every request
 *   REQUIRE_TOKEN  — "true" to enforce API_TOKEN; anything else = open
 *                    (rollout/rollback lever — flip without redeploying)
 */
const SPREADSHEET_ID_FALLBACK = "YOUR_SPREADSHEET_ID_HERE";

function getProps_() {
  return PropertiesService.getScriptProperties();
}

function getSpreadsheet_() {
  const id =
    getProps_().getProperty("SPREADSHEET_ID") || SPREADSHEET_ID_FALLBACK;
  return SpreadsheetApp.openById(id);
}

/**
 * Shared-secret check. While REQUIRE_TOKEN != "true" every request passes —
 * that keeps old clients working during rollout and is the instant rollback
 * lever. Comparison is over SHA-256 digests so string-compare timing reveals
 * nothing about the token.
 */
function isAuthorized_(suppliedToken) {
  const props = getProps_();
  if (props.getProperty("REQUIRE_TOKEN") !== "true") return true;
  const expected = props.getProperty("API_TOKEN") || "";
  if (!expected || !suppliedToken) return false;
  const a = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(suppliedToken),
  );
  const b = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    expected,
  );
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Hard limits on write requests — quota/flooding protection. Large enough
 * for a base64-encoded receipt image (~1.5MB decoded inflates to ~2MB as
 * base64) on top of normal row payloads. */
const MAX_BATCH_RECORDS = 200;
const MAX_BODY_BYTES = 2000000;

/** Receipt images auto-captured from Cargo's Confirm & Save dialog — saved
 * to Drive (Sheets cells can't hold files) via the "uploadImage" action,
 * not through the SHEET_MAP/COLUMN_ORDER row machinery below since it's a
 * binary blob, not a sheet row. */
const RECEIPT_DRIVE_FOLDER_NAME = "Sahyadri ERP Trip Receipts";
const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png"];

function getOrCreateFolder_(name) {
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

/** Decodes and saves a base64 image to Drive, sharing it "anyone with the
 * link can view" so the stored URL opens directly without per-user access
 * grants — fine for internal trip data (vehicle/driver/material/amounts),
 * not sensitive PII. Returns { success, url } or { success: false, message }. */
function handleUploadImage_(payload) {
  const mimeType = payload.mimeType;
  const base64Data = payload.base64Data;
  if (
    ALLOWED_IMAGE_MIME_TYPES.indexOf(mimeType) === -1 ||
    typeof base64Data !== "string" ||
    !base64Data
  ) {
    return { success: false, message: "Invalid image" };
  }
  try {
    const bytes = Utilities.base64Decode(base64Data);
    const filename = payload.filename || "receipt-" + Date.now() + ".jpg";
    const blob = Utilities.newBlob(bytes, mimeType, filename);
    const folder = getOrCreateFolder_(RECEIPT_DRIVE_FOLDER_NAME);
    const file = folder.createFile(blob);
    // Sharing is best-effort and kept separate from file creation: some
    // Workspace accounts have an admin policy that blocks "anyone with the
    // link" external sharing outright, which would otherwise throw here and
    // discard a file that was already successfully created. If it fails,
    // the file (and its URL) still exists — just only openable by whoever
    // already has folder access, not link-only.
    try {
      file.setSharing(
        DriveApp.Access.ANYONE_WITH_LINK,
        DriveApp.Permission.VIEW,
      );
    } catch (sharingErr) {
      console.error(
        "uploadImage: setSharing failed (file still created): " +
          (sharingErr && sharingErr.stack ? sharingErr.stack : sharingErr),
      );
    }
    return { success: true, url: file.getUrl() };
  } catch (err) {
    console.error(
      "uploadImage failed: " + (err && err.stack ? err.stack : err),
    );
    return { success: false, message: "Upload failed" };
  }
}

const SHEET_MAP = {
  // NOTE: "cargo" (below) is the live, unified Cargo Transport tab used by the
  // current frontend. The 6 per-plant entries here are kept only as an
  // untouched historical backup post-migration — see migrateCargoSheets().
  cargo: "Cargo Trips",
  "cargo-h19": "H19",
  "cargo-j14": "J14",
  "cargo-j15-j16": "J15 -  J16",
  "cargo-matoshri": "Matoshri enterprise",
  "cargo-minerva": "Minerva Enterprises",
  "cargo-machine-shop": "Machine Shop - Shirwal",
  infra: "Sahyadri Infra",
  pallets: "Return Pallets",
  diesel: "Diesel Tank",
  drivers: "Drivers",
  salary: "Salary",
  "driver-expense": "Driver Expenses",
  ledger: "Ledger",
  "trip-expense": "Trip Expenses",
  materials: "Material Master",
  "vehicle-master": "Vehicle Master",
  "vehicle-maintenance": "Vehicle Maintenance",
  locations: "Locations",
  staff: "Staff Master",
  bills: "Bills",
  clients: "Client Companies",
  audit: "Audit Log",
};

/** Columns shared by the legacy per-plant tabs and the shared Cargo Trips
 * tab, in the order existing sheet rows were written (ends at driverName).
 * Rows are read/written by column INDEX, never by header — so nothing may
 * ever be inserted mid-list; new columns go in CARGO_MARKER_COLUMNS below. */
const CARGO_BASE_COLUMNS = [
  "id",
  "documentNo",
  "date",
  "fromLocation",
  "toParty",
  "vehicleNo",
  "lrNo",
  "materialCode",
  "materialDescription",
  "hsnCode",
  "quantity",
  "uom",
  "perPartWt",
  "totalWt",
  "transportRate",
  "transportAmount",
  "rateTier",
  "dieselFillRef",
  "dieselUsedThisTrip",
  "tollOverloadAmount",
  "receivedQty",
  "receivedDate",
  // Appended last so existing sheet rows keep their column alignment —
  // add "billingCompany", "driverId", "driverName" headers as the final
  // columns of each cargo tab.
  "billingCompany",
  // Who drove the trip — powers the driver analytics on the Dashboard
  "driverId",
  "driverName",
];

/** New marker/ref columns — appended after every pre-existing column (on the
 * shared Cargo Trips tab that includes `plantType`) so old rows stay aligned.
 * Whether this trip also filled the tank / did vehicle maintenance — the
 * actual diesel/maintenance data lands in their own tabs, these are just
 * markers. `tripExpenseRef` references this trip's Trip Expenses row
 * (toll/diesel-used amounts live there now, one row per trip, instead of
 * repeating inline on every material-line row here — see the "trip-expense"
 * tab below). */
const CARGO_MARKER_COLUMNS = [
  "dieselFilled",
  "maintenanceThisTrip",
  "tripExpenseRef",
  // Drive link to a receipt image auto-captured from the Confirm & Save
  // dialog (see the "uploadImage" action below) — blank when capture/upload
  // failed or hasn't happened yet (older rows, or a redeploy still pending).
  "receiptImageUrl",
];

const CARGO_COLUMNS = CARGO_BASE_COLUMNS.concat(CARGO_MARKER_COLUMNS);

/** Every plant lives in one shared tab now — `plantType` (e.g. "cargo-h19")
 * says which one. It has sat right after `driverName` since the tab was
 * created, so it MUST stay at that index — the marker columns come after. */
const CARGO_TRIPS_COLUMNS = CARGO_BASE_COLUMNS.concat(["plantType"]).concat(
  CARGO_MARKER_COLUMNS,
);

const COLUMN_ORDER = {
  cargo: CARGO_TRIPS_COLUMNS,
  "cargo-h19": CARGO_COLUMNS,
  "cargo-j14": CARGO_COLUMNS,
  "cargo-j15-j16": CARGO_COLUMNS,
  "cargo-matoshri": CARGO_COLUMNS,
  "cargo-minerva": CARGO_COLUMNS,
  "cargo-machine-shop": CARGO_COLUMNS,
  infra: [
    "id",
    "date",
    "vehicleNo",
    "crusherChallanNo",
    "materialType",
    "crusherRate",
    "crusherBrass",
    "crusherAmount",
    "diesel",
    "challanNo",
    "customerName",
    "qtyBrass",
    "rate",
    "totalAmount",
    "difference",
    // Appended last so existing sheet rows keep their column alignment —
    // driver link, trip expenses, and the diesel/maintenance checkboxes
    // (the actual diesel/maintenance data lands in their own tabs).
    "driverId",
    "driverName",
    "crusherLocation",
    "clientLocation",
    "dieselFillRef",
    "dieselUsedThisTrip",
    "tollOverloadAmount",
    "dieselFilled",
    "maintenanceThisTrip",
    // See the "trip-expense" tab below — same reasoning as on the cargo tab.
    "tripExpenseRef",
    // Reference into the "clients" tab (Client Companies) — appended last so
    // existing sheet rows keep their column alignment, same rule as above.
    "clientRef",
  ],
  pallets: [
    "id",
    "date",
    "dcNo",
    "plant",
    "toParty",
    "materialCode",
    "materialDescription",
    "uom",
    "qty",
    "vehicleNo",
    "lrNo",
    "freightAmount",
    "remarks",
    "billingCompany",
  ],
  diesel: [
    "id",
    "fillRef",
    "date",
    "vehicleNo",
    "fillAmount",
    "liters",
    "driverId",
    "driverName",
    "expectedTrips",
    "note",
    "ratePerLiter",
    "odometerKm",
  ],
  drivers: [
    "driverId",
    "firstName",
    "middleName",
    "surname",
    "mobileNumber",
    "aadharNumber",
    "accountNumber",
    "totalSalary",
  ],
  salary: [
    "id",
    "driverId",
    "driverName",
    "paymentType",
    "scheduledSalaryDate",
    "paymentDate",
    "amount",
    "reason",
  ],
  "driver-expense": [
    "id",
    "driverId",
    "driverName",
    "date",
    "expenseType",
    "amount",
    "paymentMode",
    "note",
  ],
  ledger: [
    "id",
    "date",
    "receiptNo",
    "particular",
    "vehicleNo",
    "rate",
    "brass",
    "debit",
    "credit",
  ],
  // One row per trip (not per material line) — referenced from cargo/infra
  // rows via `tripExpenseRef` so toll/diesel-used amounts never repeat.
  // `id` is client-generated (see buildTripExpenseRef in sheetConfig.ts),
  // not this backend's usual auto-sequence.
  "trip-expense": [
    "id",
    "date",
    "vehicleNo",
    "driverId",
    "driverName",
    "dieselUsedThisTrip",
    "tollOverloadAmount",
    "source",
    "documentNos",
  ],
  materials: ["id", "code", "name", "weightPerPieceKg", "ratePerKg", "addedAt"],
  // One list for both Cargo Plants and Delivery Vendors — `isCargoPlant`
  // ("true"/"false") flags which; `cargoType` is only set for plant rows.
  locations: [
    "id",
    "name",
    "isCargoPlant",
    "cargoType",
    "notes",
    "addedAt",
    "updatedAt",
    // Appended last on purpose: ensureHeaderRow only backfills trailing
    // header cells, so existing Locations rows stay aligned.
    "address",
    "gst",
  ],
  staff: [
    "id",
    "name",
    "role",
    "mobileNumber",
    "rate",
    "notes",
    "addedAt",
    "updatedAt",
    // Appended last on purpose: ensureHeaderRow only backfills trailing
    // header cells, so existing Staff rows stay aligned.
    "email",
  ],
  // Client Company + project/site master for Infra & Crusher billing — one
  // row per client + project combo (a client with two sites is two rows).
  clients: [
    "id",
    "name",
    "address",
    "gstNo",
    "shippingName",
    "shippingAddress",
    "projectCode",
    "projectName",
    "notes",
    "addedAt",
    "updatedAt",
  ],
  "vehicle-master": [
    "id",
    "registrationNo",
    "engineNo",
    "chassisNo",
    "vehicleType",
    "makeModel",
    "manufacturer",
    "yearOfManufacture",
    "loadCapacityKg",
    "fuelType",
    "ownershipType",
    "ownerName",
    "assignedDriverId",
    "assignedDriverName",
    "insurancePolicyNo",
    "insuranceCompany",
    "insuranceValidUpto",
    "fitnessValidUpto",
    "pucValidUpto",
    "roadTaxValidUpto",
    "permitType",
    "permitValidUpto",
    "rtoPassingDate",
    "notes",
    "addedAt",
  ],
  "vehicle-maintenance": [
    "id",
    "vehicleId",
    "vehicleNo",
    "date",
    "maintenanceType",
    "partName",
    "partNumber",
    "description",
    "vendorName",
    "invoiceNo",
    "labourCost",
    "partsCost",
    "totalCost",
    "odometerKm",
    "nextServiceKm",
    "nextServiceDate",
    "doneBy",
    "remarks",
    "addedAt",
  ],
  bills: [
    "id",
    "invoiceNo",
    "invoiceDate",
    "month",
    "company",
    "plant",
    "category",
    "hsnNo",
    "customerName",
    "customerAddress",
    "customerPin",
    "customerGst",
    "gstPercent",
    "rateSummary",
    "totalWeightKg",
    "subTotal",
    "cgst",
    "sgst",
    "grandTotal",
    "description",
    "lineCount",
    "createdAt",
    // Full bill snapshot (JSON) — lets any device reopen/print the exact bill
    "billJson",
  ],
  audit: [
    "id",
    "timestamp",
    "action",
    "recordType",
    "recordId",
    "documentNo",
    "summary",
    "beforeJson",
    "afterJson",
    // Appended last on purpose: ensureHeaderRow only backfills trailing
    // header cells, so existing Audit Log rows stay aligned.
    "user",
  ],
};

/**
 * Resolves a request `type` to a { tabName, columns } pair straight from
 * SHEET_MAP/COLUMN_ORDER. Returns null when the type is unknown.
 *
 * Every Cargo plant (built-in or custom) shares the one "cargo" type/tab —
 * see CARGO_TRIPS_COLUMNS' `plantType` field — so there's no per-plant tab
 * to dynamically resolve anymore. Custom plants and delivery vendors are
 * both just rows in the "locations" tab, not separate Sheet tabs.
 */
function resolveTab(ss, type) {
  if (SHEET_MAP[type] && COLUMN_ORDER[type]) {
    return { tabName: SHEET_MAP[type], columns: COLUMN_ORDER[type] };
  }
  return null;
}

/**
 * Reads the requested types (comma string, array, or empty = all non-audit)
 * as { type: rows[] }. Shared by the POST action=list route and the
 * TRANSITIONAL GET route below. Rows are mapped back to objects using
 * COLUMN_ORDER; dates become yyyy-MM-dd.
 */
function listData_(requested) {
  const ss = getSpreadsheet_();
  let types;
  if (requested && requested.length) {
    types = Array.isArray(requested) ? requested : String(requested).split(",");
  } else {
    // The audit history can get large — it is only returned when asked for
    // explicitly (type=audit), never in the default startup sweep.
    types = Object.keys(COLUMN_ORDER).filter(function (t) {
      return t !== "audit";
    });
  }
  const data = {};
  const missing = [];
  const missingTypes = [];
  types.forEach(function (type) {
    const resolved = resolveTab(ss, type);
    if (!resolved) return;
    const rows = readSheetRows(ss, type);
    if (rows === null) {
      // Tab not found — flag it via missingTypes so the client knows NOT to
      // treat this as "confirmed zero rows" and wipe its local cache.
      missing.push(resolved.tabName);
      missingTypes.push(type);
    } else {
      data[type] = rows;
    }
  });
  return {
    success: true,
    data: data,
    missing: missing,
    missingTypes: missingTypes,
  };
}

/**
 * TRANSITIONAL: GET ?action=list still serves data (token-optional) so the
 * previously-deployed frontend keeps working while the server layer rolls
 * out. Delete the list branch when creating the rotated deployment — after
 * that, GET is a bare health ping and all data flows through POST.
 */
function doGet(e) {
  const action = e && e.parameter ? e.parameter.action : "";
  if (action === "list") {
    try {
      return jsonResponse(listData_(e.parameter.type));
    } catch (err) {
      console.error(
        "doGet list failed: " + (err && err.stack ? err.stack : err),
      );
      return jsonResponse({ success: false, message: "Request failed" });
    }
  }
  return jsonResponse({
    success: true,
    message: "Sahyadri ERP API is running",
  });
}

/**
 * Guarantees row 1 holds the column names so data always lives from row 2
 * down. Fills the header into a blank/new tab, and inserts a header row
 * above existing data on legacy tabs where records start at row 1.
 */
function ensureHeaderRow(sheet, columns) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
    return;
  }
  const first = sheet.getRange(1, 1, 1, columns.length).getValues()[0];
  const blank = first.every(function (c) {
    return c === "" || c === null;
  });
  if (blank) {
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
    return;
  }
  if (!isHeaderRow(first, columns)) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
    return;
  }
  // A valid header that's shorter than the layout (tab predates newly
  // appended columns) — fill in the missing trailing column names. Only
  // trailing cells can be blank here; isHeaderRow vouched for the rest.
  for (var i = 0; i < columns.length; i++) {
    if (first[i] === "" || first[i] === null) {
      sheet
        .getRange(1, i + 1, 1, columns.length - i)
        .setValues([columns.slice(i)]);
      break;
    }
  }
}

/**
 * Reads a sheet back as objects for the given column layout. Assumes the
 * header row already exists/is repaired by the caller when relevant.
 */
function readRowsForColumns(sheet, columns) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, columns.length).getValues();
  const rows = [];
  for (var r = 0; r < values.length; r++) {
    const row = values[r];
    const hasValue = row.some(function (cell) {
      return cell !== "" && cell !== null;
    });
    if (!hasValue) continue;
    const obj = {};
    columns.forEach(function (key, i) {
      var value = row[i];
      if (value instanceof Date) {
        value = Utilities.formatDate(
          value,
          Session.getScriptTimeZone(),
          "yyyy-MM-dd",
        );
      }
      obj[key] = value;
    });
    rows.push(obj);
  }
  return rows;
}

/**
 * Reads a tab back as objects. Returns null when the tab doesn't exist.
 * Row 1 is the header (created/repaired if missing); data is rows 2+.
 */
function readSheetRows(ss, type) {
  const resolved = resolveTab(ss, type);
  if (!resolved) return null;
  const sheet = ss.getSheetByName(resolved.tabName);
  if (!sheet) return null;
  ensureHeaderRow(sheet, resolved.columns);
  return readRowsForColumns(sheet, resolved.columns);
}

/**
 * A row is a header when at least half of its non-empty cells name their
 * column key ("Driver ID" ~ driverId, "First Name" ~ firstName).
 */
function isHeaderRow(row, columns) {
  var matches = 0;
  var nonEmpty = 0;
  for (var i = 0; i < columns.length; i++) {
    var cell = row[i];
    if (cell === "" || cell === null || cell === undefined) continue;
    nonEmpty++;
    var normCell = String(cell)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    var normKey = String(columns[i])
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (normCell === normKey) matches++;
  }
  if (nonEmpty === 0) return true; // blank first row — skip it
  return matches >= Math.ceil(nonEmpty / 2);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, message: "Empty request body" });
    }
    if (e.postData.contents.length > MAX_BODY_BYTES) {
      return jsonResponse({ success: false, message: "Request too large" });
    }

    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonResponse({ success: false, message: "Invalid request" });
    }

    if (!isAuthorized_(payload.token)) {
      return jsonResponse({ success: false, message: "Unauthorized" });
    }

    const action = payload.action || "append";

    if (action === "list") {
      return jsonResponse(listData_(payload.type));
    }

    if (action === "uploadImage") {
      return jsonResponse(handleUploadImage_(payload));
    }

    const type = payload.type;
    if (!type) {
      return jsonResponse({ success: false, message: "Unknown type" });
    }
    // Who made the change — set by the Next.js server action from the
    // verified session, "" before auth was configured.
    const user = String(payload.user || "");

    const ss = getSpreadsheet_();
    const resolved = resolveTab(ss, type);
    if (!resolved) {
      return jsonResponse({ success: false, message: "Unknown type" });
    }

    const tabName = resolved.tabName;
    const columns = resolved.columns;
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      return jsonResponse({ success: false, message: "Sheet tab not found" });
    }

    // All mutations run under the script lock — findRowById → deleteRow /
    // setValues sequences race across concurrent requests otherwise (row
    // numbers shift after a delete; concurrent appends compute the same
    // getLastRow()+1).
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      // Row 1 is always the column names; data lives from row 2 down.
      ensureHeaderRow(sheet, columns);

      if (action === "delete") {
        const rowNum = findRowById(sheet, payload.id);
        if (rowNum > 0) sheet.deleteRow(rowNum);
        appendServerAudit_(
          ss,
          "delete",
          type,
          String(payload.id || ""),
          "server: deleted 1 row",
          user,
        );
        return jsonResponse({
          success: true,
          message: "Deleted from " + tabName,
        });
      }

      if (action === "upsert") {
        const data = payload.data || {};
        const idKey = columns[0];
        const id = data[idKey];
        const row = buildRow(columns, data);
        const rowNum = findRowById(sheet, id);
        if (rowNum > 0) {
          sheet.getRange(rowNum, 1, 1, row.length).setValues([row]);
        } else {
          sheet.appendRow(row);
        }
        appendServerAudit_(
          ss,
          "upsert",
          type,
          String(id || ""),
          "server: upserted 1 row",
          user,
        );
        return jsonResponse({
          success: true,
          message: "Upserted in " + tabName,
        });
      }

      // Default: append
      const records =
        payload.records && payload.records.length
          ? payload.records
          : [payload.data || {}];

      if (records.length > MAX_BATCH_RECORDS) {
        return jsonResponse({ success: false, message: "Request too large" });
      }

      const rows = records.map(function (record) {
        return buildRow(columns, record);
      });

      if (rows.length === 1) {
        sheet.appendRow(rows[0]);
      } else {
        sheet
          .getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
          .setValues(rows);
      }

      appendServerAudit_(
        ss,
        "append",
        type,
        String((records[0] && records[0][columns[0]]) || ""),
        "server: appended " + rows.length + " row(s)",
        user,
      );

      return jsonResponse({
        success: true,
        message: rows.length + " record(s) saved to " + tabName,
        type: type,
      });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    // Real error goes to the Executions log only — callers get a generic
    // message so internals (tab names, stack info) never leak.
    console.error("doPost failed: " + (err && err.stack ? err.stack : err));
    return jsonResponse({ success: false, message: "Request failed" });
  }
}

/**
 * Tamper-evident audit floor, written server-side on every successful
 * mutation. The client still uploads its own detailed audit entries (with
 * before/after diffs) as type:"audit" rows — those are forgeable/skippable,
 * these are not. Distinct ids mean the two never collide. Never lets an
 * audit failure break the mutation that already succeeded.
 */
function appendServerAudit_(ss, action, type, recordId, summary, user) {
  if (type === "audit") return;
  try {
    const columns = COLUMN_ORDER["audit"];
    let sheet = ss.getSheetByName(SHEET_MAP["audit"]);
    if (!sheet) sheet = ss.insertSheet(SHEET_MAP["audit"]);
    ensureHeaderRow(sheet, columns);
    sheet.appendRow(
      buildRow(columns, {
        id: "srv-" + Utilities.getUuid(),
        timestamp: new Date().toISOString(),
        action: action,
        recordType: type,
        recordId: recordId,
        summary: summary,
        user: user || "",
      }),
    );
  } catch (auditErr) {
    console.error("audit append failed: " + auditErr);
  }
}

/** Finds a record's row by id — data starts at row 2 (row 1 is the header). */
function findRowById(sheet, id) {
  if (id === undefined || id === null || id === "") return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

/**
 * Neutralizes spreadsheet formula injection: a string cell starting with
 * = + - @ or a tab/CR would otherwise be written as a live formula
 * (e.g. =IMPORTXML(...)) that executes when someone opens the sheet. The
 * leading apostrophe forces Sheets to store it as text; numbers (including
 * negatives) are untouched because they arrive as JSON numbers, not strings.
 */
function sanitizeCell_(value) {
  if (typeof value !== "string") return value;
  return /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
}

function buildRow(columns, data) {
  return columns.map(function (key) {
    const value = data[key];
    return value !== undefined && value !== null ? sanitizeCell_(value) : "";
  });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/**
 * ONE-TIME, MANUALLY-TRIGGERED migration to the unified "Cargo Trips" tab.
 * Already run successfully (37 rows migrated) — kept here as a historical
 * record, not meant to be run again.
 *
 * Copied every row from the 6 legacy per-plant tabs (H19, J14, "J15 -  J16",
 * "Matoshri enterprise", "Minerva Enterprises", "Machine Shop - Shirwal")
 * into "Cargo Trips", stamping the correct `plantType` on every row so they
 * can still be told apart. It does NOT delete or modify any of the original
 * tabs; they're left in place as an untouched backup.
 */
function migrateCargoSheets() {
  const ss = getSpreadsheet_();
  const cargoColumns = COLUMN_ORDER["cargo"];

  let cargoSheet = ss.getSheetByName(SHEET_MAP["cargo"]);
  if (!cargoSheet) cargoSheet = ss.insertSheet(SHEET_MAP["cargo"]);
  ensureHeaderRow(cargoSheet, cargoColumns);

  const sources = [
    { type: "cargo-h19", tab: "H19" },
    { type: "cargo-j14", tab: "J14" },
    { type: "cargo-j15-j16", tab: "J15 -  J16" },
    { type: "cargo-matoshri", tab: "Matoshri enterprise" },
    { type: "cargo-minerva", tab: "Minerva Enterprises" },
    { type: "cargo-machine-shop", tab: "Machine Shop - Shirwal" },
  ];

  let totalMigrated = 0;
  const summary = [];

  sources.forEach(function (source) {
    const sheet = ss.getSheetByName(source.tab);
    if (!sheet) {
      summary.push(source.tab + ": tab not found, skipped");
      return;
    }
    const rows = readRowsForColumns(sheet, CARGO_COLUMNS);
    if (rows.length === 0) {
      summary.push(source.tab + ": 0 rows");
      return;
    }
    const outRows = rows.map(function (row) {
      return cargoColumns.map(function (key) {
        if (key === "plantType") return source.type;
        const value = row[key];
        return value !== undefined && value !== null ? value : "";
      });
    });
    cargoSheet
      .getRange(
        cargoSheet.getLastRow() + 1,
        1,
        outRows.length,
        cargoColumns.length,
      )
      .setValues(outRows);
    totalMigrated += rows.length;
    summary.push(source.tab + ": " + rows.length + " rows migrated");
  });

  Logger.log("Cargo migration complete. Total rows migrated: " + totalMigrated);
  Logger.log(summary.join("\n"));
  return { totalMigrated: totalMigrated, summary: summary };
}

/**
 * Nightly backup: mirrors every live tab (everything in COLUMN_ORDER, incl.
 * Audit Log) from the main spreadsheet into a second, separate spreadsheet.
 * Merge only — existing backup rows are refreshed in place (matched by id,
 * i.e. column 0) and new rows are appended, but nothing is ever deleted from
 * the backup, even if a row disappears from the source. That way the backup
 * can't lose history if something is ever removed (accidentally or not)
 * from the live sheet.
 *
 * One-time setup:
 *   1. Create the backup spreadsheet (a normal, blank Google Sheet works —
 *      tabs are created automatically on first run).
 *   2. Project Settings -> Script Properties -> add BACKUP_SPREADSHEET_ID,
 *      value = the ID from that spreadsheet's URL.
 *   3. Run createNightlyBackupTrigger() once (Run menu, pick it from the
 *      dropdown) to schedule this function for ~midnight every night.
 *      Triggers run off the saved script, not the web app deployment, so no
 *      redeploy is needed for this part.
 */
function runNightlyBackup() {
  const backupId = getProps_().getProperty("BACKUP_SPREADSHEET_ID");
  if (!backupId) {
    Logger.log(
      "runNightlyBackup: BACKUP_SPREADSHEET_ID script property not set, skipping.",
    );
    return;
  }

  const sourceSs = getSpreadsheet_();
  const destSs = SpreadsheetApp.openById(backupId);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const summary = [];
    Object.keys(COLUMN_ORDER).forEach(function (type) {
      const columns = COLUMN_ORDER[type];
      const tabName = SHEET_MAP[type];
      const sourceRows = readSheetRows(sourceSs, type);
      if (sourceRows === null) {
        summary.push(tabName + ": source tab missing, skipped");
        return;
      }

      let destSheet = destSs.getSheetByName(tabName);
      if (!destSheet) destSheet = destSs.insertSheet(tabName);
      ensureHeaderRow(destSheet, columns);

      const idKey = columns[0];
      const destIndex = buildIdRowIndex_(destSheet, idKey);

      let updated = 0;
      let appended = 0;
      const newRows = [];
      sourceRows.forEach(function (row) {
        const id = row[idKey];
        const rowValues = buildRow(columns, row);
        const destRowNum =
          id !== undefined && id !== null && id !== ""
            ? destIndex[String(id)]
            : undefined;
        if (destRowNum) {
          destSheet
            .getRange(destRowNum, 1, 1, rowValues.length)
            .setValues([rowValues]);
          updated++;
        } else {
          newRows.push(rowValues);
          appended++;
        }
      });
      if (newRows.length > 0) {
        destSheet
          .getRange(
            destSheet.getLastRow() + 1,
            1,
            newRows.length,
            columns.length,
          )
          .setValues(newRows);
      }
      summary.push(
        tabName + ": " + updated + " updated, " + appended + " appended",
      );
    });
    Logger.log("Nightly backup complete.\n" + summary.join("\n"));
  } finally {
    lock.releaseLock();
  }
}

/** Maps id (column 0 value, as a string) -> 1-based sheet row number, for
 * every existing data row in `sheet`. Used to decide update-in-place vs
 * append during merge. */
function buildIdRowIndex_(sheet, idKey) {
  const index = {};
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return index;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i][0];
    if (id === "" || id === null || id === undefined) continue;
    index[String(id)] = i + 2;
  }
  return index;
}

/**
 * Run this once (Run menu -> createNightlyBackupTrigger) to schedule
 * runNightlyBackup() for ~midnight every night. Safe to run again later
 * (e.g. after changing the time) — it clears any previous trigger for this
 * function first so duplicates never pile up.
 */
function createNightlyBackupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "runNightlyBackup") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger("runNightlyBackup")
    .timeBased()
    .atHour(0)
    .everyDays(1)
    .create();
  Logger.log("Nightly backup trigger scheduled for ~00:00 daily.");
}
