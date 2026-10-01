const express = require('express')
const Database = require('better-sqlite3')
const path = require('path')

const app = express()
app.use(express.json())
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})
app.use(express.static(__dirname))

const databaseFile =
  process.env.DATABASE_FILE || path.join(__dirname, 'database.sqlite')
const db = new Database(databaseFile)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS delivery_people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    address TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS inventory_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    delivery_person_id INTEGER,
    deliverer_name TEXT,
    address TEXT,
    transporter_name TEXT,
    description TEXT,
    warehouse_code TEXT,
    product_code TEXT,
    customs_declaration_no TEXT,
    customs_declaration_date TEXT,
    contract_no TEXT,
    contract_date TEXT,
    invoice_no TEXT,
    invoice_date TEXT,
    voucher_no TEXT UNIQUE NOT NULL,
    voucher_date TEXT NOT NULL,
    original_voucher_no TEXT,
    original_voucher_date TEXT,
    exchange_rate REAL DEFAULT 1,
    currency TEXT DEFAULT 'VND',
    receipt_type TEXT,
    item_type TEXT,
    is_self_supplied INTEGER DEFAULT 0,
    total_quantity REAL DEFAULT 0,
    total_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'New',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (delivery_person_id) REFERENCES delivery_people(id)
  );

  CREATE TABLE IF NOT EXISTS inventory_receipt_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id INTEGER NOT NULL,
    line_number INTEGER,
    item_code TEXT NOT NULL,
    item_name TEXT,
    ecus_item_code TEXT,
    warehouse_code TEXT,
    debit_account TEXT,
    credit_account TEXT,
    unit TEXT,
    quantity REAL DEFAULT 0,
    unit_price REAL DEFAULT 0,
    amount REAL DEFAULT 0,
    FOREIGN KEY (receipt_id) REFERENCES inventory_receipts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS inventory_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receiver_name TEXT,
    address TEXT,
    transporter_name TEXT,
    description TEXT,
    warehouse_code TEXT,
    customs_declaration_no TEXT,
    customs_declaration_date TEXT,
    contract_no TEXT,
    contract_date TEXT,
    invoice_no TEXT,
    invoice_date TEXT,
    voucher_no TEXT UNIQUE NOT NULL,
    voucher_date TEXT NOT NULL,
    original_voucher_no TEXT,
    original_voucher_date TEXT,
    exchange_rate REAL DEFAULT 1,
    currency TEXT DEFAULT 'VND',
    issue_type TEXT,
    item_type TEXT,
    is_self_supplied INTEGER DEFAULT 0,
    total_quantity REAL DEFAULT 0,
    total_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'New',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS inventory_issue_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id INTEGER NOT NULL,
    line_number INTEGER,
    item_code TEXT NOT NULL,
    item_name TEXT,
    ecus_item_code TEXT,
    warehouse_code TEXT,
    debit_account TEXT,
    credit_account TEXT,
    unit TEXT,
    quantity REAL DEFAULT 0,
    unit_price REAL DEFAULT 0,
    amount REAL DEFAULT 0,
    FOREIGN KEY (issue_id) REFERENCES inventory_issues(id) ON DELETE CASCADE
  );
`)

function ensureColumn(tableName, columnName, columnDefinition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all()
  if (!columns.some(column => column.name === columnName)) {
    db.exec(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`
    )
  }
}

// Keep databases created by earlier versions compatible with the new receipt fields.
ensureColumn('inventory_receipts', 'delivery_person_id', 'INTEGER')
ensureColumn('inventory_receipts', 'product_code', 'TEXT')

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_delivery_people_active_name
    ON delivery_people (is_active, name);
  CREATE INDEX IF NOT EXISTS idx_inventory_receipts_delivery_person
    ON inventory_receipts (delivery_person_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_receipt_details_receipt
    ON inventory_receipt_details (receipt_id);
`)

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function requireText(value, label) {
  const text = cleanText(value)
  if (!text) throw new Error(`${label} là bắt buộc.`)
  return text
}

function parseOptionalDate(value, label, required = false) {
  const dateText = cleanText(value)
  if (!dateText) {
    if (required) throw new Error(`${label} là bắt buộc.`)
    return null
  }

  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText)
  if (!matched) throw new Error(`${label} không đúng định dạng yyyy-mm-dd.`)

  const [year, month, day] = matched.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${label} không hợp lệ.`)
  }
  return dateText
}

function parseNumber(value, label, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback
  const number = Number(value)
  if (!Number.isFinite(number)) throw new Error(`${label} phải là số hợp lệ.`)
  return number
}

function parseDeliveryPersonId(value) {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0)
    throw new Error('Vui lòng chọn nhà cung cấp.')
  return id
}

app.get('/api/delivery-people', (req, res) => {
  const people = db
    .prepare(
      `
    SELECT id, name, address
    FROM delivery_people
    WHERE is_active = 1
    ORDER BY name COLLATE NOCASE
  `
    )
    .all()
  res.json({ success: true, data: people })
})

