const tableBody = document.querySelector('#itemsTable tbody')
const toast = document.querySelector('#toast')
let toastTimer
// The UI may be opened from a preview server or directly from the HTML file.
// In both cases, keep API requests pointed at the Express server.
const apiBaseUrl =
  window.location.port === '3000' ? '' : 'http://localhost:3000'

function apiUrl(path) {
  return `${apiBaseUrl}${path}`
}

function apiErrorMessage(error, fallback) {
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return 'Không kết nối được máy chủ kho. Hãy chạy lệnh npm start trong thư mục dự án rồi thử lại.'
  }
  return error.message || fallback
}

function notify(message) {
  toast.textContent = message
  toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200)
}

function rows() {
  return [...tableBody.querySelectorAll('.item-row')]
}

function parseTableNumber(value) {
  const text = String(value ?? '')
    .trim()
    .replaceAll(' ', '')
  if (!text) return 0
  if (text.includes(',') && text.includes('.')) {
    return (
      Number(
        text.lastIndexOf(',') > text.lastIndexOf('.')
          ? text.replaceAll('.', '').replace(',', '.')
          : text.replaceAll(',', '')
      ) || 0
    )
  }
  if (text.includes(',')) {
    return (
      Number(
        /^[-+]?\d{1,3}(,\d{3})+$/.test(text)
          ? text.replaceAll(',', '')
          : text.replace(',', '.')
      ) || 0
    )
  }
  return (
    Number(
      /^[-+]?\d{1,3}(\.\d{3})+$/.test(text) ? text.replaceAll('.', '') : text
    ) || 0
  )
}

function recalculate() {
  let quantity = 0
  let amount = 0
  rows().forEach((row, index) => {
    row.children[1].textContent = row
      .querySelector('[contenteditable="true"]')
      ?.textContent.trim()
      ? index + 1
      : ''
    const qty = parseTableNumber(row.querySelector('.quantity')?.textContent)
    const price = parseTableNumber(row.querySelector('.price')?.textContent)
    quantity += qty
    const lineAmount = qty * price
    amount += lineAmount
    row.querySelector('.amount').textContent = lineAmount
      ? lineAmount.toLocaleString('vi-VN')
      : ''
  })
  document.querySelector('#totalQty').textContent =
    quantity.toLocaleString('vi-VN')
  document.querySelector('#totalAmount').textContent =
    amount.toLocaleString('vi-VN')
}

function copyRow() {
  const active = document.activeElement.closest?.('.item-row') || rows().at(-1)
  const clone = active.cloneNode(true)
  clone
    .querySelectorAll('[contenteditable="true"]')
    .forEach(cell => (cell.textContent = ''))
  clone.querySelector('.amount').textContent = ''
  tableBody.append(clone)
  clone.querySelector('[contenteditable="true"]')?.focus()
  recalculate()
}

function deleteCurrentRow() {
  const row = document.activeElement.closest?.('.item-row')
  if (row && rows().length > 1) row.remove()
  recalculate()
}

document.querySelectorAll('.tab').forEach(tab =>
  tab.addEventListener('click', () => {
    const other = tab.dataset.tab === 'other'
    document
      .querySelectorAll('.tab')
      .forEach(item => item.classList.toggle('active', item === tab))
    document.querySelector('.main-grid').classList.toggle('hidden', other)
    document.querySelector('#otherPage').classList.toggle('hidden', !other)
  })
)

const pagePresets = {
  in: {
    title: 'Phiếu nhập kho kế toán (Gia công)',
    receiver: 'Nhà cung cấp:',
    code: 'PN00002',
    voucherAction: '⟳ Tạo phiếu nhập kho gộp...',
    voucherType: ['Thành phẩm sản xuất', 'Nhập mua hàng', 'Nhập khác'],
    goodsType: ['Nguyên liệu', 'Thành phẩm', 'Công cụ dụng cụ'],
    headers: [
      '▧',
      'STT',
      'Mã hàng',
      'Tên hàng',
      'Mã hàng ECUS',
      'Kho',
      'TK Nợ',
      'TK Có',
      'Đơn vị tính',
      'Số lượng',
      'Đơn giá',
      'Thành tiền',
    ],
  },
  out: {
    title: 'Phiếu xuất kho kế toán (Gia công)',
    receiver: 'Người nhận hàng:',
    code: 'PX00001',
    voucherAction: '⟳ Tạo phiếu xuất kho gộp...',
    voucherType: ['Sản xuất', 'Xuất bán', 'Xuất khác'],
    goodsType: ['Sản phẩm', 'Nguyên liệu', 'Công cụ dụng cụ'],
    headers: [
      '▧',
      'STT',
      'Mã hàng',
      'Tên hàng',
      'Mã hàng ECUS',
      'Đơn vị tính',
      'Kho',
      'TK Nợ',
      'TK Có',
      'Số lượng',
      'Đơn giá',
      'Thành tiền',
    ],
  },
}

