/**
 * Sahyadri Infra ERP — Google Apps Script Web App
 *
 * Cargo columns match the structured form sections (document → receipt).
 * Pallet columns match Delivery Challan format from sample bills.
 */

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';

const SHEET_MAP = {
  'cargo-h19': 'H19',
  'cargo-j14': 'J14',
  'cargo-j15-j16': 'J15 -  J16',
  'cargo-matoshri': 'Matoshri enterprise',
  'cargo-minerva': 'Minerva Enterprises',
  'cargo-machine-shop': 'Machine Shop - Shirwal',
  infra: 'Sahyadri Infra',
  pallets: 'Return Pallets',
  diesel: 'Diesel Tank',
  drivers: 'Drivers',
  salary: 'Salary',
  'driver-expense': 'Driver Expenses',
  ledger: 'Ledger',
  materials: 'Material Master',
  'vehicle-master': 'Vehicle Master',
  'vehicle-maintenance': 'Vehicle Maintenance',
  parties: 'Party Master',
  'cargo-sources': 'Cargo Sources',
  staff: 'Staff Master',
  bills: 'Bills',
  audit: 'Audit Log',
};

const CARGO_COLUMNS = [
  'id', 'documentNo', 'date',
  'fromLocation', 'toParty',
  'vehicleNo', 'lrNo',
  'materialCode', 'materialDescription', 'hsnCode',
  'quantity', 'uom', 'perPartWt', 'totalWt',
  'transportRate', 'transportAmount', 'rateTier',
  'dieselFillRef', 'dieselUsedThisTrip', 'tollOverloadAmount',
  'receivedQty', 'receivedDate',
  // Appended last so existing sheet rows keep their column alignment —
  // add "billingCompany", "driverId", "driverName" headers as the final
  // columns of each cargo tab.
  'billingCompany',
  // Who drove the trip — powers the driver analytics on the Dashboard
  'driverId', 'driverName',
];

const COLUMN_ORDER = {
  'cargo-h19': CARGO_COLUMNS,
  'cargo-j14': CARGO_COLUMNS,
  'cargo-j15-j16': CARGO_COLUMNS,
  'cargo-matoshri': CARGO_COLUMNS,
  'cargo-minerva': CARGO_COLUMNS,
  'cargo-machine-shop': CARGO_COLUMNS,
  infra: [
    'id', 'date', 'vehicleNo', 'crusherChallanNo', 'materialType', 'crusherRate',
    'crusherBrass', 'crusherAmount', 'diesel', 'challanNo', 'customerName',
    'qtyBrass', 'rate', 'totalAmount', 'difference',
  ],
  pallets: [
    'id', 'date', 'dcNo', 'plant', 'toParty', 'materialCode', 'materialDescription',
    'uom', 'qty', 'vehicleNo', 'lrNo', 'freightAmount', 'remarks', 'billingCompany',
  ],
  diesel: [
    'id', 'fillRef', 'date', 'vehicleNo', 'fillAmount', 'liters',
    'driverId', 'driverName', 'expectedTrips', 'note',
    // Appended last so existing sheet rows keep their column alignment
    'ratePerLiter',
  ],
  drivers: [
    'driverId', 'firstName', 'middleName', 'surname',
    'mobileNumber', 'aadharNumber', 'accountNumber', 'totalSalary',
  ],
  salary: [
    'id', 'driverId', 'driverName', 'paymentType', 'scheduledSalaryDate', 'paymentDate',
    'amount', 'reason',
  ],
  'driver-expense': [
    'id', 'driverId', 'driverName', 'date', 'expenseType', 'amount', 'paymentMode', 'note',
  ],
  ledger: [
    'id', 'date', 'receiptNo', 'particular', 'vehicleNo', 'rate', 'brass', 'debit', 'credit',
  ],
  materials: [
    'id', 'code', 'name', 'weightPerPieceKg', 'ratePerKg', 'addedAt',
  ],
  parties: [
    'id', 'name', 'notes', 'addedAt',
  ],
  'cargo-sources': [
    'type', 'label', 'sheetTab', 'addedAt',
  ],
  staff: [
    'id', 'name', 'role', 'mobileNumber', 'rate', 'notes', 'addedAt', 'updatedAt',
  ],
  'vehicle-master': [
    'id', 'registrationNo', 'engineNo', 'chassisNo',
    'vehicleType', 'makeModel', 'manufacturer', 'yearOfManufacture',
    'loadCapacityKg', 'fuelType', 'ownershipType', 'ownerName',
    'assignedDriverId', 'assignedDriverName',
    'insurancePolicyNo', 'insuranceCompany', 'insuranceValidUpto',
    'fitnessValidUpto', 'pucValidUpto', 'roadTaxValidUpto',
    'permitType', 'permitValidUpto', 'rtoPassingDate',
    'notes', 'addedAt',
  ],
  'vehicle-maintenance': [
    'id', 'vehicleId', 'vehicleNo', 'date', 'maintenanceType',
    'partName', 'partNumber', 'description', 'vendorName', 'invoiceNo',
    'labourCost', 'partsCost', 'totalCost',
    'odometerKm', 'nextServiceKm', 'nextServiceDate',
    'doneBy', 'remarks', 'addedAt',
  ],
  bills: [
    'id', 'invoiceNo', 'invoiceDate', 'month', 'company', 'plant', 'category',
    'hsnNo', 'customerName', 'customerAddress', 'customerPin', 'customerGst',
    'gstPercent', 'rateSummary', 'totalWeightKg',
    'subTotal', 'cgst', 'sgst', 'grandTotal',
    'description', 'lineCount', 'createdAt',
    // Full bill snapshot (JSON) — lets any device reopen/print the exact bill
    'billJson',
  ],
  audit: [
    'id', 'timestamp', 'action', 'recordType', 'recordId',
    'documentNo', 'summary', 'beforeJson', 'afterJson',
  ],
};

