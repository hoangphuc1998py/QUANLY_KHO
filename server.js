const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
app.use(express.json());

// Phục vụ các file tĩnh (HTML, CSS, JS frontend)
app.use(express.static(__dirname));

// 1. Khởi tạo/Mở file database.sqlite (Nếu chưa có, nó sẽ tự tạo file mới)
const db = new Database(path.join(__dirname, 'database.sqlite'));

// (Tùy chọn) Bật chế độ WAL để SQLite xử lý đọc/ghi nhanh và mượt hơn
db.pragma('journal_mode = WAL');

// 2. Tạo bảng tự động nếu chưa tồn tại (Ví dụ bảng users)
db.exec(`
  CREATE TABLE IF NOT EXISTS inventory_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      
      -- Thông tin chung
      deliverer_name TEXT,                  -- Người giao hàng
      address TEXT,                         -- Địa chỉ
      transporter_name TEXT,                -- Người vận chuyển
      description TEXT,                     -- Diễn giải
      warehouse_code TEXT,                  -- Mã kho
      
      -- Thông tin tờ khai / Hợp đồng
      customs_declaration_no TEXT,          -- Số tờ khai
      customs_declaration_date TEXT,        -- Ngày tờ khai
      contract_no TEXT,                     -- Số hợp đồng
      contract_date TEXT,                   -- Ngày hợp đồng
      invoice_no TEXT,                      -- Số hóa đơn
      invoice_date TEXT,                    -- Ngày hóa đơn
      
      -- Thông tin chứng từ
      voucher_no TEXT UNIQUE NOT NULL,      -- Số chứng từ (VD: PN00002)
      voucher_date TEXT NOT NULL,           -- Ngày chứng từ
      original_voucher_no TEXT,             -- Số chứng từ gốc
      original_voucher_date TEXT,           -- Ngày chứng từ gốc
      exchange_rate REAL DEFAULT 1,         -- Tỷ giá
      currency TEXT DEFAULT 'VND',          -- Loại tiền
      receipt_type TEXT,                    -- Loại phiếu (VD: Thành phẩm sản x)
      item_type TEXT,                       -- Loại hàng (VD: Nguyên liệu)
      is_self_supplied INTEGER DEFAULT 0,   -- Phiếu tự cung ứng, không báo cáo HQ (1: Có, 0: Không)
      
      -- Tổng tiền & Trạng thái
      total_quantity REAL DEFAULT 0,        -- Tổng lượng
      total_amount REAL DEFAULT 0,          -- Tổng tiền hàng
      status TEXT DEFAULT 'New',            -- Trạng thái phiếu
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS inventory_receipt_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_id INTEGER NOT NULL,          -- Khóa ngoại nối với bảng inventory_receipts
      line_number INTEGER,                  -- STT dòng
      
      item_code TEXT NOT NULL,              -- Mã hàng
      item_name TEXT,                       -- Tên hàng
      ecus_item_code TEXT,                  -- Mã hàng ECUS
      warehouse_code TEXT,                  -- Kho
      debit_account TEXT,                   -- TK Nợ
      credit_account TEXT,                  -- TK Có
      unit TEXT,                            -- Đơn vị tính
      quantity REAL DEFAULT 0,              -- Số lượng
      unit_price REAL DEFAULT 0,            -- Đơn giá
      amount REAL DEFAULT 0,                -- Thành tiền
      
      FOREIGN KEY (receipt_id) REFERENCES inventory_receipts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS inventory_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      
      -- Thông tin chung
      receiver_name TEXT,                   -- Người nhận hàng
      address TEXT,                         -- Địa chỉ
      transporter_name TEXT,                -- Người vận chuyển
      description TEXT,                     -- Diễn giải
      warehouse_code TEXT,                  -- Mã kho
      
      -- Thông tin tờ khai / Hợp đồng
      customs_declaration_no TEXT,          -- Số tờ khai
      customs_declaration_date TEXT,        -- Ngày tờ khai
      contract_no TEXT,                     -- Số hợp đồng
      contract_date TEXT,                   -- Ngày hợp đồng
      invoice_no TEXT,                      -- Số hóa đơn
      invoice_date TEXT,                    -- Ngày hóa đơn
      
      -- Thông tin chứng từ
      voucher_no TEXT UNIQUE NOT NULL,      -- Số chứng từ (VD: PX00001)
      voucher_date TEXT NOT NULL,           -- Ngày chứng từ
      original_voucher_no TEXT,             -- Số chứng từ gốc
      original_voucher_date TEXT,           -- Ngày chứng từ gốc
      exchange_rate REAL DEFAULT 1,         -- Tỷ giá
      currency TEXT DEFAULT 'VND',          -- Loại tiền
      issue_type TEXT,                      -- Loại phiếu xuất
      item_type TEXT,                       -- Loại hàng
      is_self_supplied INTEGER DEFAULT 0,   -- Tự cung ứng (1/0)
      
      -- Tổng tiền & Trạng thái
      total_quantity REAL DEFAULT 0,        -- Tổng lượng
      total_amount REAL DEFAULT 0,          -- Tổng tiền hàng
      status TEXT DEFAULT 'New',            -- Trạng thái phiếu
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS inventory_issue_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER NOT NULL,            -- Khóa ngoại nối với bảng inventory_issues
      line_number INTEGER,                  -- STT dòng
      
      item_code TEXT NOT NULL,              -- Mã hàng
      item_name TEXT,                       -- Tên hàng
      ecus_item_code TEXT,                  -- Mã hàng ECUS
      warehouse_code TEXT,                  -- Kho
      debit_account TEXT,                   -- TK Nợ
      credit_account TEXT,                  -- TK Có
      unit TEXT,                            -- Đơn vị tính
      quantity REAL DEFAULT 0,              -- Số lượng
      unit_price REAL DEFAULT 0,            -- Đơn giá
      amount REAL DEFAULT 0,                -- Thành tiền
      
      FOREIGN KEY (issue_id) REFERENCES inventory_issues(id) ON DELETE CASCADE
);
`);

// 3. Viết các API thao tác dữ liệu với SQLite

// Lấy danh sách (SELECT)
app.get('/api/users', (req, res) => {
  try {
    // prepare() để tạo câu lệnh SQL, all() để lấy tất cả dòng
    const stmt = db.prepare('SELECT * FROM users');
    const users = stmt.all();
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Thêm dữ liệu (INSERT)
app.post('/api/users', (req, res) => {
  try {
    const { name } = req.body;
    // Dùng dấu ? để tránh lỗi SQL Injection
    const stmt = db.prepare('INSERT INTO users (name) VALUES (?)');
    const info = stmt.run(name); // run() dùng cho INSERT, UPDATE, DELETE

    res.json({
      success: true,
      message: 'Thêm thành công',
      id: info.lastInsertRowid,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Chạy server tại cổng 3000
app.listen(3000, () => {
  console.log('Server SQLite đang chạy tại http://localhost:3000');
});