function setOptions(select, labels, selected) {
  select.replaceChildren(...labels.map(label => new Option(label, label)))
  select.value = selected
}

const currencySelect = document.querySelector('#currencyCode')
const exchangeRateInput = document.querySelector('.document-box .rate')
const currencyRatesDialog = document.querySelector('#currencyRatesDialog')
const exchangeRates = { VND: '1' }
try {
  Object.assign(
    exchangeRates,
    JSON.parse(localStorage.getItem('quanlykho-exchange-rates') || '{}')
  )
} catch {
  /* Start with the VND default if stored settings are unavailable. */
}

function saveExchangeRates() {
  try {
    localStorage.setItem(
      'quanlykho-exchange-rates',
      JSON.stringify(exchangeRates)
    )
  } catch {
    notify('Không thể lưu tỷ giá trên trình duyệt này.')
  }
}

function loadSelectedCurrencyRate() {
  const currency = currencySelect.value
  exchangeRateInput.value = exchangeRates[currency] ?? ''
  exchangeRateInput.readOnly = currency === 'VND'
}

function populateExchangeRateTable() {
  document.querySelectorAll('[data-currency-rate]').forEach(input => {
    input.value = exchangeRates[input.dataset.currencyRate] || ''
  })
}

currencySelect.addEventListener('change', loadSelectedCurrencyRate)
exchangeRateInput.addEventListener('input', () => {
  exchangeRates[currencySelect.value] = exchangeRateInput.value
  const tableInput = document.querySelector(
    `[data-currency-rate="${currencySelect.value}"]`
  )
  if (tableInput) tableInput.value = exchangeRateInput.value
  saveExchangeRates()
})
document.querySelector('#openCurrencyRates').addEventListener('click', () => {
  populateExchangeRateTable()
  currencyRatesDialog.showModal()
})
document
  .querySelector('#closeCurrencyRates')
  .addEventListener('click', () => currencyRatesDialog.close())
document
  .querySelector('#cancelCurrencyRates')
  .addEventListener('click', () => currencyRatesDialog.close())
document.querySelector('#saveCurrencyRates').addEventListener('click', () => {
  document.querySelectorAll('[data-currency-rate]').forEach(input => {
    const value = input.value.trim()
    if (value && Number(value) > 0)
      exchangeRates[input.dataset.currencyRate] = value
    else delete exchangeRates[input.dataset.currencyRate]
  })
  exchangeRates.VND = '1'
  saveExchangeRates()
  loadSelectedCurrencyRate()
  currencyRatesDialog.close()
  notify('Đã lưu bảng tỷ giá.')
})
loadSelectedCurrencyRate()

function changePage(page) {
  const reportMode = page === 'report'
  const previousType = document.querySelector('.page').dataset.documentType
  document
    .querySelector('#stockReportPage')
    .classList.toggle('hidden', !reportMode)
  document.querySelector('.page').classList.toggle('hidden', reportMode)
  document.querySelector('.tabs').classList.toggle('hidden', reportMode)
  document.querySelector('.actions').classList.toggle('hidden', reportMode)
  document
    .querySelectorAll('.page-choice')
    .forEach(button =>
      button.classList.toggle('active', button.dataset.page === page)
    )
  if (reportMode) {
    document.querySelector('.titlebar strong').textContent =
      'Báo cáo nhập xuất tồn (Gia công)'
    return
  }
  const config = pagePresets[page]
  if (previousType && previousType !== page) currentSavedId = null
  document.querySelector('.titlebar strong').textContent = config.title
  document.querySelector('.general-box .form-row span').innerHTML =
    `${config.receiver} <b>*</b>`
  document.querySelector('#senderPicker option[value=""]').textContent =
    page === 'out' ? 'Chọn người nhận hàng' : 'Chọn nhà cung cấp'
  document.querySelector('.voucher').value = config.code
  document.querySelector('#createVoucher').textContent = config.voucherAction
  setOptions(
    document.querySelector('#voucherType'),
    config.voucherType,
    page === 'out' ? 'Sản xuất' : 'Thành phẩm sản xuất'
  )
  setOptions(
    document.querySelector('#goodsType'),
    config.goodsType,
    page === 'out' ? 'Sản phẩm' : 'Nguyên liệu'
  )
  document.querySelectorAll('#itemsTable thead th').forEach((header, index) => {
    header.textContent = config.headers[index]
  })
  document.querySelector('.page').dataset.documentType = page
}

document
  .querySelectorAll('.page-choice')
  .forEach(button =>
    button.addEventListener('click', () => changePage(button.dataset.page))
  )

