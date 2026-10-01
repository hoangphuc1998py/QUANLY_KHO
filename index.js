const tableBody = document.querySelector('#itemsTable tbody');
const toast = document.querySelector('#toast');
let toastTimer;
// The UI may be opened from a preview server or directly from the HTML file.
// In both cases, keep API requests pointed at the Express server.
const apiBaseUrl = window.location.port === '3000' ? '' : 'http://localhost:3000';

function apiUrl(path) {
  return `${apiBaseUrl}${path}`;
}

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function rows() { return [...tableBody.querySelectorAll('.item-row')]; }

function parseTableNumber(value) {
  const text = String(value ?? '').trim().replaceAll(' ', '');
  if (!text) return 0;
  if (text.includes(',') && text.includes('.')) {
    return Number(text.lastIndexOf(',') > text.lastIndexOf('.')
      ? text.replaceAll('.', '').replace(',', '.')
      : text.replaceAll(',', '')) || 0;
  }
  if (text.includes(',')) {
    return Number(/^[-+]?\d{1,3}(,\d{3})+$/.test(text) ? text.replaceAll(',', '') : text.replace(',', '.')) || 0;
  }
  return Number(/^[-+]?\d{1,3}(\.\d{3})+$/.test(text) ? text.replaceAll('.', '') : text) || 0;
}

function recalculate() {
  let quantity = 0;
  let amount = 0;
  rows().forEach((row, index) => {
    row.children[1].textContent = row.querySelector('[contenteditable="true"]')?.textContent.trim() ? index + 1 : '';
    const qty = parseTableNumber(row.querySelector('.quantity')?.textContent);
    const price = parseTableNumber(row.querySelector('.price')?.textContent);
    quantity += qty;
    const lineAmount = qty * price;
    amount += lineAmount;
    row.querySelector('.amount').textContent = lineAmount ? lineAmount.toLocaleString('vi-VN') : '';
  });
  document.querySelector('#totalQty').textContent = quantity.toLocaleString('vi-VN');
  document.querySelector('#totalAmount').textContent = amount.toLocaleString('vi-VN');
}

function copyRow() {
  const active = document.activeElement.closest?.('.item-row') || rows().at(-1);
  const clone = active.cloneNode(true);
  clone.querySelectorAll('[contenteditable="true"]').forEach(cell => cell.textContent = '');
  clone.querySelector('.amount').textContent = '';
  tableBody.append(clone);
  clone.querySelector('[contenteditable="true"]')?.focus();
  recalculate();
}

function deleteCurrentRow() {
  const row = document.activeElement.closest?.('.item-row');
  if (row && rows().length > 1) row.remove();
  recalculate();
}

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  const other = tab.dataset.tab === 'other';
  document.querySelectorAll('.tab').forEach(item => item.classList.toggle('active', item === tab));
  document.querySelector('.main-grid').classList.toggle('hidden', other);
  document.querySelector('#otherPage').classList.toggle('hidden', !other);
}));

const pagePresets = {
  in: {
    title: 'Phiếu nhập kho kế toán (Gia công)',
    receiver: 'Người giao hàng:',
    code: 'PN00002',
    voucherAction: '⟳ Tạo phiếu nhập kho gộp...',
    voucherType: ['Thành phẩm sản xuất', 'Nhập mua hàng', 'Nhập khác'],
    goodsType: ['Nguyên liệu', 'Thành phẩm', 'Công cụ dụng cụ'],
    headers: ['▧', 'STT', 'Mã hàng', 'Tên hàng', 'Mã hàng ECUS', 'Kho', 'TK Nợ', 'TK Có', 'Đơn vị tính', 'Số lượng', 'Đơn giá', 'Thành tiền']
  },
  out: {
    title: 'Phiếu xuất kho kế toán (Gia công)',
    receiver: 'Người nhận hàng:',
    code: 'PX00001',
    voucherAction: '⟳ Tạo phiếu xuất kho gộp...',
    voucherType: ['Sản xuất', 'Xuất bán', 'Xuất khác'],
    goodsType: ['Sản phẩm', 'Nguyên liệu', 'Công cụ dụng cụ'],
    headers: ['▧', 'STT', 'Mã hàng', 'Tên hàng', 'Mã hàng ECUS', 'Đơn vị tính', 'Kho', 'TK Nợ', 'TK Có', 'Số lượng', 'Đơn giá', 'Thành tiền']
  }
};

