// ============================================================
// BURMELIN — Google Sheets Admin Backend (Code.gs)
// ============================================================
//
// SETUP (one-time):
// 1. Create a Google Sheet at https://sheets.google.com
// 2. Open Apps Script: Extensions > Apps Script
// 3. Paste this entire file into Code.gs, replacing any default content
// 4. Set SPREADSHEET_ID below (the long ID from your Sheet's URL)
//    Example URL: docs.google.com/spreadsheets/d/1BxiMVs0XRA...5nFM/edit
//    Copy the part between /d/ and /edit
// 5. Set ADMIN_KEY to something secret — same value goes in admin.html
// 6. Run initSheet() once: Run menu > Run function > initSheet
//    (approve permissions when prompted)
// 7. Deploy: Deploy > New Deployment
//    - Type: Web App
//    - Execute as: Me
//    - Who has access: Anyone
//    - Click Deploy, copy the URL
// 8. Paste that URL in admin.html and products.html where it says
//    APPS_SCRIPT_URL = 'YOUR_APPS_SCRIPT_URL_HERE'
//
// To update code after changes: Deploy > Manage Deployments > edit > New version
// ============================================================

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
const ADMIN_KEY      = 'burmelin-admin-2026';   // ← change this!
const FOLDER_NAME    = 'BURMELIN Product Images';

// ── Helpers ──────────────────────────────────────────────────

function ss()  { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function sh(n) { return ss().getSheetByName(n); }

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeJSON(str, fallback) {
  try { return JSON.parse(str); } catch(e) { return fallback; }
}

function authCheck(key) {
  if (key !== ADMIN_KEY) throw new Error('Unauthorized');
}

// ── One-time setup ────────────────────────────────────────────

function initSheet() {
  // Touch DriveApp so the Drive scope is included in the authorization
  DriveApp.getRootFolder();
  const spreadsheet = ss();

  let products = spreadsheet.getSheetByName('Products');
  if (!products) products = spreadsheet.insertSheet('Products');
  products.clearContents();
  products.getRange(1, 1, 1, 12).setValues([[
    'ID', 'Name', 'Price', 'Description', 'Category',
    'Image', 'Stock', 'Active', 'Code', 'Colors', 'Sizes', 'Badge'
  ]]);
  products.setFrozenRows(1);

  let orders = spreadsheet.getSheetByName('Orders');
  if (!orders) orders = spreadsheet.insertSheet('Orders');
  orders.clearContents();
  orders.getRange(1, 1, 1, 8).setValues([[
    'Order ID', 'Customer Name', 'Phone', 'Address',
    'Items', 'Total', 'Status', 'Date'
  ]]);
  orders.setFrozenRows(1);

  Logger.log('Sheets initialized successfully.');
}

// ── Public GET (store fetches active products) ────────────────

function doGet(e) {
  try {
    if (e.parameter.type === 'products') return respond(getActiveProducts());
    return respond({ error: 'Use ?type=products' });
  } catch(err) { return respond({ error: err.message }); }
}

// ── Admin POST ────────────────────────────────────────────────

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { action, key } = body;

    switch (action) {
      case 'getProducts':       authCheck(key); return respond(getAllProducts());
      case 'getOrders':         authCheck(key); return respond(getOrders());
      case 'addProduct':        authCheck(key); return respond(addProduct(body));
      case 'editProduct':       authCheck(key); return respond(editProduct(body));
      case 'deleteProduct':     authCheck(key); return respond(deleteProduct(body));
      case 'updateOrderStatus': authCheck(key); return respond(updateOrderStatus(body));
      case 'uploadImage':       authCheck(key); return respond(uploadImage(body));
      case 'addOrder':                          return respond(addOrder(body));
      default: return respond({ error: 'Unknown action: ' + action });
    }
  } catch(err) { return respond({ error: err.message }); }
}

// ── Products ──────────────────────────────────────────────────

function rowToProduct(r) {
  return {
    id:     r[0],
    name:   r[1],
    price:  Number(r[2]),
    desc:   r[3],
    cat:    r[4],
    img:    r[5],
    stock:  Number(r[6]),
    active: r[7] === true || r[7] === 'TRUE' || r[7] === 'true' || r[7] === 1,
    code:   r[8],
    colors: safeJSON(r[9], []),
    sizes:  safeJSON(r[10], []),
    badge:  r[11] || ''
  };
}

function getActiveProducts() {
  const rows = sh('Products').getDataRange().getValues();
  return rows.slice(1).filter(r => r[0]).map(rowToProduct).filter(p => p.active);
}

function getAllProducts() {
  const rows = sh('Products').getDataRange().getValues();
  return rows.slice(1).filter(r => r[0]).map(rowToProduct);
}

function addProduct(body) {
  const id = 'PROD_' + Date.now();
  sh('Products').appendRow([
    id, body.name, body.price, body.desc || '', body.cat,
    body.img || '', body.stock || 0, body.active !== false,
    body.code || '', JSON.stringify(body.colors || []),
    JSON.stringify(body.sizes || []), body.badge || ''
  ]);
  return { id };
}

function editProduct(body) {
  const sheet = sh('Products');
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(body.id)) {
      const r = i + 1;
      sheet.getRange(r, 2, 1, 11).setValues([[
        body.name,
        body.price,
        body.desc || '',
        body.cat,
        body.img || rows[i][5],   // keep existing image if none provided
        body.stock != null ? body.stock : rows[i][6],
        body.active !== false,
        body.code || '',
        JSON.stringify(body.colors || []),
        JSON.stringify(body.sizes  || []),
        body.badge || ''
      ]]);
      return {};
    }
  }
  throw new Error('Product not found');
}

function deleteProduct(body) {
  const sheet = sh('Products');
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(body.id)) {
      sheet.deleteRow(i + 1);
      return {};
    }
  }
  throw new Error('Product not found');
}

// ── Orders ────────────────────────────────────────────────────

function rowToOrder(r) {
  return {
    orderId:  r[0],
    customer: r[1],
    phone:    r[2],
    address:  r[3],
    items:    safeJSON(r[4], []),
    total:    Number(r[5]),
    status:   r[6] || 'Pending',
    date:     r[7]
  };
}

function getOrders() {
  const rows = sh('Orders').getDataRange().getValues();
  return rows.slice(1).filter(r => r[0]).map(rowToOrder).reverse();
}

function addOrder(body) {
  const orderId = 'ORD-' + Date.now();
  const date = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm');
  sh('Orders').appendRow([
    orderId,
    body.customer || '',
    body.phone    || '',
    body.address  || '',
    JSON.stringify(body.items || []),
    body.total || 0,
    'Pending',
    date
  ]);
  return { orderId };
}

function updateOrderStatus(body) {
  const sheet = sh('Orders');
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(body.orderId)) {
      sheet.getRange(i + 1, 7).setValue(body.status);
      return {};
    }
  }
  throw new Error('Order not found');
}

// ── Image Upload to Google Drive ──────────────────────────────

function uploadImage(body) {
  const { filename, base64 } = body;

  const folders = DriveApp.getFoldersByName(FOLDER_NAME);
  const folder  = folders.hasNext() ? folders.next() : DriveApp.createFolder(FOLDER_NAME);

  const ext      = (filename.split('.').pop() || 'jpg').toLowerCase();
  const mimeMap  = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', gif:'image/gif' };
  const mimeType = mimeMap[ext] || 'image/jpeg';

  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, filename);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return { url: 'https://drive.google.com/uc?id=' + file.getId() + '&export=view' };
}