const warehouseNames = {
  'KHO TONG CONG CTY': 'KHO TONG CONG TY',
  'KHO AN HUNG': 'KHO NPL XI NGHIEP AN HUNG',
  'KHO AN THINH': 'KHO NPL XI NGHIEP AN THINH',
  'KHO AN PHU': 'KHO NPL XI NGHIEP AN PHU',
  'KHO AN PHAT': 'KHO NPL XI NGHIEP AN PHAT',
  'KHO VESTON': 'KHO NPL XI NGHIEP VESTON',
}
document.querySelector('#warehousePicker').addEventListener('change', event => {
  const code = event.target.value
  if (!code) return
  document.querySelector('#warehouseName').value = warehouseNames[code]
})
const senderPicker = document.querySelector('#senderPicker')
const senderNameInput = document.querySelector('#senderName')
const senderAddressInput = document.querySelector('#senderAddress')
const deliveryPersonDialog = document.querySelector('#deliveryPersonDialog')
const deliveryPersonForm = document.querySelector('#deliveryPersonForm')
const deliveryPersonMessage = document.querySelector('#deliveryPersonMessage')
let deliveryPeople = []

async function loadDeliveryPeople() {
  try {
    const response = await fetch(apiUrl('/api/delivery-people'))
    const result = await response.json()
    if (!response.ok || !result.success)
      throw new Error(result.error || 'Không tải được danh sách nhà cung cấp.')
    deliveryPeople = result.data
    senderPicker.replaceChildren(
      new Option('Chọn nhà cung cấp', ''),
      ...deliveryPeople.map(
        person => new Option(person.name, String(person.id))
      )
    )
  } catch (error) {
    notify(apiErrorMessage(error, 'Không thể tải danh sách nhà cung cấp.'))
  }
}

senderPicker.addEventListener('change', event => {
  const person = deliveryPeople.find(
    item => item.id === Number(event.target.value)
  )
  senderNameInput.value = person?.name || ''
  senderAddressInput.value = person?.address || ''
})

const deliveryPersonNameInput = document.querySelector('#deliveryPersonName')
const deliveryPersonAddressInput = document.querySelector(
  '#deliveryPersonAddress'
)
const saveDeliveryPersonButton = document.querySelector('#saveDeliveryPerson')

document
  .querySelector('#openDeliveryPersonDialog')
  .addEventListener('click', () => {
    deliveryPersonNameInput.value = ''
    deliveryPersonAddressInput.value = ''
    deliveryPersonMessage.hidden = true
    deliveryPersonMessage.textContent = ''
    deliveryPersonDialog.showModal()
    deliveryPersonNameInput.focus()
  })
document
  .querySelector('#closeDeliveryPersonDialog')
  .addEventListener('click', () => deliveryPersonDialog.close())
document
  .querySelector('#cancelDeliveryPersonDialog')
  .addEventListener('click', () => deliveryPersonDialog.close())

async function saveDeliveryPerson() {
  const name = deliveryPersonNameInput.value.trim()
  const address = deliveryPersonAddressInput.value.trim()
  if (!name) {
    deliveryPersonMessage.textContent = 'Vui lòng nhập tên nhà cung cấp.'
    deliveryPersonMessage.hidden = false
    deliveryPersonNameInput.focus()
    return
  }
  if (!address) {
    deliveryPersonMessage.textContent = 'Vui lòng nhập địa chỉ nhà cung cấp.'
    deliveryPersonMessage.hidden = false
    deliveryPersonAddressInput.focus()
    return
  }

  deliveryPersonMessage.hidden = true
  saveDeliveryPersonButton.disabled = true
  saveDeliveryPersonButton.textContent = 'Đang lưu...'
  try {
    const response = await fetch(apiUrl('/api/delivery-people'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, address }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.success) {
      const detail = result.error || `Máy chủ trả về HTTP ${response.status}.`
      throw new Error(`Không thể lưu nhà cung cấp: ${detail}`)
    }
    await loadDeliveryPeople()
    senderPicker.value = String(result.data.id)
    senderPicker.dispatchEvent(new Event('change'))
    deliveryPersonDialog.close()
    notify('Đã lưu nhà cung cấp.')
  } catch (error) {
    deliveryPersonMessage.textContent = apiErrorMessage(
      error,
      'Không thể lưu nhà cung cấp.'
    )
    deliveryPersonMessage.hidden = false
  } finally {
    saveDeliveryPersonButton.disabled = false
    saveDeliveryPersonButton.textContent = 'Lưu'
  }
}

saveDeliveryPersonButton.addEventListener('click', saveDeliveryPerson)
deliveryPersonForm.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault()
    saveDeliveryPerson()
  }
})

function activeReportTable() {
  return (
    document.querySelector(
      '#reportResults.detail-view .paper-table-wrap:not(.inventory-table) table'
    ) || document.querySelector('.inventory-table .inventory-ledger')
  )
}