function setOptions(select, labels, selected) {
  select.replaceChildren(...labels.map(label => new Option(label, label)));
  select.value = selected;
}

const currencySelect = document.querySelector('#currencyCode');
const exchangeRateInput = document.querySelector('.document-box .rate');
const currencyRatesDialog = document.querySelector('#currencyRatesDialog');
const exchangeRates = { VND: '1' };
try {
  Object.assign(exchangeRates, JSON.parse(localStorage.getItem('quanlykho-exchange-rates') || '{}'));
} catch { /* Start with the VND default if stored settings are unavailable. */ }

function saveExchangeRates() {
  try { localStorage.setItem('quanlykho-exchange-rates', JSON.stringify(exchangeRates)); }
  catch { notify('Không thể lưu tỷ giá trên trình duyệt này.'); }
}

function loadSelectedCurrencyRate() {
  const currency = currencySelect.value;
  exchangeRateInput.value = exchangeRates[currency] ?? '';
  exchangeRateInput.readOnly = currency === 'VND';
}

function populateExchangeRateTable() {
  document.querySelectorAll('[data-currency-rate]').forEach(input => {
    input.value = exchangeRates[input.dataset.currencyRate] || '';
  });
}

currencySelect.addEventListener('change', loadSelectedCurrencyRate);
exchangeRateInput.addEventListener('input', () => {
  exchangeRates[currencySelect.value] = exchangeRateInput.value;
  const tableInput = document.querySelector(`[data-currency-rate="${currencySelect.value}"]`);
  if (tableInput) tableInput.value = exchangeRateInput.value;
  saveExchangeRates();
});
document.querySelector('#openCurrencyRates').addEventListener('click', () => {
  populateExchangeRateTable();
  currencyRatesDialog.showModal();
});
document.querySelector('#closeCurrencyRates').addEventListener('click', () => currencyRatesDialog.close());
document.querySelector('#cancelCurrencyRates').addEventListener('click', () => currencyRatesDialog.close());
document.querySelector('#saveCurrencyRates').addEventListener('click', () => {
  document.querySelectorAll('[data-currency-rate]').forEach(input => {
    const value = input.value.trim();
    if (value && Number(value) > 0) exchangeRates[input.dataset.currencyRate] = value;
    else delete exchangeRates[input.dataset.currencyRate];
  });
  exchangeRates.VND = '1';
  saveExchangeRates();
  loadSelectedCurrencyRate();
  currencyRatesDialog.close();
  notify('Đã lưu bảng tỷ giá.');
});
loadSelectedCurrencyRate();

function changePage(page) {
  const reportMode = page === 'report';
  document.querySelector('#stockReportPage').classList.toggle('hidden', !reportMode);
  document.querySelector('.page').classList.toggle('hidden', reportMode);
  document.querySelector('.tabs').classList.toggle('hidden', reportMode);
  document.querySelector('.actions').classList.toggle('hidden', reportMode);
  document.querySelectorAll('.page-choice').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  if (reportMode) {
    document.querySelector('.titlebar strong').textContent = 'Báo cáo nhập xuất tồn (Gia công)';
    return;
  }
  const config = pagePresets[page];
  document.querySelector('.titlebar strong').textContent = config.title;
  document.querySelector('.general-box .form-row span').innerHTML = `${config.receiver} <b>*</b>`;
  document.querySelector('.voucher').value = config.code;
  document.querySelector('#createVoucher').textContent = config.voucherAction;
  document.querySelector('#saveReceipt').disabled = page !== 'in';
  document.querySelector('#saveReceipt').textContent = page === 'in' ? 'Lưu phiếu nhập' : 'Lưu phiếu xuất';
  setOptions(document.querySelector('#voucherType'), config.voucherType, page === 'out' ? 'Sản xuất' : 'Thành phẩm sản xuất');
  setOptions(document.querySelector('#goodsType'), config.goodsType, page === 'out' ? 'Sản phẩm' : 'Nguyên liệu');
  document.querySelectorAll('#itemsTable thead th').forEach((header, index) => { header.textContent = config.headers[index]; });
  document.querySelector('.page').dataset.documentType = page;
}

