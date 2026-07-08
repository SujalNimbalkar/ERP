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
};

const CARGO_COLUMNS = [
  'documentNo', 'date',
  'fromLocation', 'toParty',
  'vehicleNo', 'lrNo',
  'materialType', 'materialCode', 'materialDescription', 'hsnCode',
  'quantity', 'uom', 'perPartWt', 'totalWt',
  'transportRate', 'transportAmount', 'rateTier',
  'dieselFillRef', 'dieselUsedThisTrip', 'tollOverloadAmount',
  'receivedQty', 'receivedDate',
];

const COLUMN_ORDER = {
  'cargo-h19': CARGO_COLUMNS,
  'cargo-j14': CARGO_COLUMNS,
  'cargo-j15-j16': CARGO_COLUMNS,
  'cargo-matoshri': CARGO_COLUMNS,
  'cargo-minerva': CARGO_COLUMNS,
  'cargo-machine-shop': CARGO_COLUMNS,
  infra: [
    'date', 'vehicleNo', 'crusherChallanNo', 'materialType', 'crusherRate',
    'crusherBrass', 'crusherAmount', 'diesel', 'challanNo', 'customerName',
    'qtyBrass', 'rate', 'totalAmount', 'difference',
  ],
  pallets: [
    'date', 'dcNo', 'plant', 'toParty', 'materialCode', 'materialDescription',
    'uom', 'qty', 'vehicleNo', 'lrNo', 'freightAmount', 'remarks',
  ],
  diesel: [
    'fillRef', 'date', 'vehicleNo', 'fillAmount', 'liters',
    'driverName', 'expectedTrips', 'note',
  ],
  drivers: [
    'driverId', 'firstName', 'middleName', 'surname',
    'mobileNumber', 'aadharNumber', 'accountNumber', 'totalSalary',
  ],
  salary: [
    'driverId', 'driverName', 'paymentType', 'scheduledSalaryDate', 'paymentDate',
    'amount', 'reason',
  ],
  ledger: [
    'date', 'receiptNo', 'particular', 'vehicleNo', 'rate', 'brass', 'debit', 'credit',
  ],
};

function doGet() {
  return jsonResponse({ success: true, message: 'Sahyadri ERP API is running' });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Empty request body');
    }

    const payload = JSON.parse(e.postData.contents);
    const type = payload.type;

    if (!type || !SHEET_MAP[type]) {
      throw new Error('Unknown type: ' + type);
    }

    const tabName = SHEET_MAP[type];
    const records = payload.records && payload.records.length
      ? payload.records
      : [payload.data || {}];

    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(tabName);
    if (!sheet) {
      throw new Error('Sheet tab not found: ' + tabName);
    }

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