function showInventoryReport(detail = false) {
  const form = new FormData(document.querySelector('#stockReportForm'))
  const from = form.get('fromDate')
  const to = form.get('toDate')
  if (from && to && from > to) {
    notify('Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.')
    return false
  }
  const category = form.get('goodsCategory')
  const warehouse = form.get('warehouse')
  const contract = form.get('contract')
  const displayDate = value =>
    value ? new Date(`${value}T00:00:00`).toLocaleDateString('vi-VN') : ''
  document.querySelector('#paperFrom').textContent = displayDate(from)
  document.querySelector('#paperTo').textContent = displayDate(to)
  document.querySelector('#paperWarehouseName').textContent = warehouse
  document.querySelector('#paperWarehouseCode').textContent =
    warehouse === 'Kho thành phẩm'
      ? 'KHO-TP'
      : warehouse === 'Kho nguyên liệu'
        ? 'KHO-NL'
        : 'KHO-PL'
  document.querySelector('#paperContract').textContent = contract
  const item = form.get('item')?.trim()
  const productCode = form.get('productCode')?.trim()
  document.querySelector('#paperFormCode').textContent =
    `${detail ? 'Báo cáo chi tiết' : 'Báo cáo nhập xuất tồn'} · ${category}${item ? ` · ${item}` : ''}${productCode ? ` · Mã SP: ${productCode}` : ''}`
  document.querySelector('.paper-title').textContent = detail
    ? 'THẺ KHO CHI TIẾT'
    : 'BÁO CÁO NHẬP XUẤT TỒN'
  document
    .querySelector('#reportResults')
    .classList.toggle('detail-view', detail)
  if (form.get('foreignCurrency'))
    notify(
      'Bản xem trước đang hiển thị trị giá minh họa; chưa quy đổi theo tỷ giá ngoại tệ.'
    )
  document.querySelector('#reportResults').classList.remove('hidden')
  document.querySelector('#stockReportPage').classList.add('is-viewing-report')
  document.querySelector('#inventorySearch').value = ''
  activeReportTable()
    .querySelectorAll('tbody tr')
    .forEach(row => {
      row.hidden = false
    })
  return true
}

document.querySelector('#stockReportForm').addEventListener('submit', event => {
  event.preventDefault()
  showInventoryReport(false)
})
document
  .querySelector('#detailReportBtn')
  .addEventListener('click', () => showInventoryReport(true))

document.querySelector('#closeReport').addEventListener('click', () => {
  document.querySelector('#reportResults').classList.add('hidden')
  document.querySelector('#reportResults').classList.remove('detail-view')
  document
    .querySelector('#stockReportPage')
    .classList.remove('is-viewing-report')
  changePage(document.querySelector('.page').dataset.documentType || 'in')
})

document
  .querySelector('#printInventory')
  .addEventListener('click', () => window.print())
document.querySelector('#firstReportPage').disabled = true
document.querySelector('#previousReportPage').disabled = true
document.querySelector('#nextReportPage').disabled = true
document.querySelector('#lastReportPage').disabled = true
document
  .querySelector('#focusReportSearch')
  .addEventListener('click', () =>
    document.querySelector('#inventorySearch').focus()
  )
document.querySelector('#closeReportViewer').addEventListener('click', () => {
  document.querySelector('#reportResults').classList.add('hidden')
  document.querySelector('#reportResults').classList.remove('detail-view')
  document
    .querySelector('#stockReportPage')
    .classList.remove('is-viewing-report')
})
document.querySelector('#refreshInventory').addEventListener('click', () => {
  document.querySelector('#inventorySearch').value = ''
  document.querySelector('#reportZoom').value = '100'
  document.querySelector('.report-paper').style.zoom = '1'
  activeReportTable()
    .querySelectorAll('tbody tr')
    .forEach(row => {
      row.hidden = false
    })
  notify('Báo cáo đã được làm mới.')
})
document.querySelector('#editReportFilters').addEventListener('click', () => {
  document
    .querySelector('#stockReportPage')
    .classList.remove('is-viewing-report')
  document.querySelector('#reportResults').classList.add('hidden')
  document
    .querySelector('#stockReportForm')
    .scrollIntoView({ behavior: 'smooth', block: 'start' })
})
document.querySelector('#inventorySearch').addEventListener('input', event => {
  const query = event.target.value.trim().toLocaleLowerCase('vi')
  activeReportTable()
    .querySelectorAll('tbody tr')
    .forEach(row => {
      row.hidden =
        Boolean(query) &&
        !row.textContent.toLocaleLowerCase('vi').includes(query)
    })
})
document.querySelector('#reportZoom').addEventListener('change', event => {
  document.querySelector('.report-paper').style.zoom =
    `${Number(event.target.value) / 100}`
})
document.querySelector('#exportInventoryCsv').addEventListener('click', () => {
  const table = activeReportTable()
  const subheaders = [...table.tHead.rows[1].cells]
  let subheaderIndex = 0
  const headers = [...table.tHead.rows[0].cells].flatMap(cell => {
    const count = Number(cell.colSpan) || 1
    if (count === 1) return [cell.innerText.trim()]
    const parent = cell.innerText.trim()
    return Array.from(
      { length: count },
      () => `${parent} - ${subheaders[subheaderIndex++].innerText.trim()}`
    )
  })
  const quote = value =>
    `"${String(value).replaceAll('"', '""').replaceAll('\n', ' ').trim()}"`
  const rows = [headers.map(quote).join(',')]
  ;[...table.tBodies[0].rows].forEach(row => {
    const values = [...row.cells].flatMap(cell => [
      cell.innerText.trim(),
      ...Array(Math.max(0, cell.colSpan - 1)).fill(''),
    ])
    rows.push(values.map(quote).join(','))
  })
  const csv = `\uFEFF${rows.join('\r\n')}`
  const link = document.createElement('a')
  link.href = URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8' })
  )
  link.download = 'bao-cao-tong-hop-ton-kho.csv'
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
})

