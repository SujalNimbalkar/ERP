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
  ledger: 'Ledger',
  materials: 'Material Master',
  'vehicle-master': 'Vehicle Master',
  'vehicle-maintenance': 'Vehicle Maintenance',
  bills: 'Bills',
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
  // add a "billingCompany" header as the final column of each cargo tab.
  'billingCompany',
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
  ],
  drivers: [
    'driverId', 'firstName', 'middleName', 'surname',
    'mobileNumber', 'aadharNumber', 'accountNumber', 'totalSalary',
  ],
  salary: [
    'id', 'driverId', 'driverName', 'paymentType', 'scheduledSalaryDate', 'paymentDate',
    'amount', 'reason',
  ],
  ledger: [
    'id', 'date', 'receiptNo', 'particular', 'vehicleNo', 'rate', 'brass', 'debit', 'credit',
  ],
  materials: [
    'id', 'code', 'name', 'weightPerPieceKg', 'ratePerKg', 'addedAt',
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
};

/**
 * GET ?action=list          → all tabs as { type: rows[] }
 * GET ?action=list&type=a,b → only the given types
 * Rows are mapped back to objects using COLUMN_ORDER; dates become yyyy-MM-dd.
 */
function doGet(e) {
  const action = e && e.parameter ? e.parameter.action : '';
  if (action === 'list') {
    const requested = e.parameter.type;
    const types = requested ? requested.split(',') : Object.keys(COLUMN_ORDER);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const data = {};
    const missing = [];
    types.forEach(function (type) {
      if (!SHEET_MAP[type] || !COLUMN_ORDER[type]) return;
      const rows = readSheetRows(ss, type);
      if (rows === null) {
        missing.push(SHEET_MAP[type]);
        data[type] = [];
      } else {
        data[type] = rows;
      }
    });
    return jsonResponse({ success: true, data: data, missing: missing });
  }
  return jsonResponse({ success: true, message: 'Sahyadri ERP API is running' });
}

/**
 * Reads a tab back as objects. Returns null when the tab doesn't exist.
 * Row 1 is only skipped when it actually looks like a header — tabs where
 * the app appended data from row 1 (no header typed in) keep every record.
 */
function readSheetRows(ss, type) {
  const sheet = ss.getSheetByName(SHEET_MAP[type]);
  if (!sheet) return null;
  const columns = COLUMN_ORDER[type];
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return [];
  const values = sheet.getRange(1, 1, lastRow, columns.length).getValues();
  const start = isHeaderRow(values[0], columns) ? 1 : 0;
  const rows = [];
  for (var r = start; r < values.length; r++) {
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

    if (!type || !SHEET_MAP[type]) {
      throw new Error('Unknown type: ' + type);
    }

    const tabName = SHEET_MAP[type];
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(tabName);
    if (!sheet) {
      throw new Error('Sheet tab not found: ' + tabName);
    }

    if (action === 'delete') {
      const rowNum = findRowById(sheet, payload.id);
      if (rowNum > 0) sheet.deleteRow(rowNum);
      return jsonResponse({ success: true, message: 'Deleted from ' + tabName });
    }

    if (action === 'upsert') {
      const data = payload.data || {};
      const idKey = COLUMN_ORDER[type][0];
      const id = data[idKey];
      const row = buildRow(type, data);
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
      return buildRow(type, record);
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

function findRowById(sheet, id) {
  if (id === undefined || id === null || id === '') return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return -1;
  var values = sheet.getRange(1, 1, lastRow, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) return i + 1;
  }
  return -1;
}

function buildRow(type, data) {
  const columns = COLUMN_ORDER[type];
  if (!columns) {
    throw new Error('No column mapping for type: ' + type);
  }
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