document.querySelectorAll('.page-choice').forEach(button => button.addEventListener('click', () => changePage(button.dataset.page)));

const warehouseNames = {
  'KHO TONG CONG CTY': 'KHO TONG CONG TY',
  'KHO AN HUNG': 'KHO NPL XI NGHIEP AN HUNG',
  'KHO AN THINH': 'KHO NPL XI NGHIEP AN THINH',
  'KHO AN PHU': 'KHO NPL XI NGHIEP AN PHU',
  'KHO AN PHAT': 'KHO NPL XI NGHIEP AN PHAT',
  'KHO VESTON': 'KHO NPL XI NGHIEP VESTON'
};
document.querySelector('#warehousePicker').addEventListener('change', event => {
  const code = event.target.value;
  if (!code) return;
  document.querySelector('#warehouseName').value = warehouseNames[code];
});
const senderPicker = document.querySelector('#senderPicker');
const senderNameInput = document.querySelector('#senderName');
const senderAddressInput = document.querySelector('#senderAddress');
const deliveryPersonDialog = document.querySelector('#deliveryPersonDialog');
const deliveryPersonForm = document.querySelector('#deliveryPersonForm');
const deliveryPersonMessage = document.querySelector('#deliveryPersonMessage');
let deliveryPeople = [];

async function loadDeliveryPeople() {
  try {
    const response = await fetch(apiUrl('/api/delivery-people'));
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'Không tải được danh sách người giao hàng.');
    deliveryPeople = result.data;
    senderPicker.replaceChildren(
      new Option('Chọn người giao hàng', ''),
      ...deliveryPeople.map(person => new Option(person.name, String(person.id))),
    );
  } catch (error) {
    notify(error.message || 'Không thể kết nối cơ sở dữ liệu.');
  }
}

senderPicker.addEventListener('change', event => {
  const person = deliveryPeople.find(item => item.id === Number(event.target.value));
  senderNameInput.value = person?.name || '';
  senderAddressInput.value = person?.address || '';
});

const deliveryPersonNameInput = document.querySelector('#deliveryPersonName');
const deliveryPersonAddressInput = document.querySelector('#deliveryPersonAddress');
const saveDeliveryPersonButton = document.querySelector('#saveDeliveryPerson');

document.querySelector('#openDeliveryPersonDialog').addEventListener('click', () => {
  deliveryPersonNameInput.value = '';
  deliveryPersonAddressInput.value = '';
  deliveryPersonMessage.hidden = true;
  deliveryPersonMessage.textContent = '';
  deliveryPersonDialog.showModal();
  deliveryPersonNameInput.focus();
});
document.querySelector('#closeDeliveryPersonDialog').addEventListener('click', () => deliveryPersonDialog.close());
document.querySelector('#cancelDeliveryPersonDialog').addEventListener('click', () => deliveryPersonDialog.close());