function cellValue(row, index) {
  return row.cells[index]?.textContent.trim() || ''
}

function collectReceiptItems() {
  return rows()
    .map(row => ({
      itemCode: cellValue(row, 2),
      itemName: cellValue(row, 3),
      ecusItemCode: cellValue(row, 4),
      warehouseCode: cellValue(row, 5),
      debitAccount: cellValue(row, 6),
      creditAccount: cellValue(row, 7),
      unit: cellValue(row, 8),
      quantity: parseTableNumber(cellValue(row, 9)),
      unitPrice: parseTableNumber(cellValue(row, 10)),
    }))
    .filter(item =>
      Object.values(item).some(value => value !== '' && value !== 0)
    )
}

function receiptPayload() {
  return {
    deliveryPersonId: senderPicker.value,
    transporterName: document.querySelector('#transporterName').value,
    description: document.querySelector('#receiptDescription').value,
    warehouseCode: document.querySelector('#warehousePicker').value,
    productCode: document.querySelector('#productCode').value,
    customsDeclarationNo: document.querySelector('#customsDeclarationNo').value,
    customsDeclarationDate: document.querySelector('#customsDeclarationDate')
      .value,
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
  }
}

async function saveReceipt() {
  if (document.querySelector('.page').dataset.documentType !== 'in') {
    notify('Chức năng này hiện chỉ áp dụng cho phiếu nhập kho.')
    return
  }

  const payload = receiptPayload()
  if (!payload.voucherNo.trim() || !payload.voucherDate) {
    notify('Vui lòng nhập số và ngày chứng từ.')
    return
  }
  if (!payload.items.length || payload.items.some(item => !item.itemCode.trim())) {
    notify('Vui lòng nhập ít nhất một dòng hàng và mã hàng.')
    return
  }

  const saveButton = document.querySelector('#saveVoucher')
  saveButton.disabled = true
  saveButton.textContent = 'Đang ghi...'
  try {
    const response = await fetch(apiUrl('/api/inventory-receipts'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const result = await response.json()
    if (!response.ok || !result.success)
      throw new Error(result.error || 'Không thể lưu phiếu nhập kho.')
    currentSavedId = `in:${result.data.voucherNo}`
    document.querySelector('#receiptStatus').textContent = 'Đã ghi'
    notify(`Đã ghi phiếu ${result.data.voucherNo} vào cơ sở dữ liệu.`)
  } catch (error) {
    notify(apiErrorMessage(error, 'Không thể lưu phiếu nhập kho.'))
  } finally {
    saveButton.disabled = false
    saveButton.textContent = '▣ Ghi'
  }
}

tableBody.addEventListener('input', recalculate)
tableBody.addEventListener('focusin', event => {
  const row = event.target.closest('.item-row')
  if (row)
    rows().forEach(item => item.classList.toggle('selected', item === row))
})

document
  .querySelector('#copyVoucher')
  .addEventListener('click', () => createVoucher(true))
document
  .querySelector('#newVoucher')
  .addEventListener('click', () => createVoucher(false))
document.querySelector('#printVoucher').addEventListener('click', () => {
  document.body.classList.add('printing-voucher')
  window.print()
})
window.addEventListener('afterprint', () =>
  document.body.classList.remove('printing-voucher')
)

const voucherStoreKey = 'quanlykho-vouchers'
const voucherSearchDialog = document.querySelector('#voucherSearchDialog')
const voucherStatus = document.querySelector('.new-status')
let currentSavedId = null

function readVouchers() {
  try {
    const records = JSON.parse(localStorage.getItem(voucherStoreKey) || '[]')
    return Array.isArray(records) ? records : []
  } catch {
    return []
  }
}

function writeVouchers(records) {
  try {
    localStorage.setItem(voucherStoreKey, JSON.stringify(records))
    return true
  } catch {
    notify('Không thể lưu phiếu. Bộ nhớ trình duyệt có thể đã đầy.')
    return false
  }
}

function documentType() {
  return document.querySelector('.page').dataset.documentType || 'in'
}
function documentNumber() {
  return document.querySelector('.voucher').value.trim()
}
function fieldControls() {
  return [
    ...document.querySelectorAll(
      '.general-box input, .general-box select, .declaration-box input, .declaration-box select, .document-box input, .document-box select, #otherPage input, #otherPage select'
    ),
  ]
}

function captureVoucher(status = 'Đã ghi') {
  return {
    id: currentSavedId || `${documentType()}:${documentNumber()}`,
    type: documentType(),
    number: documentNumber(),
    status,
    savedAt: new Date().toISOString(),
    fields: fieldControls().map(control => ({
      value: control.value,
      checked: control.type === 'checkbox' ? control.checked : undefined,
    })),
    rows: rows().map(row => [...row.cells].map(cell => cell.textContent)),
    activeTab: document.querySelector('.tab.active')?.dataset.tab || 'general',
  }
}

function saveVoucher(status = 'Đã ghi') {
  if (documentType() === 'in') {
    saveReceipt()
    return true
  }
  if (documentType() === 'in') {
    saveReceipt()
    return true
  }
  const number = documentNumber()
  if (!number) {
    notify('Vui lòng nhập số chứng từ trước khi ghi.')
    return false
  }
  const record = captureVoucher(status)
  const records = readVouchers()
  const index = records.findIndex(
    item =>
      item.id === record.id ||
      (item.type === record.type && item.number === number)
  )
  if (index >= 0) records[index] = record
  else records.push(record)
  if (!writeVouchers(records)) return false
  currentSavedId = record.id
  voucherStatus.textContent = status
  notify(
    status === 'Đã ghi sổ'
      ? 'Đã ghi sổ chứng từ.'
      : 'Đã lưu chứng từ trên trình duyệt.'
  )
  return true
}

function nextNumber(type) {
  const prefix = type === 'out' ? 'PX' : 'PN'
  const savedMaximum = readVouchers()
    .filter(item => item.type === type)
    .reduce((max, item) => {
      const number = Number(String(item.number).replace(/^\D+/, ''))
      return Number.isFinite(number) ? Math.max(max, number) : max
    }, 0)
  const current =
    documentType() === type
      ? Number(documentNumber().replace(/^\D+/, '')) || 0
      : 0
  return `${prefix}${String(Math.max(savedMaximum, current) + 1).padStart(5, '0')}`
}

function createVoucher(copyCurrent) {
  const type = documentType()
  const copiedRecord = copyCurrent ? captureVoucher('Nháp') : null
  const newNumber = nextNumber(type)
  const controls = fieldControls()
  controls.forEach(control => {
    if (control.type === 'checkbox') control.checked = false
    else control.value = ''
  })
  document.querySelector('#senderPicker').value = ''
  document.querySelector('#warehousePicker').value = ''
  document.querySelector('#currencyCode').value = 'VND'
  exchangeRateInput.value = '1'
  exchangeRateInput.readOnly = true
  document.querySelector('#voucherType').value =
    type === 'out' ? 'Sản xuất' : 'Thành phẩm sản xuất'
  document.querySelector('#goodsType').value =
    type === 'out' ? 'Sản phẩm' : 'Nguyên liệu'
  document.querySelector('.voucher').value = newNumber
  const firstRow = rows()[0]
  tableBody.replaceChildren(firstRow)
  firstRow
    .querySelectorAll('[contenteditable="true"]')
    .forEach(cell => (cell.textContent = ''))
  firstRow.querySelector('.amount').textContent = ''
  if (copyCurrent) {
    copiedRecord.rows.forEach((values, index) => {
      if (index > 0) copyRow()
      const row = rows()[index]
      values.forEach((value, cellIndex) => {
        if (row.cells[cellIndex]) row.cells[cellIndex].textContent = value
      })
    })
  }
  currentSavedId = null
  voucherStatus.textContent = 'Nhập mới phiếu'
  document.querySelector('#closedState').classList.add('hidden')
  document.querySelector('.page').classList.remove('hidden')
  recalculate()
  notify(
    copyCurrent ? 'Đã sao chép phiếu thành chứng từ mới.' : 'Đã tạo phiếu mới.'
  )
}

function loadVoucher(record) {
  changePage(record.type)
  fieldControls().forEach((control, index) => {
    const field = record.fields[index]
    if (!field) return
    control.value = field.value
    if (control.type === 'checkbox') control.checked = Boolean(field.checked)
  })
  tableBody.replaceChildren()
  ;(record.rows || []).forEach(values => {
    const row = document.createElement('tr')
    row.className = 'item-row'
    values.forEach((value, index) => {
      const cell = document.createElement('td')
      cell.textContent = value
      if (index >= 2 && index <= 10 && index !== 11)
        cell.contentEditable = 'true'
      if (index === 0) cell.className = 'row-marker'
      if (index === 9) cell.className = 'quantity'
      if (index === 10) cell.className = 'price'
      if (index === 11) cell.className = 'amount'
      row.append(cell)
    })
    tableBody.append(row)
  })
  if (!rows().length) copyRow()
  currentSavedId = record.id
  voucherStatus.textContent = record.status || 'Đã ghi'
  const tab = document.querySelector(
    `.tab[data-tab="${record.activeTab || 'general'}"]`
  )
  tab?.click()
  voucherSearchDialog.close()
  recalculate()
  notify(`Đã mở chứng từ ${record.number}.`)
}

function loadReceiptVoucher(record) {
  const set = (id, value) => {
    const control = document.getElementById(id)
    if (control) control.value = value ?? ''
  }
  set('senderName', record.delivererName)
  set('senderAddress', record.address)
  set('transporterName', record.transporterName)
  set('receiptDescription', record.description)
  set('warehousePicker', record.warehouseCode)
  set('warehouseName', record.warehouseCode)
  set('productCode', record.productCode)
  set('customsDeclarationNo', record.customsDeclarationNo)
  set('customsDeclarationDate', record.customsDeclarationDate)
  set('contractNo', record.contractNo)
  set('contractDate', record.contractDate)
  set('invoiceNo', record.invoiceNo)
  set('invoiceDate', record.invoiceDate)
  set('voucherNo', record.voucherNo)
  set('voucherDate', record.voucherDate)
  set('originalVoucherNo', record.originalVoucherNo)
  set('originalVoucherDate', record.originalVoucherDate)
  set('voucherType', record.receiptType)
  set('goodsType', record.itemType)
  set('currencyCode', record.currency || 'VND')
  exchangeRateInput.value = String(record.exchangeRate || 1)
  document.querySelector('#isSelfSupplied').checked = Boolean(record.isSelfSupplied)
  const template = document.querySelector('#itemsTable tbody .item-row')
  tableBody.replaceChildren()
  for (const item of record.items || []) {
    const row = template.cloneNode(true)
    const values = ['', '', item.itemCode, item.itemName, item.ecusItemCode,
      item.warehouseCode, item.debitAccount, item.creditAccount, item.unit,
      String(item.quantity ?? ''), String(item.unitPrice ?? ''), '']
    values.forEach((value, index) => { row.cells[index].textContent = value })
    tableBody.append(row)
  }
  if (!tableBody.children.length) tableBody.append(template)
  currentSavedId = `in:${record.voucherNo}`
  voucherStatus.textContent = record.status || 'Đã ghi'
  voucherSearchDialog.close()
  recalculate()
  notify(`Đã mở chứng từ ${record.voucherNo}.`)
}

async function searchDatabaseReceipts(query) {
  const list = document.querySelector('#voucherSearchResults')
  try {
    const response = await fetch(apiUrl(`/api/inventory-receipts?q=${encodeURIComponent(query)}`))
    const result = await response.json()
    if (!response.ok || !result.success) throw new Error(result.error || 'Không thể tìm chứng từ.')
    const records = result.data || []
    list.replaceChildren()
    if (!records.length) {
      list.textContent = 'Không tìm thấy chứng từ trong cơ sở dữ liệu.'
      list.className = 'voucher-search-results empty'
      return
    }
    list.className = 'voucher-search-results'
    records.forEach(record => {
      const button = document.createElement('button')
      button.type = 'button'
      button.innerHTML = '<strong></strong><span></span><small></small>'
      button.querySelector('strong').textContent = record.voucherNo
      button.querySelector('span').textContent = record.delivererName || 'Nhà cung cấp'
      button.querySelector('small').textContent = record.status || 'Đã ghi'
      button.addEventListener('click', () => loadReceiptVoucher(record))
      list.append(button)
    })
  } catch (error) {
    list.textContent = apiErrorMessage(error, 'Không thể tìm chứng từ trong cơ sở dữ liệu.')
    list.className = 'voucher-search-results empty'
  }
}

function renderVoucherSearch() {
  const query = document
    .querySelector('#voucherSearchInput')
    .value.trim()
    .toLocaleLowerCase('vi')
  const list = document.querySelector('#voucherSearchResults')
  const records = readVouchers().filter(
    item =>
      item.type === documentType() &&
      `${item.number} ${item.fields?.[0]?.value || ''}`
        .toLocaleLowerCase('vi')
        .includes(query)
  )
  list.replaceChildren()
  if (!records.length) {
    list.textContent = 'Không tìm thấy chứng từ đã lưu.'
    list.className = 'voucher-search-results empty'
    return
  }
  list.className = 'voucher-search-results'
  records
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .forEach(record => {
      const button = document.createElement('button')
      button.type = 'button'
      button.innerHTML = `<strong></strong><span></span><small></small>`
      button.querySelector('strong').textContent = record.number
      button.querySelector('span').textContent =
        record.fields?.[0]?.value || 'Chưa nhập người giao/nhận'
      button.querySelector('small').textContent = record.status || 'Đã ghi'
      button.addEventListener('click', () => loadVoucher(record))
      list.append(button)
    })
}

document
  .querySelector('#saveVoucher')
  .addEventListener('click', () => saveVoucher())
document
  .querySelector('#postVoucher')
  .addEventListener('click', () => saveVoucher('Đã ghi sổ'))
document.querySelector('#searchBtn').addEventListener('click', () => {
  document.querySelector('#voucherSearchInput').value = ''
  renderVoucherSearch()
  voucherSearchDialog.showModal()
  document.querySelector('#voucherSearchInput').focus()
  if (documentType() === 'in') searchDatabaseReceipts('')
})
document
  .querySelector('#voucherSearchInput')
  .addEventListener('input', event => {
    if (documentType() === 'in') searchDatabaseReceipts(event.target.value.trim())
    else renderVoucherSearch()
  })
document
  .querySelector('#closeVoucherSearch')
  .addEventListener('click', () => voucherSearchDialog.close())
document.querySelector('#deleteVoucher').addEventListener('click', () => {
  const records = readVouchers()
  const index = records.findIndex(
    item =>
      item.id === currentSavedId ||
      (item.type === documentType() && item.number === documentNumber())
  )
  if (index < 0) {
    notify('Phiếu hiện tại chưa được lưu nên không có dữ liệu để xóa.')
    return
  }
  if (!window.confirm(`Xóa chứng từ ${records[index].number}?`)) return
  records.splice(index, 1)
  if (writeVouchers(records)) {
    currentSavedId = null
    createVoucher(false)
    notify('Đã xóa chứng từ.')
  }
})
document.querySelector('#createVoucher').addEventListener('click', () => {
  const inbound = readVouchers().filter(item => item.type === 'in')
  if (!inbound.length) {
    notify('Hãy ghi ít nhất một phiếu nhập kho trước khi tạo phiếu gộp.')
    return
  }
  changePage('in')
  createVoucher(false)
  const combinedRows = inbound
    .flatMap(record => record.rows || [])
    .filter(values => values.slice(2, 11).some(value => String(value).trim()))
  combinedRows.forEach((values, index) => {
    if (index) copyRow()
    const row = rows()[index]
    values.forEach((value, cellIndex) => {
      if (row.cells[cellIndex]) row.cells[cellIndex].textContent = value
    })
  })
  recalculate()
  notify(`Đã gộp ${inbound.length} phiếu nhập đã lưu vào phiếu mới.`)
})
document.querySelector('#exitBtn').addEventListener('click', () => {
  document.querySelector('.page').classList.add('hidden')
  document.querySelector('.tabs').classList.add('hidden')
  document.querySelector('#closedState').classList.remove('hidden')
})
document.querySelector('#reopenVoucher').addEventListener('click', () => {
  document.querySelector('.page').classList.remove('hidden')
  document.querySelector('.tabs').classList.remove('hidden')
  document.querySelector('#closedState').classList.add('hidden')
})
changePage('in')
document.querySelector('#helpLink').addEventListener('click', event => {
  event.preventDefault()
  notify('F5: copy dòng · F8: xóa dòng · F11: xóa tất cả.')
})
loadDeliveryPeople()

document.addEventListener('keydown', event => {
  if (event.key === 'F1') {
    event.preventDefault()
    document.querySelector('#helpLink').click()
  }
  if (event.key === 'F5') {
    event.preventDefault()
    copyRow()
  }
  if (event.key === 'F8') {
    event.preventDefault()
    deleteCurrentRow()
  }
  if (event.key === 'F11') {
    event.preventDefault()
    const first = rows()[0]
    tableBody.replaceChildren(first)
    first
      .querySelectorAll('[contenteditable="true"]')
      .forEach(cell => (cell.textContent = ''))
    first.querySelector('.amount').textContent = ''
    recalculate()
  }
  if (
    event.key === 'Enter' &&
    event.target.matches('[contenteditable="true"]')
  ) {
    event.preventDefault()
    const cells = [
      ...event.target
        .closest('tr')
        .querySelectorAll('[contenteditable="true"]'),
    ]
    const next = cells[cells.indexOf(event.target) + 1]
    if (next) next.focus()
    else copyRow()
  }
})
