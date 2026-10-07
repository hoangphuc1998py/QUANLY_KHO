const express = require('express')
const Database = require('better-sqlite3')
const path = require('path')
const crypto = require('crypto')

const app = express()
app.use(express.json())
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin) {
    try {
      const { hostname } = new URL(origin)
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Access-Control-Allow-Credentials', 'true')
        res.setHeader('Vary', 'Origin')
      }
    } catch {}
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

const databaseFile =
  process.env.DATABASE_FILE || path.join(__dirname, 'database.sqlite')
const db = new Database(databaseFile)
db.pragma('journal_mode = WAL')
db.pragma('busy_timeout = 10000')
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

  CREATE TABLE IF NOT EXISTS warehouse_sites (
    site_code TEXT PRIMARY KEY COLLATE NOCASE,
    linked_stores TEXT NOT NULL DEFAULT '[]'
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
    color TEXT,
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
    color TEXT,
    quantity REAL DEFAULT 0,
    unit_price REAL DEFAULT 0,
    amount REAL DEFAULT 0,
    FOREIGN KEY (issue_id) REFERENCES inventory_issues(id) ON DELETE CASCADE
  );
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'warehouse')),
    warehouse_code TEXT,
    warehouse_codes TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`)

const WAREHOUSE_SITE_DATA = [
  ['KHO TONG CONG TY', ['KHO TONG CONG TY']],
  ['KHO AN HUNG', ['KHO AN HUNG NPL', 'KHO AN HUNG BTP CAT', 'KHO AN HUNG BTP MAY', 'KHO AN HUNG TP']],
  ['KHO AN THINH', ['KHO AN THINH NPL', 'KHO AN THINH BTP CAT', 'KHO AN THINH BTP MAY', 'KHO AN THINH TP']],
  ['KHO AN PHAT', ['KHO AN PHAT NPL', 'KHO AN PHAT BTP CAT', 'KHO AN PHAT BTP MAY', 'KHO AN PHAT TP']],
  ['KHO AN PHU', ['KHO AN PHU NPL', 'KHO AN PHU BTP CAT', 'KHO AN PHU BTP MAY', 'KHO AN PHU TP']],
  ['KHO VESTON', ['KHO VESTON NPL', 'KHO VESTON BTP CAT', 'KHO VESTON BTP MAY', 'KHO VESTON TP']],
]
const upsertWarehouseSite = db.prepare(`
  INSERT INTO warehouse_sites (site_code, linked_stores) VALUES (?, ?)
  ON CONFLICT(site_code) DO UPDATE SET linked_stores = excluded.linked_stores
