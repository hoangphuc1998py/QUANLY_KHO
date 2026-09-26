const tableBody = document.querySelector('#itemsTable tbody');
const toast = document.querySelector('#toast');
let toastTimer;

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function rows() { return [...tableBody.querySelectorAll('.item-row')]; }

function recalculate() {
  let quantity = 0;
  let amount = 0;
  rows().forEach((row, index) => {
    row.children[1].textContent = row.querySelector('[contenteditable="true"]')?.textContent.trim() ? index + 1 : '';
    const qty = Number(row.querySelector('.quantity')?.textContent.replaceAll(',', '').trim()) || 0;
    const price = Number(row.querySelector('.price')?.textContent.replaceAll(',', '').trim()) || 0;
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

function changePage(page) {
  const reportMode = page === 'report';
  document.querySelector('#stockReportPage').classList.toggle('hidden', !reportMode);
  document.querySelector('.page').classList.toggle('hidden', reportMode);
  document.querySelector('.tabs').classList.toggle('hidden', reportMode);
  document.querySelector('.actions').classList.toggle('hidden', reportMode);
  document.querySelectorAll('.page-choice').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  if (reportMode) {
    document.querySelector('.titlebar strong').textContent = 'Báo cáo thẻ kho chi tiết';
    return;
  }
  const config = pagePresets[page];
  document.querySelector('.titlebar strong').textContent = config.title;
  document.querySelector('.general-box .form-row span').innerHTML = `${config.receiver} <b>*</b>`;
  document.querySelector('.voucher').value = config.code;
  document.querySelector('#createVoucher').textContent = config.voucherAction;
  const selects = document.querySelectorAll('.document-box select');
  setOptions(selects[0], config.voucherType, page === 'out' ? 'Sản xuất' : 'Thành phẩm sản xuất');
  setOptions(selects[1], config.goodsType, page === 'out' ? 'Sản phẩm' : 'Nguyên liệu');
  document.querySelectorAll('#itemsTable thead th').forEach((header, index) => { header.textContent = config.headers[index]; });
  document.querySelector('.page').dataset.documentType = page;
}

document.querySelectorAll('.page-choice').forEach(button => button.addEventListener('click', () => changePage(button.dataset.page)));

document.querySelector('#stockReportForm').addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const from = form.get('fromDate');
  const to = form.get('toDate');
  if (from && to && from > to) {
    notify('Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.');
    return;
  }
  const category = form.get('goodsCategory');
  const warehouse = form.get('warehouse');
  const reportType = form.get('reportType');
  const contract = form.get('contract');
  const displayDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('vi-VN') : '';
  document.querySelector('#paperFormCode').textContent = `Mẫu số ${reportType}`;
  document.querySelector('#paperFrom').textContent = displayDate(from);
  document.querySelector('#paperTo').textContent = displayDate(to);
  document.querySelector('#paperWarehouseName').textContent = warehouse;
  document.querySelector('#paperWarehouseCode').textContent = warehouse === 'Kho thành phẩm' ? 'KHO-TP' : warehouse === 'Kho nguyên liệu' ? 'KHO-NL' : 'KHO-PL';
  document.querySelector('.contract-row strong').textContent = `Số hợp đồng: ${contract}`;
  document.querySelector('#reportResults').classList.remove('hidden');
});

document.querySelector('#closeReport').addEventListener('click', () => {
  document.querySelector('#reportResults').classList.add('hidden');
  changePage(document.querySelector('.page').dataset.documentType || 'in');
});

tableBody.addEventListener('input', recalculate);
tableBody.addEventListener('focusin', event => {
  const row = event.target.closest('.item-row');
  if (row) rows().forEach(item => item.classList.toggle('selected', item === row));
});

document.querySelector('#copyRow').addEventListener('click', copyRow);
document.querySelector('#exitBtn').addEventListener('click', () => notify('Đã đóng cửa sổ phiếu nhập kho.'));
document.querySelector('#searchBtn').addEventListener('click', () => notify('Chức năng tìm chứng từ đang sẵn sàng kết nối dữ liệu.'));
document.querySelector('#createVoucher').addEventListener('click', () => {
  const name = document.querySelector('.page').dataset.documentType === 'out' ? 'xuất' : 'nhập';
  notify(`Chức năng tạo phiếu ${name} kho gộp đang sẵn sàng kết nối dữ liệu.`);
});
document.querySelector('#helpLink').addEventListener('click', event => { event.preventDefault(); notify('F5: copy dòng · F8: xóa dòng · F11: xóa tất cả.'); });

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