async function saveDeliveryPerson() {
  const name = deliveryPersonNameInput.value.trim();
  const address = deliveryPersonAddressInput.value.trim();
  if (!name) {
    deliveryPersonMessage.textContent = 'Vui lòng nhập tên người giao hàng.';
    deliveryPersonMessage.hidden = false;
    deliveryPersonNameInput.focus();
    return;
  }
  if (!address) {
    deliveryPersonMessage.textContent = 'Vui lòng nhập địa chỉ người giao hàng.';
    deliveryPersonMessage.hidden = false;
    deliveryPersonAddressInput.focus();
    return;
  }

  deliveryPersonMessage.hidden = true;
  saveDeliveryPersonButton.disabled = true;
  saveDeliveryPersonButton.textContent = 'Đang lưu...';
  try {
    const response = await fetch(apiUrl('/api/delivery-people'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, address }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      const detail = result.error || `Máy chủ trả về HTTP ${response.status}.`;
      throw new Error(`Không thể lưu người giao hàng: ${detail}`);
    }
    await loadDeliveryPeople();
    senderPicker.value = String(result.data.id);
    senderPicker.dispatchEvent(new Event('change'));
    deliveryPersonDialog.close();
    notify('Đã lưu người giao hàng.');
  } catch (error) {
    deliveryPersonMessage.textContent = error.message || 'Không thể kết nối cơ sở dữ liệu.';
    deliveryPersonMessage.hidden = false;
  } finally {
    saveDeliveryPersonButton.disabled = false;
    saveDeliveryPersonButton.textContent = 'Lưu';
  }
}

saveDeliveryPersonButton.addEventListener('click', saveDeliveryPerson);
deliveryPersonForm.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveDeliveryPerson();
  }
});

function activeReportTable() {
  return document.querySelector('#reportResults.detail-view .paper-table-wrap:not(.inventory-table) table')
    || document.querySelector('.inventory-table .inventory-ledger');
}

function showInventoryReport(detail = false) {
  const form = new FormData(document.querySelector('#stockReportForm'));
  const from = form.get('fromDate');
  const to = form.get('toDate');
  if (from && to && from > to) {
    notify('Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.');
    return false;
  }
  const category = form.get('goodsCategory');
  const warehouse = form.get('warehouse');
  const contract = form.get('contract');
  const displayDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('vi-VN') : '';
  document.querySelector('#paperFrom').textContent = displayDate(from);
  document.querySelector('#paperTo').textContent = displayDate(to);
  document.querySelector('#paperWarehouseName').textContent = warehouse;
  document.querySelector('#paperWarehouseCode').textContent = warehouse === 'Kho thành phẩm' ? 'KHO-TP' : warehouse === 'Kho nguyên liệu' ? 'KHO-NL' : 'KHO-PL';
  document.querySelector('#paperContract').textContent = contract;
  const item = form.get('item')?.trim();
  const productCode = form.get('productCode')?.trim();
  document.querySelector('#paperFormCode').textContent = `${detail ? 'Báo cáo chi tiết' : 'Báo cáo nhập xuất tồn'} · ${category}${item ? ` · ${item}` : ''}${productCode ? ` · Mã SP: ${productCode}` : ''}`;
  document.querySelector('.paper-title').textContent = detail ? 'THẺ KHO CHI TIẾT' : 'BÁO CÁO NHẬP XUẤT TỒN';
  document.querySelector('#reportResults').classList.toggle('detail-view', detail);
  if (form.get('foreignCurrency')) notify('Bản xem trước đang hiển thị trị giá minh họa; chưa quy đổi theo tỷ giá ngoại tệ.');
  document.querySelector('#reportResults').classList.remove('hidden');
  document.querySelector('#stockReportPage').classList.add('is-viewing-report');
  document.querySelector('#inventorySearch').value = '';
  activeReportTable().querySelectorAll('tbody tr').forEach(row => { row.hidden = false; });
  return true;
}

document.querySelector('#stockReportForm').addEventListener('submit', event => {
  event.preventDefault();
  showInventoryReport(false);
});
document.querySelector('#detailReportBtn').addEventListener('click', () => showInventoryReport(true));

document.querySelector('#closeReport').addEventListener('click', () => {
  document.querySelector('#reportResults').classList.add('hidden');
  document.querySelector('#reportResults').classList.remove('detail-view');
  document.querySelector('#stockReportPage').classList.remove('is-viewing-report');
  changePage(document.querySelector('.page').dataset.documentType || 'in');
});