`)
const seedWarehouseSites = db.transaction(() => {
  for (const [siteCode, linkedStores] of WAREHOUSE_SITE_DATA)
    upsertWarehouseSite.run(siteCode, JSON.stringify(linkedStores))
})
const missingWarehouseSite = WAREHOUSE_SITE_DATA.some(([siteCode]) =>
  !db.prepare('SELECT 1 FROM warehouse_sites WHERE site_code = ? COLLATE NOCASE').get(siteCode)
)
if (missingWarehouseSite) seedWarehouseSites()

function availableLinkedStores() {
  return [...new Set(db.prepare('SELECT linked_stores AS linkedStores FROM warehouse_sites').all()
    .flatMap(site => {
      try { return JSON.parse(site.linkedStores || '[]') } catch { return [] }
    })
    .map(cleanText)
    .filter(Boolean))]
}

function normalizeWarehouseCodes(values) {
  if (!Array.isArray(values)) return []
  const available = new Map(availableLinkedStores().map(code => [code.toLocaleUpperCase('vi'), code]))
  const normalized = []
  for (const rawValue of values) {
    const code = cleanText(rawValue)
    if (!code) continue
    const exactStore = available.get(code.toLocaleUpperCase('vi'))
    if (exactStore) {
      normalized.push(exactStore)
      continue
    }

    // Older forms stored the company warehouse with the abbreviation "CTY",
    // while linked_stores uses "TY". Accept both parent-site spellings.
    const siteCode = code.toLocaleUpperCase('vi') === 'KHO TONG CONG CTY'
      ? 'KHO TONG CONG TY'
      : code
    const site = db.prepare('SELECT site_code AS siteCode, linked_stores AS linkedStores FROM warehouse_sites WHERE site_code = ? COLLATE NOCASE').get(siteCode)
    if (site) {
      try { normalized.push(...JSON.parse(site.linkedStores || '[]').map(cleanText).filter(Boolean)) } catch {}
    }
  }
  return [...new Set(normalized)]
}

function isValidWarehouseSelection(value) {
  const code = cleanText(value)
  if (!code) return false
  const normalizedCode = code.toLocaleUpperCase('vi') === 'KHO TONG CONG CTY'
    ? 'KHO TONG CONG TY'
    : code
  const available = new Set(availableLinkedStores().map(store => store.toLocaleUpperCase('vi')))
  if (available.has(normalizedCode.toLocaleUpperCase('vi'))) return true
  return Boolean(db.prepare('SELECT 1 FROM warehouse_sites WHERE site_code = ? COLLATE NOCASE').get(normalizedCode))
}

function expandWarehouseSite(siteCode) {
  const selectedCode = cleanText(siteCode)
  if (!selectedCode) return []
  const site = db.prepare('SELECT linked_stores AS linkedStores FROM warehouse_sites WHERE site_code = ? COLLATE NOCASE').get(selectedCode)
  let linkedStores = []
  try { linkedStores = site ? JSON.parse(site.linkedStores || '[]') : [] } catch {}
  return [...new Set([selectedCode, ...linkedStores.map(cleanText).filter(Boolean)])]
}

function assignedWarehouseCodes(user) {
  try {
    const codes = Array.isArray(user?.warehouseCodes)
      ? user.warehouseCodes
      : JSON.parse(user?.warehouseCodes || '[]')
    if (Array.isArray(codes) && codes.length) return normalizeWarehouseCodes(codes)
  } catch {}
  if (user?.warehouseCode) {
    const legacyCodes = String(user.warehouseCode).split(/[\r\n,;]+/).map(cleanText).filter(Boolean)
    return normalizeWarehouseCodes(legacyCodes.flatMap(expandWarehouseSite))
  }
  return []
}

function permittedHeaderSites(warehouseCodes) {
  const allowed = new Set(warehouseCodes.map(code => code.toLocaleUpperCase('vi')))
  return db.prepare('SELECT site_code AS siteCode, linked_stores AS linkedStores FROM warehouse_sites').all()
    .filter(site => {
      let linked = []
      try { linked = JSON.parse(site.linkedStores || '[]') } catch {}
      return allowed.has(site.siteCode.toLocaleUpperCase('vi')) || linked.some(code => allowed.has(code.toLocaleUpperCase('vi')))
    })
    .map(site => site.siteCode)
}

function documentWarehouseViolation(body, session) {
  const allowedCodes = assignedWarehouseCodes(session)
  const allowed = new Set(allowedCodes.map(code => code.toLocaleUpperCase('vi')))
  const permittedSites = new Set(permittedHeaderSites(allowedCodes).map(code => code.toLocaleUpperCase('vi')))
  const headerCode = cleanText(body.warehouseCode)
  if (!allowedCodes.length) return 'Tài khoản chưa được gán kho thao tác.'
  if (headerCode && !allowed.has(headerCode.toLocaleUpperCase('vi')) && !permittedSites.has(headerCode.toLocaleUpperCase('vi'))) {
    return 'Kho trên chứng từ không nằm trong phạm vi tài khoản.'
  }
  const items = Array.isArray(body.items) ? body.items : []
  if (!items.length) return 'Phiếu cần có ít nhất một dòng hàng thuộc kho được phân quyền.'
  if (items.some(item => {
    const code = cleanText(item.warehouseCode) || headerCode
    return !code || !allowed.has(code.toLocaleUpperCase('vi'))
  })) return 'Có dòng hàng thuộc kho chưa được phân quyền cho tài khoản.'
  return ''
}

const adminSessions = new Map()
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000
const SESSION_COOKIE = 'quanlykho_admin_session'

function getAdminSession(req) {
  const cookie = req.headers.cookie || ''
  const token = cookie
    .split(';')
    .map(value => value.trim())
    .find(value => value.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1)
  if (!token) return null
  const session = adminSessions.get(token)
  if (!session || session.expiresAt <= Date.now()) {
    adminSessions.delete(token)
    return null
  }
  return session
}

function setAdminSession(res, req, user) {
  const token = crypto.randomBytes(32).toString('hex')
  adminSessions.set(token, {
    ...user,
    expiresAt: Date.now() + SESSION_DURATION_MS,
  })
  const secure = req.secure ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DURATION_MS / 1000}${secure}`
  )
}