/**
 * Resolves a request `type` to a { tabName, columns, dynamic } triple.
 * Built-in types come straight from SHEET_MAP/COLUMN_ORDER. Any other
 * "cargo-*" type is a custom plant added at runtime from the app — its tab
 * name is looked up from the "Cargo Sources" master tab, and it shares the
 * standard CARGO_COLUMNS layout. Returns null when the type is unknown.
 */
function resolveTab(ss, type) {
  if (SHEET_MAP[type] && COLUMN_ORDER[type]) {
    return { tabName: SHEET_MAP[type], columns: COLUMN_ORDER[type], dynamic: false };
  }
  if (String(type).indexOf('cargo-') === 0) {
    const customSources = readSheetRows(ss, 'cargo-sources') || [];
    const match = customSources.filter(function (row) {
      return row.type === type;
    })[0];
    if (match && match.sheetTab) {
      return { tabName: String(match.sheetTab), columns: CARGO_COLUMNS, dynamic: true };
    }
  }
  return null;
}

/**
 * GET ?action=list          → all tabs as { type: rows[] }
 * GET ?action=list&type=a,b → only the given types
 * Rows are mapped back to objects using COLUMN_ORDER; dates become yyyy-MM-dd.
 */
function doGet(e) {
  const action = e && e.parameter ? e.parameter.action : '';
  if (action === 'list') {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const requested = e.parameter.type;
    let types;
    if (requested) {
      types = requested.split(',');
    } else {
      // The audit history can get large — it is only returned when asked for
      // explicitly (?type=audit), never in the default startup sweep.
      const customCargoTypes = (readSheetRows(ss, 'cargo-sources') || [])
        .map(function (row) {
          return row.type;
        })
        .filter(Boolean);
      types = Object.keys(COLUMN_ORDER)
        .filter(function (t) { return t !== 'audit'; })
        .concat(customCargoTypes);
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
    return jsonResponse({ success: true, data: data, missing: missing, missingTypes: missingTypes });
  }
  return jsonResponse({ success: true, message: 'Sahyadri ERP API is running' });
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
  const blank = first.every(function (c) { return c === '' || c === null; });
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
 * Reads a tab back as objects. Returns null when the tab doesn't exist.
 * Row 1 is the header (created/repaired if missing); data is rows 2+.
 */
function readSheetRows(ss, type) {
  // "cargo-sources" itself is a built-in type (in SHEET_MAP), so resolveTab's
  // dynamic-lookup branch (which calls back into this function for
  // "cargo-sources") never recurses more than one level deep.
  const resolved = resolveTab(ss, type);
  if (!resolved) return null;
  const sheet = ss.getSheetByName(resolved.tabName);
  if (!sheet) return null;
  const columns = resolved.columns;
  ensureHeaderRow(sheet, columns);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, columns.length).getValues();
  const rows = [];
  for (var r = 0; r < values.length; r++) {
    const row = values[r];
    const hasValue = row.some(function (cell) {
      return cell !== '' && cell !== null;
    });
    if (!hasValue) continue;
    const obj = {};
    columns.forEach(function (key, i) {
      var value = row[i];
      if (value instanceof Date) {
        value = Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
      obj[key] = value;
    });
    rows.push(obj);
  }
  return rows;
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
    if (cell === '' || cell === null || cell === undefined) continue;
    nonEmpty++;
    var normCell = String(cell).toLowerCase().replace(/[^a-z0-9]/g, '');
    var normKey = String(columns[i]).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normCell === normKey) matches++;
  }
  if (nonEmpty === 0) return true; // blank first row — skip it
  return matches >= Math.ceil(nonEmpty / 2);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Empty request body');
    }

    const payload = JSON.parse(e.postData.contents);
    const type = payload.type;
    const action = payload.action || 'append';

    if (!type) {
      throw new Error('Unknown type: ' + type);
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const resolved = resolveTab(ss, type);
    if (!resolved) {
      throw new Error('Unknown type: ' + type);
    }

    const tabName = resolved.tabName;
    const columns = resolved.columns;
    let sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      // Built-in tabs are expected to already exist; a custom plant's tab is
      // created on its first save so adding one in-app needs no manual step.
      if (!resolved.dynamic) {
        throw new Error('Sheet tab not found: ' + tabName);
      }
      sheet = ss.insertSheet(tabName);
    }
    // Row 1 is always the column names; data lives from row 2 down.
    ensureHeaderRow(sheet, columns);

    if (action === 'delete') {
      const rowNum = findRowById(sheet, payload.id);
      if (rowNum > 0) sheet.deleteRow(rowNum);
      return jsonResponse({ success: true, message: 'Deleted from ' + tabName });
    }

    if (action === 'upsert') {
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
      return jsonResponse({ success: true, message: 'Upserted in ' + tabName });
    }

    // Default: append
    const records = payload.records && payload.records.length
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
      message: rows.length + ' record(s) saved to ' + tabName,
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
  if (id === undefined || id === null || id === '') return -1;
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
    return value !== undefined && value !== null ? value : '';
  });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