app.post('/api/delivery-people', (req, res) => {
  try {
    const name = requireText(req.body.name, 'Tên nhà cung cấp')
    const address = requireText(req.body.address, 'Địa chỉ nhà cung cấp')
    const existing = db
      .prepare('SELECT id FROM delivery_people WHERE name = ? COLLATE NOCASE')
      .get(name)
    db.prepare(
      `
      INSERT INTO delivery_people (name, address)
      VALUES (?, ?)
      ON CONFLICT(name) DO UPDATE SET
        address = excluded.address,
        is_active = 1,
        updated_at = CURRENT_TIMESTAMP
    `
    ).run(name, address)
    const person = db
      .prepare(
        'SELECT id, name, address FROM delivery_people WHERE name = ? COLLATE NOCASE'
      )
      .get(name)
    res.status(existing ? 200 : 201).json({ success: true, data: person })
  } catch (error) {
    res.status(422).json({ success: false, error: error.message })
  }
})

const insertReceipt = db.prepare(`
  INSERT INTO inventory_receipts (
    delivery_person_id, deliverer_name, address, transporter_name, description,
    warehouse_code, product_code, customs_declaration_no, customs_declaration_date,
    contract_no, contract_date, invoice_no, invoice_date, voucher_no, voucher_date,
    original_voucher_no, original_voucher_date, exchange_rate, currency, receipt_type,
    item_type, is_self_supplied, total_quantity, total_amount, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const insertReceiptDetail = db.prepare(`
  INSERT INTO inventory_receipt_details (
    receipt_id, line_number, item_code, item_name, ecus_item_code, warehouse_code,
    debit_account, credit_account, unit, quantity, unit_price, amount
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const updateReceipt = db.prepare(`
  UPDATE inventory_receipts SET
    delivery_person_id = ?, deliverer_name = ?, address = ?, transporter_name = ?,
    description = ?, warehouse_code = ?, product_code = ?, customs_declaration_no = ?,
    customs_declaration_date = ?, contract_no = ?, contract_date = ?, invoice_no = ?,
    invoice_date = ?, voucher_date = ?, original_voucher_no = ?, original_voucher_date = ?,
    exchange_rate = ?, currency = ?, receipt_type = ?, item_type = ?, is_self_supplied = ?,
    total_quantity = ?, total_amount = ? WHERE voucher_no = ?
`)
const deleteReceiptDetails = db.prepare(
  'DELETE FROM inventory_receipt_details WHERE receipt_id = ?'
)

const createReceipt = db.transaction(body => {
  const deliveryPersonId = Number(body.deliveryPersonId) || null
  const deliveryPerson = deliveryPersonId ? db
    .prepare(
      `
    SELECT id, name, address
    FROM delivery_people
    WHERE id = ? AND is_active = 1
  `
    )
    .get(deliveryPersonId) : null
  if (deliveryPersonId && !deliveryPerson)
    throw new Error('Nhà cung cấp không tồn tại hoặc đã ngừng sử dụng.')

  const voucherNo = requireText(body.voucherNo, 'Số chứng từ')
  const voucherDate = parseOptionalDate(body.voucherDate, 'Ngày chứng từ', true)
  const exchangeRate = parseNumber(body.exchangeRate, 'Tỷ giá', 1)
  if (exchangeRate <= 0) throw new Error('Tỷ giá phải lớn hơn 0.')

  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new Error('Phiếu nhập cần có ít nhất một dòng hàng.')
  }

  const items = body.items.map((item, index) => {
    const quantity = parseNumber(item.quantity, `Số lượng dòng ${index + 1}`)
    const unitPrice = parseNumber(item.unitPrice, `Đơn giá dòng ${index + 1}`)
    if (quantity < 0 || unitPrice < 0)
      throw new Error(`Số lượng và đơn giá dòng ${index + 1} không được âm.`)
    return {
      itemCode: requireText(item.itemCode, `Mã hàng dòng ${index + 1}`),
      itemName: cleanText(item.itemName) || null,
      ecusItemCode: cleanText(item.ecusItemCode) || null,
      warehouseCode:
        cleanText(item.warehouseCode) || cleanText(body.warehouseCode) || null,
      debitAccount: cleanText(item.debitAccount) || null,
      creditAccount: cleanText(item.creditAccount) || null,
      unit: cleanText(item.unit) || null,
      quantity,
      unitPrice,
      amount: quantity * unitPrice,
    }
  })

  const totalQuantity = items.reduce((total, item) => total + item.quantity, 0)
  const totalAmount = items.reduce((total, item) => total + item.amount, 0)
  const existing = db.prepare('SELECT id FROM inventory_receipts WHERE voucher_no = ? COLLATE NOCASE').get(voucherNo)
  const values = [
    deliveryPerson?.id || null,
    deliveryPerson?.name || cleanText(body.supplierName) || null,
    deliveryPerson?.address || cleanText(body.supplierAddress) || null,
    cleanText(body.transporterName) || null,
    cleanText(body.description) || null,
    cleanText(body.warehouseCode) || null,
    cleanText(body.productCode) || null,
    cleanText(body.customsDeclarationNo) || null,
    parseOptionalDate(body.customsDeclarationDate, 'Ngày tờ khai'),
    cleanText(body.contractNo) || null,
    parseOptionalDate(body.contractDate, 'Ngày hợp đồng'),
    cleanText(body.invoiceNo) || null,
    parseOptionalDate(body.invoiceDate, 'Ngày hóa đơn'),
    voucherDate,
    cleanText(body.originalVoucherNo) || null,
    parseOptionalDate(body.originalVoucherDate, 'Ngày chứng từ gốc'),
    exchangeRate,
    cleanText(body.currency) || 'VND',
    cleanText(body.receiptType) || null,
    cleanText(body.itemType) || null,
    body.isSelfSupplied ? 1 : 0,
    totalQuantity,
    totalAmount,
  ]
  let receiptId
  if (existing) {
    updateReceipt.run(...values, voucherNo)
    receiptId = existing.id
    deleteReceiptDetails.run(receiptId)
  } else {
    const receipt = insertReceipt.run(
      ...values.slice(0, 13), voucherNo, ...values.slice(13), 'New'
    )
    receiptId = Number(receipt.lastInsertRowid)
  }
  items.forEach((item, index) => {
    insertReceiptDetail.run(
      receiptId,
      index + 1,
      item.itemCode,
      item.itemName,
      item.ecusItemCode,
      item.warehouseCode,
      item.debitAccount,
      item.creditAccount,
      item.unit,
      item.quantity,
      item.unitPrice,
      item.amount
    )
  })

  return {
    id: receiptId,
    voucherNo,
    deliveryPerson: {
      id: deliveryPerson?.id || null,
      name: deliveryPerson?.name || cleanText(body.supplierName) || null,
      address: deliveryPerson?.address || cleanText(body.supplierAddress) || null,
    },
    totalQuantity,
    totalAmount,
  }
})

app.post('/api/inventory-receipts', (req, res) => {
  try {
    const receipt = createReceipt(req.body || {})
    res.json({ success: true, message: 'Đã lưu phiếu nhập kho.', data: receipt })
  } catch (error) {
    res.status(422).json({ success: false, error: error.message })
  }
})

app.get('/api/inventory-receipts', (req, res) => {
  const query = String(req.query.q || '').trim()
  const escaped = query.replace(/[\\%_]/g, value => `\\${value}`)
  const rows = db.prepare(`
    SELECT r.id, r.voucher_no AS voucherNo, r.voucher_date AS voucherDate,
      r.deliverer_name AS delivererName, r.address, r.transporter_name AS transporterName,
      r.description, r.warehouse_code AS warehouseCode, r.product_code AS productCode,
      r.customs_declaration_no AS customsDeclarationNo,
      r.customs_declaration_date AS customsDeclarationDate,
      r.contract_no AS contractNo, r.contract_date AS contractDate,
      r.invoice_no AS invoiceNo, r.invoice_date AS invoiceDate,
      r.original_voucher_no AS originalVoucherNo,
      r.original_voucher_date AS originalVoucherDate,
      r.exchange_rate AS exchangeRate, r.currency, r.receipt_type AS receiptType,
      r.item_type AS itemType, r.is_self_supplied AS isSelfSupplied, r.status,
      d.item_code AS itemCode, d.item_name AS itemName,
      d.ecus_item_code AS ecusItemCode, d.warehouse_code AS detailWarehouseCode,
      d.debit_account AS debitAccount, d.credit_account AS creditAccount,
      d.unit, d.quantity, d.unit_price AS unitPrice
    FROM inventory_receipts r
    LEFT JOIN inventory_receipt_details d ON d.receipt_id = r.id
    WHERE r.voucher_no LIKE ? ESCAPE '\\' COLLATE NOCASE
    ORDER BY r.voucher_no, d.line_number
  `).all(`%${escaped}%`)
  const receipts = [...new Map(rows.map(row => [row.id, row])).values()].map(row => ({
    ...row,
    items: rows.filter(detail => detail.id === row.id && detail.itemCode).map(detail => ({
      itemCode: detail.itemCode, itemName: detail.itemName,
      ecusItemCode: detail.ecusItemCode, warehouseCode: detail.detailWarehouseCode,
      debitAccount: detail.debitAccount, creditAccount: detail.creditAccount,
      unit: detail.unit, quantity: detail.quantity, unitPrice: detail.unitPrice,
    })),
  }))
  for (const receipt of receipts) {
    delete receipt.detailWarehouseCode
    delete receipt.itemCode
    delete receipt.itemName
    delete receipt.ecusItemCode
    delete receipt.debitAccount
    delete receipt.creditAccount
    delete receipt.unit
    delete receipt.quantity
    delete receipt.unitPrice
  }
  res.json({ success: true, data: receipts })
})

if (require.main === module) {
  app.listen(3000, () => {
    console.log(
      `Server SQLite đang chạy tại http://localhost:3000 (database: ${databaseFile})`
    )
  })
}

module.exports = { app, db }