function clearAdminSession(req, res) {
  const cookie = req.headers.cookie || ''
  const token = cookie
    .split(';')
    .map(value => value.trim())
    .find(value => value.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1)
  if (token) adminSessions.delete(token)
  const secure = req.secure ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`
  )
}

app.get('/api/auth/status', (_req, res) => {
  const adminExists = Boolean(db.prepare('SELECT 1 FROM admin_users LIMIT 1').get())
  res.json({ success: true, setupRequired: !adminExists })
})

app.post('/api/auth/setup', (req, res) => {
  const username = cleanText(req.body?.username)
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (db.prepare('SELECT 1 FROM admin_users LIMIT 1').get()) {
    res.status(409).json({ success: false, error: 'Tài khoản quản trị đã được tạo.' })
    return
  }
  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) {
    res.status(400).json({ success: false, error: 'Tên đăng nhập cần từ 3 đến 40 ký tự, chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.' })
    return
  }
  if (password.length < 12) {
    res.status(400).json({ success: false, error: 'Mật khẩu quản trị cần có ít nhất 12 ký tự.' })
    return
  }
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  db.prepare('INSERT INTO admin_users (username, password_salt, password_hash) VALUES (?, ?, ?)').run(username, salt, hash)
  setAdminSession(res, req, { username, role: 'admin', warehouseCode: null, warehouseCodes: [] })
  res.status(201).json({ success: true, data: { username } })
})

app.post('/api/auth/login', (req, res) => {
  const username = cleanText(req.body?.username)
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const admin = db.prepare('SELECT username, password_salt, password_hash, role, warehouse_code AS warehouseCode, warehouse_codes AS warehouseCodes FROM admin_users WHERE username = ?').get(username)
  const suppliedHash = admin
    ? crypto.scryptSync(password, admin.password_salt, 64)
    : crypto.scryptSync(password, 'invalid-admin-login-salt', 64)
  const expectedHash = admin ? Buffer.from(admin.password_hash, 'hex') : Buffer.alloc(64)
  const valid = suppliedHash.length === expectedHash.length && crypto.timingSafeEqual(suppliedHash, expectedHash)
  if (!admin || !valid) {
    res.status(401).json({ success: false, error: 'Tên đăng nhập hoặc mật khẩu không đúng.' })
    return
  }
  setAdminSession(res, req, {
    username: admin.username,
    role: admin.role || 'admin',
    warehouseCode: admin.warehouseCode || null,
    warehouseCodes: assignedWarehouseCodes(admin),
  })
  res.json({ success: true, data: { username: admin.username, role: admin.role || 'admin' } })
})

app.post('/api/auth/logout', (req, res) => {
  clearAdminSession(req, res)
  res.json({ success: true })
})

app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'admin.html')))
app.get('/admin.css', (_req, res) => res.sendFile(path.join(__dirname, 'admin.css')))
app.get('/admin.js', (_req, res) => res.sendFile(path.join(__dirname, 'admin.js')))

function requireAdmin(req, res, next) {
  const session = getAdminSession(req)
  if (session) {
    req.adminSession = session
    next()
    return
  }
  if (req.originalUrl.startsWith('/api/')) {
    res.status(401).json({ success: false, error: 'Vui lòng đăng nhập với tài khoản quản trị.' })
    return
  }
  res.redirect('/admin')
}

app.get(['/', '/index.html'], requireAdmin, (_req, res) =>
  res.sendFile(path.join(__dirname, 'index.html'))
)
app.use('/api', requireAdmin)
ensureColumn('admin_users', 'role', "TEXT NOT NULL DEFAULT 'admin'")
ensureColumn('admin_users', 'warehouse_code', 'TEXT')
ensureColumn('admin_users', 'warehouse_codes', "TEXT NOT NULL DEFAULT '[]'")
app.get('/api/auth/me', (req, res) => {
  res.json({ success: true, data: req.adminSession })
})
function requireAdminRole(req, res, next) {
  if (req.adminSession?.role === 'admin') {
    next()
    return
  }
  res.status(403).json({ success: false, error: 'Tài khoản này không có quyền thực hiện thao tác.' })
}

app.get('/api/admin/users', requireAdminRole, (_req, res) => {
  const users = db.prepare("SELECT id, username, warehouse_code AS warehouseCode, warehouse_codes AS warehouseCodes, created_at AS createdAt FROM admin_users WHERE role = 'warehouse' ORDER BY username COLLATE NOCASE").all()
    .map(user => ({ ...user, warehouseCodes: assignedWarehouseCodes(user) }))
  res.json({ success: true, data: users })
})

app.post('/api/admin/users', requireAdminRole, (req, res) => {
  const username = cleanText(req.body?.username)
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const requestedCodes = Array.isArray(req.body?.warehouseCodes)
    ? req.body.warehouseCodes
    : req.body?.warehouseCode
      ? expandWarehouseSite(req.body.warehouseCode)
      : []
  const warehouseCodes = normalizeWarehouseCodes(requestedCodes)
  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) {
    res.status(400).json({ success: false, error: 'Tên đăng nhập cần từ 3 đến 40 ký tự gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.' })
    return
  }
  if (password.length < 8) {
    res.status(400).json({ success: false, error: 'Mật khẩu cần có ít nhất 8 ký tự.' })
    return
  }
  if (!warehouseCodes.length || requestedCodes.some(code => !isValidWarehouseSelection(code))) {
    res.status(400).json({ success: false, error: 'Vui lòng chọn ít nhất một kho hợp lệ trong danh sách kho liên kết.' })
    return
  }
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  try {
    const headerSite = permittedHeaderSites(warehouseCodes)[0] || warehouseCodes[0]
    const result = db.prepare("INSERT INTO admin_users (username, password_salt, password_hash, role, warehouse_code, warehouse_codes) VALUES (?, ?, ?, 'warehouse', ?, ?)").run(username, salt, hash, headerSite, JSON.stringify(warehouseCodes))
    res.status(201).json({ success: true, data: { id: Number(result.lastInsertRowid), username, warehouseCode: headerSite, warehouseCodes } })
  } catch (error) {
    console.error('Không thể tạo tài khoản kho:', error)
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ success: false, error: 'Tên đăng nhập đã tồn tại.' })
      return
    }
    if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED') {
      res.status(503).json({ success: false, error: 'Database đang bị khóa bởi một tiến trình khác. Đóng cửa sổ/chương trình đang mở database.sqlite rồi thử lại.' })
      return
    }
    res.status(500).json({ success: false, error: 'Không thể tạo tài khoản.' })
  }
})

app.post('/api/auth/change-password', (req, res) => {
  const session = getAdminSession(req)
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : ''
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : ''
  if (newPassword.length < 8) {
    res.status(400).json({ success: false, error: 'Mật khẩu mới cần có ít nhất 8 ký tự.' })
    return
  }
  const admin = db.prepare('SELECT id, password_salt, password_hash FROM admin_users WHERE username = ?').get(session.username)
  if (!admin) {
    clearAdminSession(req, res)
    res.status(401).json({ success: false, error: 'Phiên đăng nhập không còn hợp lệ.' })
    return
  }
  const currentHash = crypto.scryptSync(currentPassword, admin.password_salt, 64)
  const expectedHash = Buffer.from(admin.password_hash, 'hex')
  if (!crypto.timingSafeEqual(currentHash, expectedHash)) {
    res.status(401).json({ success: false, error: 'Mật khẩu hiện tại không đúng.' })
    return
  }
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(newPassword, salt, 64).toString('hex')
  db.prepare('UPDATE admin_users SET password_salt = ?, password_hash = ? WHERE id = ?').run(salt, hash, admin.id)
  for (const [token, activeSession] of adminSessions) {
    if (activeSession.username === session.username) adminSessions.delete(token)
  }
  setAdminSession(res, req, {
    username: session.username,
    role: session.role,
    warehouseCode: session.warehouseCode,
    warehouseCodes: assignedWarehouseCodes(session),
  })
  res.json({ success: true })
})
app.get('/index.css', requireAdmin, (_req, res) => res.sendFile(path.join(__dirname, 'index.css')))
app.get('/index.js', requireAdmin, (_req, res) => res.sendFile(path.join(__dirname, 'index.js')))
app.get('/node_modules/xlsx/dist/xlsx.full.min.js', requireAdmin, (_req, res) =>
  res.sendFile(path.join(__dirname, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js'))
)

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
ensureColumn('inventory_receipt_details', 'color', 'TEXT')
ensureColumn('inventory_issue_details', 'color', 'TEXT')

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

app.get('/api/warehouse-sites', (_req, res) => {
  const sites = db.prepare('SELECT site_code AS siteCode, linked_stores AS linkedStores FROM warehouse_sites ORDER BY rowid').all()
    .map(site => ({ ...site, linkedStores: JSON.parse(site.linkedStores) }))
  res.json({ success: true, data: sites })
})

app.post('/api/delivery-people', requireAdminRole, (req, res) => {
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
    debit_account, credit_account, unit, color, quantity, unit_price, amount
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      color: cleanText(item.color) || null,
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
      item.color,
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
    const body = req.body || {}
    if (req.adminSession.role !== 'admin') {
      const violation = documentWarehouseViolation(body, req.adminSession)
      if (violation) {
        res.status(403).json({ success: false, error: violation })
        return
      }
      if (db.prepare('SELECT 1 FROM inventory_receipts WHERE voucher_no = ? COLLATE NOCASE').get(cleanText(body.voucherNo))) {
        res.status(403).json({ success: false, error: 'Tài khoản kho chỉ được tạo phiếu mới, không được sửa phiếu đã lưu.' })
        return
      }
    }
    const receipt = createReceipt(body)
    res.json({ success: true, message: 'Đã lưu phiếu nhập kho.', data: receipt })
  } catch (error) {
    res.status(422).json({ success: false, error: error.message })
  }
})

app.get('/api/inventory-receipts', (req, res) => {
  const query = String(req.query.q || '').trim()
  const escaped = query.replace(/[\\%_]/g, value => `\\${value}`)
  const isAdmin = req.adminSession.role === 'admin'
  const warehouseCodes = isAdmin ? [] : assignedWarehouseCodes(req.adminSession)
  const warehouseMatch = warehouseCodes.length
    ? `COALESCE(NULLIF(d.warehouse_code, ''), NULLIF(r.warehouse_code, '')) COLLATE NOCASE IN (${warehouseCodes.map(() => '?').join(',')})`
    : '0 = 1'
  const warehouseJoin = isAdmin
    ? ''
    : `AND ${warehouseMatch}`
  const warehouseVisibility = isAdmin ? '' : 'AND d.receipt_id IS NOT NULL'
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
      d.unit, d.color, d.quantity, d.unit_price AS unitPrice
    FROM inventory_receipts r
    LEFT JOIN inventory_receipt_details d ON d.receipt_id = r.id ${warehouseJoin}
    WHERE r.voucher_no LIKE ? ESCAPE '\\' COLLATE NOCASE ${warehouseVisibility}
    ORDER BY r.voucher_no, d.line_number
  `).all(...warehouseCodes, `%${escaped}%`)
  const receipts = [...new Map(rows.map(row => [row.id, row])).values()].map(row => ({
    ...row,
    items: rows.filter(detail => detail.id === row.id && detail.itemCode).map(detail => ({
      itemCode: detail.itemCode, itemName: detail.itemName,
      ecusItemCode: detail.ecusItemCode, warehouseCode: detail.detailWarehouseCode,
      debitAccount: detail.debitAccount, creditAccount: detail.creditAccount,
      unit: detail.unit, color: detail.color, quantity: detail.quantity, unitPrice: detail.unitPrice,
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
    delete receipt.color
    delete receipt.quantity
    delete receipt.unitPrice
  }
  res.json({ success: true, data: receipts })
})

const saveIssue = db.transaction(body => {
  const voucherNo = requireText(body.voucherNo, 'Số chứng từ')
  const voucherDate = parseOptionalDate(body.voucherDate, 'Ngày chứng từ', true)
  const exchangeRate = parseNumber(body.exchangeRate, 'Tỷ giá', 1)
  if (exchangeRate <= 0) throw new Error('Tỷ giá phải lớn hơn 0.')
  if (!Array.isArray(body.items) || !body.items.length)
    throw new Error('Phiếu xuất cần có ít nhất một dòng hàng.')

  const items = body.items.map((item, index) => {
    const quantity = parseNumber(item.quantity, `Số lượng dòng ${index + 1}`)
    const unitPrice = parseNumber(item.unitPrice, `Đơn giá dòng ${index + 1}`)
    if (quantity < 0 || unitPrice < 0)
      throw new Error(`Số lượng và đơn giá dòng ${index + 1} không được âm.`)
    return {
      itemCode: requireText(item.itemCode, `Mã hàng dòng ${index + 1}`),
      itemName: cleanText(item.itemName) || null,
      ecusItemCode: cleanText(item.ecusItemCode) || null,
      warehouseCode: cleanText(item.warehouseCode) || cleanText(body.warehouseCode) || null,
      debitAccount: cleanText(item.debitAccount) || null,
      creditAccount: cleanText(item.creditAccount) || null,
      unit: cleanText(item.unit) || null,
      color: cleanText(item.color) || null,
      quantity,
      unitPrice,
      amount: quantity * unitPrice,
    }
  })
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0)
  const fields = [
    cleanText(body.receiverName) || cleanText(body.supplierName) || null,
    cleanText(body.supplierAddress) || null,
    cleanText(body.transporterName) || null,
    cleanText(body.description) || null,
    cleanText(body.warehouseCode) || null,
    parseOptionalDate(body.customsDeclarationDate, 'Ngày tờ khai') && cleanText(body.customsDeclarationNo) || null,
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
  const existing = db.prepare('SELECT id FROM inventory_issues WHERE voucher_no = ? COLLATE NOCASE').get(voucherNo)
  let issueId
  if (existing) {
    db.prepare(`UPDATE inventory_issues SET receiver_name=?, address=?, transporter_name=?, description=?, warehouse_code=?, customs_declaration_no=?, customs_declaration_date=?, contract_no=?, contract_date=?, invoice_no=?, invoice_date=?, voucher_date=?, original_voucher_no=?, original_voucher_date=?, exchange_rate=?, currency=?, issue_type=?, item_type=?, is_self_supplied=?, total_quantity=?, total_amount=? WHERE voucher_no=?`).run(...fields, voucherNo)
    issueId = existing.id
    db.prepare('DELETE FROM inventory_issue_details WHERE issue_id=?').run(issueId)
  } else {
    const result = db.prepare(`INSERT INTO inventory_issues(receiver_name,address,transporter_name,description,warehouse_code,customs_declaration_no,customs_declaration_date,contract_no,contract_date,invoice_no,invoice_date,voucher_no,voucher_date,original_voucher_no,original_voucher_date,exchange_rate,currency,issue_type,item_type,is_self_supplied,total_quantity,total_amount,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...fields.slice(0, 11), voucherNo, ...fields.slice(11), 'New')
    issueId = Number(result.lastInsertRowid)
  }
  const insert = db.prepare('INSERT INTO inventory_issue_details(issue_id,line_number,item_code,item_name,ecus_item_code,warehouse_code,debit_account,credit_account,unit,color,quantity,unit_price,amount) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
  items.forEach((item, index) => insert.run(issueId,index+1,item.itemCode,item.itemName,item.ecusItemCode,item.warehouseCode,item.debitAccount,item.creditAccount,item.unit,item.color,item.quantity,item.unitPrice,item.amount))
  return { id: issueId, voucherNo, totalQuantity, totalAmount }
})

app.post('/api/inventory-issues', (req, res) => {
  try {
    const body = req.body || {}
    if (req.adminSession.role !== 'admin') {
      const violation = documentWarehouseViolation(body, req.adminSession)
      if (violation) {
        res.status(403).json({ success: false, error: violation })
        return
      }
      if (db.prepare('SELECT 1 FROM inventory_issues WHERE voucher_no = ? COLLATE NOCASE').get(cleanText(body.voucherNo))) {
        res.status(403).json({ success: false, error: 'Tài khoản kho chỉ được tạo phiếu mới, không được sửa phiếu đã lưu.' })
        return
      }
    }
    res.json({ success: true, data: saveIssue(body) })
  } catch (error) {
    res.status(422).json({ success: false, error: error.message })
  }
})

app.get('/api/inventory-issues', (req, res) => {
  const query = String(req.query.q || '').trim().replace(/[\\%_]/g, value => `\\${value}`)
  const isAdmin = req.adminSession.role === 'admin'
  const warehouseCodes = isAdmin ? [] : assignedWarehouseCodes(req.adminSession)
  const warehouseMatch = warehouseCodes.length
    ? `COALESCE(NULLIF(d.warehouse_code, ''), NULLIF(i.warehouse_code, '')) COLLATE NOCASE IN (${warehouseCodes.map(() => '?').join(',')})`
    : '0 = 1'
  const warehouseJoin = isAdmin
    ? ''
    : `AND ${warehouseMatch}`
  const warehouseVisibility = isAdmin ? '' : 'AND d.issue_id IS NOT NULL'
  const rows = db.prepare(`SELECT i.id,i.voucher_no AS voucherNo,i.voucher_date AS voucherDate,i.receiver_name AS receiverName,i.address,i.transporter_name AS transporterName,i.description,i.warehouse_code AS warehouseCode,i.customs_declaration_no AS customsDeclarationNo,i.customs_declaration_date AS customsDeclarationDate,i.contract_no AS contractNo,i.contract_date AS contractDate,i.invoice_no AS invoiceNo,i.invoice_date AS invoiceDate,i.original_voucher_no AS originalVoucherNo,i.original_voucher_date AS originalVoucherDate,i.exchange_rate AS exchangeRate,i.currency,i.issue_type AS receiptType,i.item_type AS itemType,i.is_self_supplied AS isSelfSupplied,i.status,d.item_code AS itemCode,d.item_name AS itemName,d.ecus_item_code AS ecusItemCode,d.warehouse_code AS detailWarehouseCode,d.debit_account AS debitAccount,d.credit_account AS creditAccount,d.unit,d.color,d.quantity,d.unit_price AS unitPrice FROM inventory_issues i LEFT JOIN inventory_issue_details d ON d.issue_id=i.id ${warehouseJoin} WHERE i.voucher_no LIKE ? ESCAPE '\\' COLLATE NOCASE ${warehouseVisibility} ORDER BY i.voucher_no,d.line_number`).all(...warehouseCodes, `%${query}%`)
  const records = [...new Map(rows.map(row => [row.id,row])).values()].map(row => ({
    ...row,
    items: rows.filter(detail => detail.id === row.id && detail.itemCode).map(detail => ({ itemCode:detail.itemCode,itemName:detail.itemName,ecusItemCode:detail.ecusItemCode,warehouseCode:detail.detailWarehouseCode,debitAccount:detail.debitAccount,creditAccount:detail.creditAccount,unit:detail.unit,color:detail.color,quantity:detail.quantity,unitPrice:detail.unitPrice })),
  }))
  for (const record of records) ['detailWarehouseCode','itemCode','itemName','ecusItemCode','debitAccount','creditAccount','unit','color','quantity','unitPrice'].forEach(key => delete record[key])
  res.json({ success:true,data:records })
})

app.get('/api/inventory-report', (req, res) => {
  try {
    const filters = req.query || {}
    const fromDate = filters.fromDate
      ? parseOptionalDate(filters.fromDate, 'Từ ngày', true)
      : ''
    const clauses = []
    const params = []
    const isAdmin = req.adminSession.role === 'admin'
    const selectedCode = cleanText(filters.warehouse)
    const assignedCodes = isAdmin ? [] : assignedWarehouseCodes(req.adminSession)
    let warehouseCodes = []
    if (isAdmin) {
      warehouseCodes = selectedCode ? expandWarehouseSite(selectedCode) : []
    } else {
      const allowed = new Set(assignedCodes.map(code => code.toLocaleUpperCase('vi')))
      const requested = selectedCode ? expandWarehouseSite(selectedCode) : assignedCodes
      warehouseCodes = requested.filter(code => allowed.has(code.toLocaleUpperCase('vi')))
      if (!warehouseCodes.length) clauses.push('0 = 1')
    }
    if (filters.toDate) {
      clauses.push('movementDate <= ?')
      params.push(parseOptionalDate(filters.toDate, 'Đến ngày', true))
    }
    if (warehouseCodes.length) {
      clauses.push(`warehouseCode COLLATE NOCASE IN (${warehouseCodes.map(() => '?').join(',')})`)
      params.push(...warehouseCodes)
    }
    if (filters.productCode) {
      clauses.push("itemCode LIKE ? ESCAPE '\\' COLLATE NOCASE")
      params.push(`%${String(filters.productCode).trim().replace(/[\\%_]/g, value => `\\${value}`)}%`)
    }
    if (filters.contract) {
      clauses.push("contractNo LIKE ? ESCAPE '\\' COLLATE NOCASE")
      params.push(`%${String(filters.contract).trim().replace(/[\\%_]/g, value => `\\${value}`)}%`)
    }
    if (filters.item) {
      clauses.push("itemName LIKE ? ESCAPE '\\' COLLATE NOCASE")
      params.push(`%${String(filters.item).trim().replace(/[\\%_]/g, value => `\\${value}`)}%`)
    }
    if (filters.customer) {
      clauses.push("customerName LIKE ? ESCAPE '\\' COLLATE NOCASE")
      params.push(`%${String(filters.customer).trim().replace(/[\\%_]/g, value => `\\${value}`)}%`)
    }
    if (filters.color) {
      clauses.push("color LIKE ? ESCAPE '\\' COLLATE NOCASE")
      params.push(`%${String(filters.color).trim().replace(/[\\%_]/g, value => `\\${value}`)}%`)
    }

    const reportCategoryTypes = {
      'Nguyên liệu': ['Nguyên liệu'],
      'Phụ liệu': ['Phụ liệu'],
      'Sản phẩm': ['Sản phẩm', 'Thành phẩm'],
      'Thiết bị': ['Thiết bị', 'Công cụ dụng cụ'],
      'Hàng mẫu': ['Hàng mẫu'],
    }
    const allowedTypes = reportCategoryTypes[filters.category]
    if (allowedTypes) {
      clauses.push(`LOWER(itemType) IN (${allowedTypes.map(() => '?').join(',')})`)
      params.push(...allowedTypes.map(value => value.toLocaleLowerCase('vi')))
    }

    const rows = db.prepare(`
      WITH movements AS (
        SELECT 'in' AS movementType, r.voucher_no AS voucherNo,
          r.voucher_date AS movementDate, r.contract_no AS contractNo,
          r.contract_date AS contractDate, r.description AS description,
          COALESCE(NULLIF(r.warehouse_code, ''), '') AS headerWarehouseCode,
          COALESCE(NULLIF(d.warehouse_code, ''), NULLIF(r.warehouse_code, ''), '') AS warehouseCode,
          d.item_code AS itemCode, COALESCE(d.item_name, '') AS itemName,
          COALESCE(d.color, '') AS color,
          COALESCE(NULLIF(dp.name, ''), NULLIF(r.deliverer_name, ''), '') AS customerName,
          COALESCE(d.unit, '') AS unit, d.quantity AS quantity,
          COALESCE(d.amount, d.quantity * d.unit_price, 0) AS amount,
          COALESCE(r.item_type, '') AS itemType, d.line_number AS lineNumber
        FROM inventory_receipts r
        JOIN inventory_receipt_details d ON d.receipt_id = r.id
        LEFT JOIN delivery_people dp ON dp.id = r.delivery_person_id
        UNION ALL
        SELECT 'out' AS movementType, i.voucher_no AS voucherNo,
          i.voucher_date AS movementDate, i.contract_no AS contractNo,
          i.contract_date AS contractDate, i.description AS description,
          COALESCE(NULLIF(i.warehouse_code, ''), '') AS headerWarehouseCode,
          COALESCE(NULLIF(d.warehouse_code, ''), NULLIF(i.warehouse_code, ''), '') AS warehouseCode,
          d.item_code AS itemCode, COALESCE(d.item_name, '') AS itemName,
          COALESCE(d.color, '') AS color,
          COALESCE(i.receiver_name, '') AS customerName,
          COALESCE(d.unit, '') AS unit, d.quantity AS quantity,
          COALESCE(d.amount, d.quantity * d.unit_price, 0) AS amount,
          COALESCE(i.item_type, '') AS itemType, d.line_number AS lineNumber
        FROM inventory_issues i
        JOIN inventory_issue_details d ON d.issue_id = i.id
      )
      SELECT * FROM movements
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY movementDate, voucherNo, lineNumber
    `).all(...params)

    res.json({ success: true, data: { movements: rows, fromDate } })
  } catch (error) {
    res.status(422).json({ success: false, error: error.message })
  }
})

function nextDatabaseVoucherNumber(type, currentVoucherNo) {
  const prefix = type === 'out' ? 'PX' : 'PN'
  const table = type === 'out' ? 'inventory_issues' : 'inventory_receipts'
  const voucherNumbers = db.prepare(`SELECT voucher_no AS voucherNo FROM ${table}`).all()
  const pattern = new RegExp(`^${prefix}(\\d+)$`, 'i')
  let maximum = 0
  for (const { voucherNo } of voucherNumbers) {
    const match = pattern.exec(String(voucherNo || '').trim())
    if (match) maximum = Math.max(maximum, Number(match[1]) || 0)
  }
  const currentMatch = pattern.exec(String(currentVoucherNo || '').trim())
  if (currentMatch) maximum = Math.max(maximum, Number(currentMatch[1]) || 0)
  return `${prefix}${String(maximum + 1).padStart(5, '0')}`
}

app.get('/api/inventory-vouchers/next-number', (req, res) => {
  const type = req.query.type === 'in' || req.query.type === 'out' ? req.query.type : null
  if (!type) {
    res.status(400).json({ success: false, error: 'Loại phiếu không hợp lệ.' })
    return
  }
  const voucherNo = nextDatabaseVoucherNumber(type, req.query.currentVoucherNo)
  res.json({ success: true, data: { voucherNo } })
})

app.post('/api/inventory-vouchers/split', (req, res) => {
  try {
    const body = req.body || {}
    const type = body.type === 'out' ? 'out' : body.type === 'in' ? 'in' : null
    if (!type) throw new Error('Loại phiếu không hợp lệ.')
    if (!body.voucher || !Array.isArray(body.voucher.items))
      throw new Error('Dữ liệu phiếu không hợp lệ.')
    if (req.adminSession.role !== 'admin') {
      const violation = documentWarehouseViolation(body.voucher, req.adminSession)
      if (violation) {
        res.status(403).json({ success: false, error: violation })
        return
      }
    }

    const groups = new Map()
    for (const item of body.voucher.items) {
      const itemCode = cleanText(item.itemCode)
      if (!itemCode) throw new Error('Mỗi dòng hàng cần có Mã SP.')
      if (!groups.has(itemCode)) groups.set(itemCode, [])
      groups.get(itemCode).push(item)
    }
    if (!groups.size) throw new Error('Phiếu chưa có dòng hàng để tách.')

    const createSplit = db.transaction(() => {
      let nextNumber = nextDatabaseVoucherNumber(type, body.currentVoucherNo)
      const created = []
      for (const [itemCode, items] of groups) {
        const voucherNo = nextNumber
        const suffix = Number(voucherNo.slice(2)) + 1
        nextNumber = `${type === 'out' ? 'PX' : 'PN'}${String(suffix).padStart(5, '0')}`
        const voucher = { ...body.voucher, voucherNo, items }
        const saved = type === 'out' ? saveIssue(voucher) : createReceipt(voucher)
        created.push({ voucherNo: saved.voucherNo, itemCode })
      }
      return created
    })

    res.status(201).json({ success: true, data: createSplit.immediate() })
  } catch (error) {
    res.status(422).json({ success: false, error: error.message })
  }
})

if (require.main === module) {
  app.listen(8888, '0.0.0.0', () => {
    console.log(
      `Server SQLite đang chạy tại http://0.0.0.0:8888 (database: ${databaseFile})`
    )
  })
}
module.exports = { app, db }