document.querySelector('#printInventory').addEventListener('click', () => window.print());
document.querySelector('#firstReportPage').disabled = true;
document.querySelector('#previousReportPage').disabled = true;
document.querySelector('#nextReportPage').disabled = true;
document.querySelector('#lastReportPage').disabled = true;
document.querySelector('#focusReportSearch').addEventListener('click', () => document.querySelector('#inventorySearch').focus());
document.querySelector('#closeReportViewer').addEventListener('click', () => {
  document.querySelector('#reportResults').classList.add('hidden');
  document.querySelector('#reportResults').classList.remove('detail-view');
  document.querySelector('#stockReportPage').classList.remove('is-viewing-report');
});
document.querySelector('#refreshInventory').addEventListener('click', () => {
  document.querySelector('#inventorySearch').value = '';
  document.querySelector('#reportZoom').value = '100';
  document.querySelector('.report-paper').style.zoom = '1';
  activeReportTable().querySelectorAll('tbody tr').forEach(row => { row.hidden = false; });
  notify('Báo cáo đã được làm mới.');
});
document.querySelector('#editReportFilters').addEventListener('click', () => {
  document.querySelector('#stockReportPage').classList.remove('is-viewing-report');
  document.querySelector('#reportResults').classList.add('hidden');
  document.querySelector('#stockReportForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
document.querySelector('#inventorySearch').addEventListener('input', event => {
  const query = event.target.value.trim().toLocaleLowerCase('vi');
  activeReportTable().querySelectorAll('tbody tr').forEach(row => {
    row.hidden = Boolean(query) && !row.textContent.toLocaleLowerCase('vi').includes(query);
  });
});
document.querySelector('#reportZoom').addEventListener('change', event => {
  document.querySelector('.report-paper').style.zoom = `${Number(event.target.value) / 100}`;
});
document.querySelector('#exportInventoryCsv').addEventListener('click', () => {
  const table = activeReportTable();
  const subheaders = [...table.tHead.rows[1].cells];
  let subheaderIndex = 0;
  const headers = [...table.tHead.rows[0].cells].flatMap(cell => {
    const count = Number(cell.colSpan) || 1;
    if (count === 1) return [cell.innerText.trim()];
    const parent = cell.innerText.trim();
    return Array.from({ length: count }, () => `${parent} - ${subheaders[subheaderIndex++].innerText.trim()}`);
  });
  const quote = value => `"${String(value).replaceAll('"', '""').replaceAll('\n', ' ').trim()}"`;
  const rows = [headers.map(quote).join(',')];
  [...table.tBodies[0].rows].forEach(row => {
    const values = [...row.cells].flatMap(cell => [cell.innerText.trim(), ...Array(Math.max(0, cell.colSpan - 1)).fill('')]);
    rows.push(values.map(quote).join(','));
  });
  const csv = `\uFEFF${rows.join('\r\n')}`;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = 'bao-cao-tong-hop-ton-kho.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

function cellValue(row, index) {
  return row.cells[index]?.textContent.trim() || '';
}

function collectReceiptItems() {
  return rows().map(row => ({
    itemCode: cellValue(row, 2),
    itemName: cellValue(row, 3),
    ecusItemCode: cellValue(row, 4),
    warehouseCode: cellValue(row, 5),
    debitAccount: cellValue(row, 6),
    creditAccount: cellValue(row, 7),
    unit: cellValue(row, 8),
    quantity: parseTableNumber(cellValue(row, 9)),
    unitPrice: parseTableNumber(cellValue(row, 10)),
  })).filter(item => Object.values(item).some(value => value !== '' && value !== 0));
}

function receiptPayload() {
  return {
    deliveryPersonId: senderPicker.value,
    transporterName: document.querySelector('#transporterName').value,
    description: document.querySelector('#receiptDescription').value,
    warehouseCode: document.querySelector('#warehousePicker').value,
    productCode: document.querySelector('#productCode').value,
    customsDeclarationNo: document.querySelector('#customsDeclarationNo').value,
    customsDeclarationDate: document.querySelector('#customsDeclarationDate').value,
    contractNo: document.querySelector('#contractNo').value,
    contractDate: document.querySelector('#contractDate').value,
    invoiceNo: document.querySelector('#invoiceNo').value,
    invoiceDate: document.querySelector('#invoiceDate').value,
    voucherNo: document.querySelector('#voucherNo').value,
    voucherDate: document.querySelector('#voucherDate').value,
    originalVoucherNo: document.querySelector('#originalVoucherNo').value,
    originalVoucherDate: document.querySelector('#originalVoucherDate').value,
    exchangeRate: exchangeRateInput.value,
    currency: currencySelect.value,
    receiptType: document.querySelector('#voucherType').value,
    itemType: document.querySelector('#goodsType').value,
    isSelfSupplied: document.querySelector('#isSelfSupplied').checked,
    items: collectReceiptItems(),
  };
}

async function saveReceipt() {
  if (document.querySelector('.page').dataset.documentType !== 'in') {
    notify('Chức năng này hiện chỉ áp dụng cho phiếu nhập kho.');
    return;
  }

  const payload = receiptPayload();
  if (!payload.deliveryPersonId) {
    notify('Vui lòng chọn người giao hàng.');
    senderPicker.focus();
    return;
  }
  if (!payload.voucherNo.trim() || !payload.voucherDate) {
    notify('Vui lòng nhập số và ngày chứng từ.');
    return;
  }
  if (!payload.items.length) {
    notify('Vui lòng nhập ít nhất một dòng hàng.');
    return;
  }

  const saveButton = document.querySelector('#saveReceipt');
  saveButton.disabled = true;
  saveButton.textContent = 'Đang lưu...';
  try {
    const response = await fetch(apiUrl('/api/inventory-receipts'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'Không thể lưu phiếu nhập kho.');
    document.querySelector('#receiptStatus').textContent = 'Đã lưu phiếu';
    notify(`Đã lưu phiếu ${result.data.voucherNo} vào cơ sở dữ liệu.`);
  } catch (error) {
    notify(error.message || 'Không thể kết nối cơ sở dữ liệu.');
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Lưu phiếu nhập';
  }
}

tableBody.addEventListener('input', recalculate);
tableBody.addEventListener('focusin', event => {
  const row = event.target.closest('.item-row');
  if (row) rows().forEach(item => item.classList.toggle('selected', item === row));
});

document.querySelector('#copyRow').addEventListener('click', copyRow);
document.querySelector('#saveReceipt').addEventListener('click', saveReceipt);
document.querySelector('#exitBtn').addEventListener('click', () => notify('Đã đóng cửa sổ phiếu nhập kho.'));
document.querySelector('#searchBtn').addEventListener('click', () => notify('Chức năng tìm chứng từ đang sẵn sàng kết nối dữ liệu.'));
document.querySelector('#createVoucher').addEventListener('click', () => {
  const name = document.querySelector('.page').dataset.documentType === 'out' ? 'xuất' : 'nhập';
  notify(`Chức năng tạo phiếu ${name} kho gộp đang sẵn sàng kết nối dữ liệu.`);
});
document.querySelector('#helpLink').addEventListener('click', event => { event.preventDefault(); notify('F5: copy dòng · F8: xóa dòng · F11: xóa tất cả.'); });
loadDeliveryPeople();

document.addEventListener('keydown', event => {
  if (event.key === 'F1') { event.preventDefault(); document.querySelector('#helpLink').click(); }
  if (event.key === 'F5') { event.preventDefault(); copyRow(); }
  if (event.key === 'F8') { event.preventDefault(); deleteCurrentRow(); }
  if (event.key === 'F11') {
    event.preventDefault();
    const first = rows()[0];
    tableBody.replaceChildren(first);
    first.querySelectorAll('[contenteditable="true"]').forEach(cell => cell.textContent = '');
    first.querySelector('.amount').textContent = '';
    recalculate();
  }
  if (event.key === 'Enter' && event.target.matches('[contenteditable="true"]')) {
    event.preventDefault();
    const cells = [...event.target.closest('tr').querySelectorAll('[contenteditable="true"]')];
    const next = cells[cells.indexOf(event.target) + 1];
    if (next) next.focus();
    else copyRow();
  }
});
