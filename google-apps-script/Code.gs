/**
 * Sahyadri Infra ERP — Google Apps Script Web App
 *
 * Cargo columns match the structured form sections (document → receipt).
 * Pallet columns match Delivery Challan format from sample bills.
 */

const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID_HERE";

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
  materials: "Material Master",
  "vehicle-master": "Vehicle Master",
  "vehicle-maintenance": "Vehicle Maintenance",
  locations: "Locations",
  staff: "Staff Master",
  bills: "Bills",
  audit: "Audit Log",
};

const CARGO_COLUMNS = [
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

/** Every plant lives in one shared tab now — `plantType` (e.g. "cargo-h19")
 * says which one, appended last so it doesn't disturb the legacy per-plant
 * tabs that still use plain CARGO_COLUMNS. */
const CARGO_TRIPS_COLUMNS = CARGO_COLUMNS.concat(["plantType"]);

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
    // Appended last so existing sheet rows keep their column alignment
    "ratePerLiter",
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
  materials: ["id", "code", "name", "weightPerPieceKg", "ratePerKg", "addedAt"],
  // One list for both Cargo Plants and Delivery Vendors — `isCargoPlant`
  // ("true"/"false") flags which; `cargoType` is only set for plant rows.
  locations: ["id", "name", "isCargoPlant", "cargoType", "notes", "addedAt", "updatedAt"],
  staff: [
    "id",
    "name",
    "role",
    "mobileNumber",
    "rate",
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
 * GET ?action=list          → all tabs as { type: rows[] }
 * GET ?action=list&type=a,b → only the given types
 * Rows are mapped back to objects using COLUMN_ORDER; dates become yyyy-MM-dd.
 */
function doGet(e) {
  const action = e && e.parameter ? e.parameter.action : "";
  if (action === "list") {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const requested = e.parameter.type;
    let types;
    if (requested) {
      types = requested.split(",");
    } else {
      // The audit history can get large — it is only returned when asked for
      // explicitly (?type=audit), never in the default startup sweep.
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
    return jsonResponse({
      success: true,
      data: data,
      missing: missing,
      missingTypes: missingTypes,
    });
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
      throw new Error("Empty request body");
    }

    const payload = JSON.parse(e.postData.contents);
    const type = payload.type;
    const action = payload.action || "append";

    if (!type) {
      throw new Error("Unknown type: " + type);
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const resolved = resolveTab(ss, type);
    if (!resolved) {
      throw new Error("Unknown type: " + type);
    }

    const tabName = resolved.tabName;
    const columns = resolved.columns;
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      throw new Error("Sheet tab not found: " + tabName);
    }
    // Row 1 is always the column names; data lives from row 2 down.
    ensureHeaderRow(sheet, columns);

    if (action === "delete") {
      const rowNum = findRowById(sheet, payload.id);
      if (rowNum > 0) sheet.deleteRow(rowNum);
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
      return jsonResponse({ success: true, message: "Upserted in " + tabName });
    }

    // Default: append
    const records =
      payload.records && payload.records.length
        ? payload.records
        : [payload.data || {}];

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

    return jsonResponse({
      success: true,
      message: rows.length + " record(s) saved to " + tabName,
      type: type,
    });
  } catch (err) {
    return jsonResponse({
      success: false,
      message: err.message || String(err),
    });
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

function buildRow(columns, data) {
  return columns.map(function (key) {
    const value = data[key];
    return value !== undefined && value !== null ? value : "";
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
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
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
