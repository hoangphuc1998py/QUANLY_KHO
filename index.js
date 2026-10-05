const tableBody = document.querySelector('#itemsTable tbody')
const toast = document.querySelector('#toast')
let toastTimer
let currentUser = null
let isVoucherDirty = false
// The UI may be opened from a preview server or directly from the HTML file.
// In both cases, keep API requests pointed at the Express server.
const apiBaseUrl =
  window.location.port === '8080'
    ? ''
    : `${window.location.protocol}//${window.location.hostname || 'localhost'}:8080`

function apiUrl(path) {
  return `${apiBaseUrl}${path}`
}

function apiErrorMessage(error, fallback) {
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return 'Không kết nối được máy chủ kho. Hãy chạy lệnh npm start trong thư mục dự án rồi thử lại.'
  }
  return error.message || fallback
}

async function readApiJson(response, action) {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(
      `Máy chủ không trả JSON cho chức năng ${action} (HTTP ${response.status}). Máy chủ ở cổng 8080 đang chạy phiên bản cũ; hãy khởi động lại bằng npm start.`
    )
  }
  try {
    return await response.json()
  } catch {
    throw new Error(`Máy chủ trả dữ liệu không hợp lệ khi ${action}.`)
  }
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
  clone.querySelectorAll('select[data-linked-warehouse]').forEach(select => {
    select.value = ''
  })
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

function normalizeExcelHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

const excelColumnAliases = {
  itemCode: [
    'masp',
    'masanpham',
    'mahang',
    'mahanghoa',
    'mahangsp',
    'mavattu',
    'mavt',
    'mahangton',
    'itemcode',
    'productcode',
    'materialcode',
  ],
  itemName: [
    'tenhang',
    'tenhanghoa',
    'tensanpham',
    'tenvattu',
    'itemname',
    'productname',
  ],
  ecusItemCode: ['mahangecus', 'maecus', 'ecus', 'ecusitemcode', 'ecuscode'],
  warehouseCode: ['kho', 'makho', 'warehouse', 'warehousecode'],
  debitAccount: ['tkno', 'taikhoanno', 'debitaccount'],
  creditAccount: ['tkco', 'taikhoanco', 'creditaccount'],
  unit: ['donvitinh', 'dvt', 'unit'],
  quantity: ['soluong', 'sl', 'quantity', 'qty'],
  unitPrice: ['dongia', 'unitprice', 'price'],
  amount: ['thanhtien', 'thanhtienhang', 'amount', 'total'],
}

function findExcelColumn(header, field, aliases) {
  const exactIndex = header.findIndex(value => aliases.includes(value))
  if (exactIndex >= 0) return exactIndex
  return header.findIndex(value => {
    if (field === 'itemCode' && value.includes('ecus')) return false
    return aliases.some(alias => alias.length >= 4 && value.includes(alias))
  })
}

function importExcelRows(matrix) {
  const nonEmptyRows = matrix
    .map(row => (Array.isArray(row) ? row : []))
    .filter(row => row.some(value => String(value ?? '').trim() !== ''))
  if (!nonEmptyRows.length) throw new Error('File Excel không có dữ liệu.')

  let headerEndIndex = -1
  let columnIndexes = {}
  let bestHeaderScore = 1
  for (
    let rowIndex = 0;
    rowIndex < Math.min(nonEmptyRows.length, 20);
    rowIndex++
  ) {
    for (let rowSpan = 1; rowSpan <= 3; rowSpan++) {
      const headerRows = nonEmptyRows.slice(rowIndex, rowIndex + rowSpan)
      if (!headerRows.length) continue
      const width = Math.max(...headerRows.map(row => row.length))
      const normalized = Array.from({ length: width }, (_, columnIndex) =>
        normalizeExcelHeader(
          headerRows
            .map(row => row[columnIndex] ?? '')
            .filter(Boolean)
            .join(' ')
        )
      )
      const found = Object.fromEntries(
        Object.entries(excelColumnAliases).map(([field, aliases]) => [
          field,
          findExcelColumn(normalized, field, aliases),
        ])
      )
      const score = Object.values(found).filter(index => index >= 0).length
      if (found.itemCode >= 0 && score > bestHeaderScore) {
        bestHeaderScore = score
        headerEndIndex = rowIndex + rowSpan - 1
        columnIndexes = found
      }
    }
  }

  let imported
  if (headerEndIndex >= 0) {
    imported = nonEmptyRows
      .slice(headerEndIndex + 1)
      .map(source => {
        const get = field => {
          const index = columnIndexes[field]
          return index >= 0 ? String(source[index] ?? '').trim() : ''
        }
        return {
          itemCode: get('itemCode'),
          itemName: get('itemName'),
          ecusItemCode: get('ecusItemCode'),
          warehouseCode: get('warehouseCode'),
          debitAccount: get('debitAccount'),
          creditAccount: get('creditAccount'),
          unit: get('unit'),
          quantity: get('quantity'),
          unitPrice: get('unitPrice'),
        }
      })
      .filter(item => Object.values(item).some(value => value !== ''))
  } else {
    // Support headerless exports in the same order as the voucher grid,
    // optionally preceded by the STT column.
    const firstDataRow = nonEmptyRows.find(row =>
      row.some(value => String(value).trim())
    )
    const hasSerialNumber =
      firstDataRow?.length >= 11 && /^\d+$/.test(String(firstDataRow[0]).trim())
    const start = hasSerialNumber ? 1 : 0
    if (!firstDataRow || firstDataRow.length - start < 9)
      throw new Error(
        'Không nhận diện được cột Mã SP. File cần có tiêu đề hoặc theo thứ tự cột của danh sách hàng.'
      )
    imported = nonEmptyRows
      .map(source => ({
        itemCode: String(source[start] ?? '').trim(),
        itemName: String(source[start + 1] ?? '').trim(),
        ecusItemCode: String(source[start + 2] ?? '').trim(),
        warehouseCode: String(source[start + 3] ?? '').trim(),
        debitAccount: String(source[start + 4] ?? '').trim(),
        creditAccount: String(source[start + 5] ?? '').trim(),
        unit: String(source[start + 6] ?? '').trim(),
        quantity: String(source[start + 7] ?? '').trim(),
        unitPrice: String(source[start + 8] ?? '').trim(),
      }))
      .filter(item => Object.values(item).some(value => value !== ''))
  }

  if (!imported.length)
    throw new Error('Không tìm thấy dòng hàng dưới tiêu đề cột.')
  if (imported.some(item => !item.itemCode))
    throw new Error(
      'Có dòng hàng thiếu Mã SP/Mã hàng; chưa nạp dữ liệu để tránh lệch cột.'
    )

  const template = tableBody.querySelector('.item-row')
  const warehouseColumn = documentType() === 'out' ? 6 : 5
  const hasExistingItems = rows().some(row =>
    [...row.querySelectorAll('[contenteditable="true"]')].some(cell =>
      cell.textContent.trim()
    )
  )
  if (!hasExistingItems) tableBody.replaceChildren()
  for (const item of imported) {
    const row = template.cloneNode(true)
    const isIssue = documentType() === 'out'
    const warehouseColumn = isIssue ? 6 : 5
    const values = isIssue
      ? [
          '',
          '',
          item.itemCode,
          item.itemName,
          item.ecusItemCode,
          item.unit,
          item.warehouseCode,
          item.debitAccount,
          item.creditAccount,
          item.quantity,
          item.unitPrice,
          '',
        ]
      : [
          '',
          '',
          item.itemCode,
          item.itemName,
          item.ecusItemCode,
          item.warehouseCode,
          item.debitAccount,
          item.creditAccount,
          item.unit,
          item.quantity,
          item.unitPrice,
          '',
        ]
    values.forEach((value, index) => {
      if (row.cells[index])
        if (index === warehouseColumn) {
          configureLinkedWarehouseCell(
            row.cells[index],
            currentUser?.role === 'warehouse'
              ? currentUser.warehouseCode
              : value
          )
        } else {
          row.cells[index].textContent = value
        }
    })
    tableBody.append(row)
  }
  recalculate()
  return imported.length
}

document.querySelector('#importExcel').addEventListener('click', () => {
  document.querySelector('#excelFileInput').click()
})

document
  .querySelector('#excelFileInput')
  .addEventListener('change', async event => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      if (!window.XLSX)
        throw new Error('Không tải được bộ đọc Excel. Hãy tải lại trang.')
      const bytes = await file.arrayBuffer()
      const workbook = XLSX.read(bytes, { type: 'array', cellDates: false })
      if (!workbook.SheetNames.length)
        throw new Error('File không có trang tính.')
      let count = 0
      let lastSheetError
      for (const sheetName of workbook.SheetNames) {
        const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
          header: 1,
          defval: '',
          raw: false,
          blankrows: false,
        })
        try {
          count = importExcelRows(matrix)
          break
        } catch (error) {
          lastSheetError = error
        }
      }
      if (!count)
        throw lastSheetError || new Error('Không tìm thấy dữ liệu hàng.')
      notify(`Đã nạp ${count} dòng hàng từ ${file.name}.`)
    } catch (error) {
      notify(error.message || 'Không đọc được dữ liệu từ file Excel.')
    } finally {
      event.target.value = ''
    }
  })

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
    code: '',
    voucherAction: '⟳ Tạo phiếu nhập kho gộp...',
    voucherType: ['Thành phẩm sản xuất', 'Nhập mua hàng', 'Nhập khác'],
    goodsType: ['Nguyên liệu', 'Thành phẩm', 'Sản phẩm', 'Công cụ dụng cụ'],
    headers: [
      '▧',
      'STT',
      'Mã SP',
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
    code: '',
    voucherAction: '⟳ Tạo phiếu xuất kho gộp...',
    voucherType: ['Sản xuất', 'Xuất bán', 'Xuất khác'],
    goodsType: ['Sản phẩm', 'Nguyên liệu', 'Công cụ dụng cụ'],
    headers: [
      '▧',
      'STT',
      'Mã SP',
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
    applyWarehouseRestrictions()
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
  isVoucherDirty = false
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
  applyWarehouseRestrictions()
  loadNextVoucherNumber(page)
}

document
  .querySelectorAll('.page-choice')
  .forEach(button =>
    button.addEventListener('click', () => changePage(button.dataset.page))
  )

let warehouseSites = []
const warehouseNames = Object.fromEntries([
  ['KHO TONG CONG TY', 'KHO TONG CONG TY'],
  ...['HUNG', 'THINH', 'PHU', 'PHAT', 'VESTON'].map(name => [
    `KHO AN ${name}`,
    `KHO XI NGHIEP AN ${name}`,
  ]),
])

function linkedStoresFor(siteCode) {
  return (
    warehouseSites.find(
      site =>
        site.siteCode.toLocaleUpperCase('vi') ===
        siteCode.toLocaleUpperCase('vi')
    )?.linkedStores || []
  )
}

function configureLinkedWarehouseCell(cell, selectedValue = '') {
  const siteCode = document.querySelector('#warehousePicker').value
  const stores = linkedStoresFor(siteCode)
  const display = document.createElement('span')
  display.className = 'linked-warehouse-label'
  display.textContent = selectedValue || 'Chọn kho'
  const select = document.createElement('select')
  select.dataset.linkedWarehouse = 'true'
  select.classList.add('linked-warehouse-select')
  select.setAttribute('aria-label', 'Chọn kho liên kết')
  select.append(new Option('Chọn kho', ''))
  stores.forEach(store => select.append(new Option(store, store)))
  if (selectedValue && !stores.includes(selectedValue))
    select.append(new Option(selectedValue, selectedValue))
  select.value = selectedValue
  select.addEventListener('change', () => {
    display.textContent = select.value || 'Chọn kho'
  })
  cell.replaceChildren(display, select)
}

function refreshLinkedWarehouseCells(resetInvalid = false) {
  const stores = linkedStoresFor(
    document.querySelector('#warehousePicker').value
  )
  const warehouseColumn =
    document.querySelector('.page').dataset.documentType === 'out' ? 6 : 5
  rows().forEach(row => {
    const cell = row.cells[warehouseColumn]
    if (!cell || cell.getAttribute('aria-readonly') === 'true') return
    const previousValue =
      cell.querySelector('select')?.value || cell.textContent.trim()
    configureLinkedWarehouseCell(
      cell,
      resetInvalid && !stores.includes(previousValue) ? '' : previousValue
    )
  })
}

async function loadWarehouseSites() {
  try {
    const response = await fetch(apiUrl('/api/warehouse-sites'))
    const result = await readApiJson(response, 'tải danh mục kho')
    if (!response.ok || !result.success)
      throw new Error(result.error || 'Không thể tải danh mục kho.')
    warehouseSites = result.data
    const picker = document.querySelector('#warehousePicker')
    const selected = picker.value
    picker.replaceChildren(new Option('Chọn kho', ''))
    warehouseSites.forEach(site =>
      picker.append(new Option(site.siteCode, site.siteCode))
    )
    picker.value = selected
    refreshLinkedWarehouseCells()
  } catch (error) {
    notify(apiErrorMessage(error, 'Không thể tải danh mục kho.'))
  }
}

document.querySelector('#warehousePicker').addEventListener('change', event => {
  const code = event.target.value
  document.querySelector('#warehouseName').value =
    warehouseNames[code] || (code ? code : '')
  refreshLinkedWarehouseCells(true)
})
tableBody.addEventListener('change', event => {
  const select = event.target.closest('select[data-linked-warehouse]')
  if (!select) return
  isVoucherDirty = true
})
loadWarehouseSites()
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

function reportNumber(value) {
  const number = Number(value) || 0
  return number.toLocaleString('vi-VN', { maximumFractionDigits: 2 })
}

function reportDate(value) {
  if (!value) return ''
  const [year, month, day] = String(value).slice(0, 10).split('-')
  return year && month && day ? `${day}/${month}/${year}` : String(value)
}

function balanceText(value) {
  return value < 0 ? `(${reportNumber(Math.abs(value))})` : reportNumber(value)
}

function addReportRow(tbody, values, className = '') {
  const row = document.createElement('tr')
  if (className) row.className = className
  for (const entry of values) {
    const cell = document.createElement('td')
    if (entry && typeof entry === 'object') {
      cell.colSpan = entry.colSpan || 1
      cell.textContent = String(entry.value ?? '')
    } else {
      cell.textContent = String(entry ?? '')
    }
    row.append(cell)
  }
  tbody.append(row)
}

function renderInventoryReport(movements, fromDate, contractFilter) {
  const products = new Map()
  for (const movement of movements) {
    const itemCode = String(movement.itemCode || '').trim()
    if (!itemCode) continue
    if (!products.has(itemCode)) {
      products.set(itemCode, {
        itemCode,
        itemName: movement.itemName || '',
        unit: movement.unit || '',
        openingQty: 0,
        openingAmount: 0,
        receiptQty: 0,
        receiptAmount: 0,
        issueQty: 0,
        issueAmount: 0,
        periodMovements: [],
      })
    }
    const product = products.get(itemCode)
    if (!product.itemName && movement.itemName)
      product.itemName = movement.itemName
    if (!product.unit && movement.unit) product.unit = movement.unit
    const quantity = Number(movement.quantity) || 0
    const amount = Number(movement.amount) || 0
    const isOpening = fromDate && movement.movementDate < fromDate
    if (isOpening) {
      const direction = movement.movementType === 'in' ? 1 : -1
      product.openingQty += direction * quantity
      product.openingAmount += direction * amount
    } else {
      product.periodMovements.push(movement)
      if (movement.movementType === 'in') {
        product.receiptQty += quantity
        product.receiptAmount += amount
      } else {
        product.issueQty += quantity
        product.issueAmount += amount
      }
    }
  }

  const productRows = [...products.values()].sort((left, right) =>
    left.itemCode.localeCompare(right.itemCode, 'vi', { numeric: true })
  )
  const summaryBody = document.querySelector(
    '#reportResults .inventory-table .inventory-ledger tbody'
  )
  const detailBody = document.querySelector(
    '#reportResults .paper-table-wrap:not(.inventory-table) .stock-ledger tbody'
  )
  summaryBody.replaceChildren()
  detailBody.replaceChildren()

  if (!productRows.length) {
    addReportRow(summaryBody, [
      { value: 'Không có dữ liệu phù hợp với điều kiện lọc.', colSpan: 16 },
    ])
    addReportRow(detailBody, [
      { value: 'Không có dữ liệu phù hợp với điều kiện lọc.', colSpan: 10 },
    ])
    return
  }

  const totals = {
    openingQty: 0,
    openingAmount: 0,
    receiptQty: 0,
    receiptAmount: 0,
    issueQty: 0,
    issueAmount: 0,
    endingQty: 0,
    endingAmount: 0,
  }
  let lineNumber = 1
  addReportRow(
    detailBody,
    [
      {
        value: `Số hợp đồng: ${contractFilter || 'Tất cả hợp đồng'}`,
        colSpan: 10,
      },
    ],
    'contract-row'
  )

  productRows.forEach((product, index) => {
    const endingQty = product.openingQty + product.receiptQty - product.issueQty
    const endingAmount =
      product.openingAmount + product.receiptAmount - product.issueAmount
    totals.openingQty += product.openingQty
    totals.openingAmount += product.openingAmount
    totals.receiptQty += product.receiptQty
    totals.receiptAmount += product.receiptAmount
    totals.issueQty += product.issueQty
    totals.issueAmount += product.issueAmount
    totals.endingQty += endingQty
    totals.endingAmount += endingAmount

    addReportRow(summaryBody, [
      index + 1,
      product.itemCode,
      product.itemName,
      product.unit,
      reportNumber(product.openingQty),
      reportNumber(
        product.openingQty ? product.openingAmount / product.openingQty : 0
      ),
      reportNumber(product.openingAmount),
      reportNumber(product.receiptQty),
      reportNumber(
        product.receiptQty ? product.receiptAmount / product.receiptQty : 0
      ),
      reportNumber(product.receiptAmount),
      reportNumber(product.issueQty),
      reportNumber(
        product.issueQty ? product.issueAmount / product.issueQty : 0
      ),
      reportNumber(product.issueAmount),
      reportNumber(endingQty),
      reportNumber(endingQty ? endingAmount / endingQty : 0),
      reportNumber(endingAmount),
    ])

    addReportRow(
      detailBody,
      [
        {
          value: `Mã SP: ${product.itemCode}　Tên hàng: ${product.itemName}`,
          colSpan: 10,
        },
      ],
      'product-row'
    )
    addReportRow(
      detailBody,
      [
        lineNumber++,
        '',
        '',
        '',
        '(Số tồn đầu kỳ)',
        '',
        '',
        '',
        balanceText(product.openingQty),
        '',
      ],
      'opening-row'
    )
    let runningBalance = product.openingQty
    for (const movement of product.periodMovements) {
      const isReceipt = movement.movementType === 'in'
      const quantity = Number(movement.quantity) || 0
      runningBalance += isReceipt ? quantity : -quantity
      addReportRow(detailBody, [
        lineNumber++,
        reportDate(movement.movementDate),
        isReceipt ? movement.voucherNo : '',
        isReceipt ? '' : movement.voucherNo,
        movement.description || '',
        reportDate(movement.movementDate),
        isReceipt ? reportNumber(quantity) : '',
        isReceipt ? '' : reportNumber(quantity),
        balanceText(runningBalance),
        '',
      ])
    }
    addReportRow(
      detailBody,
      [
        { value: 'Cộng cuối kỳ', colSpan: 6 },
        reportNumber(product.receiptQty),
        reportNumber(product.issueQty),
        balanceText(endingQty),
        '',
      ],
      'subtotal-row'
    )
  })

  addReportRow(
    summaryBody,
    [
      { value: 'Cộng', colSpan: 4 },
      reportNumber(totals.openingQty),
      '',
      reportNumber(totals.openingAmount),
      reportNumber(totals.receiptQty),
      '',
      reportNumber(totals.receiptAmount),
      reportNumber(totals.issueQty),
      '',
      reportNumber(totals.issueAmount),
      reportNumber(totals.endingQty),
      '',
      reportNumber(totals.endingAmount),
    ],
    'subtotal-row'
  )
}

async function showInventoryReport(detail = false) {
  const form = new FormData(document.querySelector('#stockReportForm'))
  const from = form.get('fromDate')
  const to = form.get('toDate')
  if (from && to && from > to) {
    notify('Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.')
    return false
  }
  const category = form.get('goodsCategory')
  const warehouse =
    currentUser?.role === 'warehouse'
      ? currentUser.warehouseCode
      : form.get('warehouse')
  const contract = form.get('contract')
  const item = form.get('item')?.trim() || ''
  const productCode = form.get('productCode')?.trim() || ''
  const query = new URLSearchParams({
    fromDate: from || '',
    toDate: to || '',
    warehouse: warehouse || '',
    productCode,
    contract: contract || '',
    item,
    category: category || '',
  })
  const actionButton = document.querySelector(
    detail ? '#detailReportBtn' : '#stockReportForm button[type="submit"]'
  )
  const buttonText = actionButton.textContent
  actionButton.disabled = true
  actionButton.textContent = 'Đang tải dữ liệu...'
  try {
    const response = await fetch(apiUrl(`/api/inventory-report?${query}`))
    const result = await readApiJson(response, 'tải báo cáo nhập xuất tồn')
    if (!response.ok || !result.success)
      throw new Error(result.error || 'Không tải được dữ liệu báo cáo.')
    renderInventoryReport(result.data.movements || [], from, contract)
  } catch (error) {
    notify(apiErrorMessage(error, 'Không tải được dữ liệu báo cáo.'))
    return false
  } finally {
    actionButton.disabled = false
    actionButton.textContent = buttonText
  }
  const displayDate = value =>
    value ? new Date(`${value}T00:00:00`).toLocaleDateString('vi-VN') : ''
  document.querySelector('#paperFrom').textContent = displayDate(from)
  document.querySelector('#paperTo').textContent = displayDate(to)
  document.querySelector('#paperWarehouseName').textContent =
    warehouseNames[warehouse] || warehouse
  document.querySelector('#paperWarehouseCode').textContent = warehouse
  document.querySelector('#paperContract').textContent = contract
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
  return (
    row.cells[index]?.querySelector('select')?.value ||
    row.cells[index]?.textContent.trim() ||
    ''
  )
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

function collectIssueItems() {
  return rows()
    .map(row => ({
      itemCode: cellValue(row, 2),
      itemName: cellValue(row, 3),
      ecusItemCode: cellValue(row, 4),
      warehouseCode: cellValue(row, 6),
      unit: cellValue(row, 5),
      debitAccount: cellValue(row, 7),
      creditAccount: cellValue(row, 8),
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
    items:
      documentType() === 'out' ? collectIssueItems() : collectReceiptItems(),
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
  if (
    !payload.items.length ||
    payload.items.some(item => !item.itemCode.trim())
  ) {
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
    isVoucherDirty = false
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
document.querySelector('.page').addEventListener('input', () => {
  isVoucherDirty = true
})
document.querySelector('.page').addEventListener('change', () => {
  isVoucherDirty = true
})
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
  if (documentType() === 'out') {
    saveIssue()
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

async function loadNextVoucherNumber(type = documentType()) {
  try {
    const response = await fetch(
      apiUrl(
        `/api/inventory-vouchers/next-number?type=${encodeURIComponent(type)}`
      )
    )
    const result = await readApiJson(response, 'lấy số chứng từ tiếp theo')
    if (!response.ok || !result.success)
      throw new Error(result.error || 'Không thể lấy số chứng từ tiếp theo.')
    if (documentType() === type && !currentSavedId && !isVoucherDirty)
      document.querySelector('.voucher').value = result.data.voucherNo
    return result.data.voucherNo
  } catch (error) {
    notify(apiErrorMessage(error, 'Không thể lấy số chứng từ tiếp theo.'))
    return null
  }
}

async function createVoucher(copyCurrent) {
  const type = documentType()
  const copiedRecord = copyCurrent ? captureVoucher('Nháp') : null
  const request = await fetch(
    apiUrl(
      `/api/inventory-vouchers/next-number?type=${encodeURIComponent(type)}`
    )
  )
    .then(response =>
      readApiJson(response, 'lấy số chứng từ tiếp theo').then(result => {
        if (!response.ok || !result.success)
          throw new Error(
            result.error || 'Không thể lấy số chứng từ tiếp theo.'
          )
        return result.data.voucherNo
      })
    )
    .catch(error => {
      notify(apiErrorMessage(error, 'Không thể lấy số chứng từ tiếp theo.'))
      return null
    })
  if (!request) return
  const newNumber = request
  const controls = fieldControls()
  controls.forEach(control => {
    if (control.type === 'checkbox') control.checked = false
    else control.value = ''
  })
  document.querySelector('#senderPicker').value = ''
  document.querySelector('#warehousePicker').value =
    currentUser?.role === 'warehouse' ? currentUser.warehouseCode : ''
  document.querySelector('#warehouseName').value =
    currentUser?.role === 'warehouse'
      ? warehouseNames[currentUser.warehouseCode] || currentUser.warehouseCode
      : ''
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
  isVoucherDirty = false
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
      if (index === warehouseColumn) configureLinkedWarehouseCell(cell, value)
      else {
        cell.textContent = value
      }
      if (
        index >= 2 &&
        index <= 10 &&
        index !== 11 &&
        index !== warehouseColumn
      )
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
  document.querySelector('#isSelfSupplied').checked = Boolean(
    record.isSelfSupplied
  )
  const template = document.querySelector('#itemsTable tbody .item-row')
  tableBody.replaceChildren()
  for (const item of record.items || []) {
    const row = template.cloneNode(true)
    const warehouseColumn = 5
    const values = [
      '',
      '',
      item.itemCode,
      item.itemName,
      item.ecusItemCode,
      item.warehouseCode,
      item.debitAccount,
      item.creditAccount,
      item.unit,
      String(item.quantity ?? ''),
      String(item.unitPrice ?? ''),
      '',
    ]
    values.forEach((value, index) => {
      if (index === warehouseColumn)
        configureLinkedWarehouseCell(row.cells[index], value)
      else row.cells[index].textContent = value
    })
    tableBody.append(row)
  }
  if (!tableBody.children.length) tableBody.append(template)
  currentSavedId = `in:${record.voucherNo}`
  isVoucherDirty = false
  voucherStatus.textContent = record.status || 'Đã ghi'
  voucherSearchDialog.close()
  recalculate()
  notify(`Đã mở chứng từ ${record.voucherNo}.`)
}

async function searchDatabaseReceipts(query) {
  const list = document.querySelector('#voucherSearchResults')
  try {
    const response = await fetch(
      apiUrl(`/api/inventory-receipts?q=${encodeURIComponent(query)}`)
    )
    const result = await readApiJson(response, 'tìm phiếu nhập kho')
    if (!response.ok || !result.success)
      throw new Error(result.error || 'Không thể tìm chứng từ.')
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
      button.querySelector('span').textContent =
        record.delivererName || 'Nhà cung cấp'
      button.querySelector('small').textContent = record.status || 'Đã ghi'
      button.addEventListener('click', () => loadReceiptVoucher(record))
      list.append(button)
    })
  } catch (error) {
    list.textContent = apiErrorMessage(
      error,
      'Không thể tìm chứng từ trong cơ sở dữ liệu.'
    )
    list.className = 'voucher-search-results empty'
  }
}

async function saveIssue() {
  const payload = receiptPayload()
  payload.receiverName = document.querySelector('#senderName').value
  payload.supplierAddress = document.querySelector('#senderAddress').value
  if (!payload.voucherNo.trim() || !payload.voucherDate) {
    notify('Vui lòng nhập số và ngày chứng từ.')
    return
  }
  if (
    !payload.items.length ||
    payload.items.some(item => !item.itemCode.trim())
  ) {
    notify('Vui lòng nhập ít nhất một dòng hàng và mã hàng.')
    return
  }
  const button = document.querySelector('#saveVoucher')
  button.disabled = true
  button.textContent = 'Đang ghi...'
  try {
    const response = await fetch(apiUrl('/api/inventory-issues'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const result = await response.json().catch(() => {
      throw new Error(
        'Máy chủ dữ liệu chưa hỗ trợ lưu phiếu xuất. Hãy khởi động lại máy chủ bằng lệnh npm start rồi tải lại trang.'
      )
    })
    if (!response.ok || !result.success)
      throw new Error(result.error || 'Không thể lưu phiếu xuất kho.')
    currentSavedId = `out:${result.data.voucherNo}`
    isVoucherDirty = false
    voucherStatus.textContent = 'Đã ghi'
    notify(`Đã ghi phiếu xuất ${result.data.voucherNo} vào cơ sở dữ liệu.`)
  } catch (error) {
    notify(apiErrorMessage(error, 'Không thể lưu phiếu xuất kho.'))
  } finally {
    button.disabled = false
    button.textContent = '▣ Ghi'
  }
}

async function searchDatabaseIssues(query) {
  const list = document.querySelector('#voucherSearchResults')
  try {
    const response = await fetch(
      apiUrl(`/api/inventory-issues?q=${encodeURIComponent(query)}`)
    )
    const result = await readApiJson(response, 'tìm phiếu xuất kho')
    if (!response.ok || !result.success)
      throw new Error(result.error || 'Không thể tìm phiếu xuất.')
    list.replaceChildren()
    if (!result.data?.length) {
      list.textContent = 'Không tìm thấy phiếu xuất trong cơ sở dữ liệu.'
      list.className = 'voucher-search-results empty'
      return
    }
    list.className = 'voucher-search-results'
    result.data.forEach(record => {
      const button = document.createElement('button')
      button.type = 'button'
      button.innerHTML = '<strong></strong><span></span><small></small>'
      button.querySelector('strong').textContent = record.voucherNo
      button.querySelector('span').textContent =
        record.receiverName || 'Người nhận hàng'
      button.querySelector('small').textContent = record.status || 'Đã ghi'
      button.addEventListener('click', () => loadIssueVoucher(record))
      list.append(button)
    })
  } catch (error) {
    list.textContent = apiErrorMessage(
      error,
      'Không thể tìm phiếu xuất trong cơ sở dữ liệu.'
    )
    list.className = 'voucher-search-results empty'
  }
}

function loadIssueVoucher(record) {
  const set = (id, value) => {
    const control = document.getElementById(id)
    if (control) control.value = value ?? ''
  }
  set('senderName', record.receiverName)
  set('senderAddress', record.address)
  set('transporterName', record.transporterName)
  set('receiptDescription', record.description)
  set('warehousePicker', record.warehouseCode)
  set('warehouseName', record.warehouseCode)
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
  document.querySelector('#isSelfSupplied').checked = Boolean(
    record.isSelfSupplied
  )
  const template = document.querySelector('#itemsTable tbody .item-row')
  tableBody.replaceChildren()
  ;(record.items || []).forEach(item => {
    const row = template.cloneNode(true)
    const warehouseColumn = 6
    const values = [
      '',
      '',
      item.itemCode,
      item.itemName,
      item.ecusItemCode,
      item.warehouseCode,
      item.debitAccount,
      item.creditAccount,
      item.unit,
      String(item.quantity ?? ''),
      String(item.unitPrice ?? ''),
      '',
    ]
    values.forEach((value, index) => {
      if (index === warehouseColumn)
        configureLinkedWarehouseCell(row.cells[index], value)
      else row.cells[index].textContent = value
    })
    tableBody.append(row)
  })
  if (!tableBody.children.length) tableBody.append(template)
  currentSavedId = `out:${record.voucherNo}`
  isVoucherDirty = false
  voucherStatus.textContent = record.status || 'Đã ghi'
  voucherSearchDialog.close()
  recalculate()
  notify(`Đã mở phiếu xuất ${record.voucherNo}.`)
}

function renderVoucherSearch() {
  const query = document
    .querySelector('#voucherSearchInput')
    .value.trim()
    .toLocaleLowerCase('vi')
  const list = document.querySelector('#voucherSearchResults')
  const records = (
    currentUser?.role === 'warehouse' ? [] : readVouchers()
  ).filter(
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
document.querySelector('#searchBtn').addEventListener('click', () => {
  document.querySelector('#voucherSearchInput').value = ''
  voucherSearchDialog.showModal()
  document.querySelector('#voucherSearchInput').focus()
  if (documentType() === 'in' || documentType() === 'out') {
    const list = document.querySelector('#voucherSearchResults')
    list.replaceChildren()
    list.textContent = 'Đang tải chứng từ từ cơ sở dữ liệu...'
    list.className = 'voucher-search-results empty'
    if (documentType() === 'in') searchDatabaseReceipts('')
    else searchDatabaseIssues('')
  } else {
    renderVoucherSearch()
  }
})
document
  .querySelector('#voucherSearchInput')
  .addEventListener('input', event => {
    if (documentType() === 'in')
      searchDatabaseReceipts(event.target.value.trim())
    else if (documentType() === 'out')
      searchDatabaseIssues(event.target.value.trim())
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
async function createSplitVouchers() {
  const button = document.querySelector('#createVoucher')
  const type = documentType()
  const payload = receiptPayload()
  const items = payload.items
  if (!items.length) {
    notify('Chưa có dòng hàng để tách phiếu.')
    return
  }
  if (items.some(item => !item.itemCode.trim())) {
    notify('Mỗi dòng hàng cần có Mã SP trước khi tách phiếu.')
    return
  }
  if (!payload.voucherDate) {
    notify('Vui lòng nhập ngày chứng từ trước khi tách phiếu.')
    return
  }
  if (type === 'out') {
    payload.receiverName = document.querySelector('#senderName').value
    payload.supplierAddress = document.querySelector('#senderAddress').value
  }
  button.disabled = true
  const originalText = button.textContent
  button.textContent = 'Đang tách và lưu...'
  try {
    const response = await fetch(apiUrl('/api/inventory-vouchers/split'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        currentVoucherNo: payload.voucherNo,
        voucher: payload,
      }),
    })
    const result = await readApiJson(response, 'tạo phiếu riêng theo Mã SP')
    if (!response.ok || !result.success)
      throw new Error(result.error || 'Không thể tạo các phiếu riêng.')
    const voucherNumbers = result.data.map(item => item.voucherNo)
    notify(
      `Đã lưu ${voucherNumbers.length} phiếu riêng vào database: ${voucherNumbers.join(', ')}.`
    )
  } catch (error) {
    notify(apiErrorMessage(error, 'Không thể tách phiếu theo Mã SP.'))
  } finally {
    button.disabled = false
    button.textContent = originalText
  }
}

document
  .querySelector('#createVoucher')
  .addEventListener('click', createSplitVouchers)
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
const createWarehouseUserDialog = document.querySelector(
  '#createWarehouseUserDialog'
)
document.querySelector('#userManagementBtn').addEventListener('click', () => {
  document.querySelector('#createWarehouseUserForm').reset()
  document.querySelector('#createUserMessage').textContent = ''
  createWarehouseUserDialog.showModal()
})
document
  .querySelector('#closeCreateUserDialog')
  .addEventListener('click', () => createWarehouseUserDialog.close())
document
  .querySelector('#cancelCreateUser')
  .addEventListener('click', () => createWarehouseUserDialog.close())
document
  .querySelector('#createWarehouseUserForm')
  .addEventListener('submit', async event => {
    event.preventDefault()
    const message = document.querySelector('#createUserMessage')
    const saveButton = document.querySelector('#saveNewUser')
    saveButton.disabled = true
    message.textContent = ''
    try {
      const response = await fetch(apiUrl('/api/admin/users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: document.querySelector('#newUsername').value.trim(),
          password: document.querySelector('#newUserPassword').value,
          warehouseCode: document.querySelector('#newUserWarehouse').value,
        }),
      })
      const result = await readApiJson(response, 'tạo tài khoản kho')
      if (!response.ok || !result.success)
        throw new Error(result.error || 'Không thể tạo tài khoản kho.')
      createWarehouseUserDialog.close()
      notify(
        `Đã tạo user ${result.data.username} cho ${result.data.warehouseCode}.`
      )
    } catch (error) {
      message.textContent = apiErrorMessage(
        error,
        'Không thể tạo tài khoản kho.'
      )
    } finally {
      saveButton.disabled = false
    }
  })
async function initializeUserAccess() {
  try {
    const response = await fetch(apiUrl('/api/auth/me'))
    const result = await readApiJson(response, 'xác thực tài khoản')
    if (!response.ok || !result.success)
      throw new Error(result.error || 'Phiên đăng nhập đã hết hạn.')
    currentUser = result.data
    const userLabel = document.querySelector('#currentUserLabel')
    userLabel.textContent = `Tài khoản: ${currentUser.username}`
    userLabel.hidden = false
    if (currentUser.role === 'admin') {
      document.querySelector('#userManagementBtn').hidden = false
      return
    }

    document.querySelector('#userManagementBtn').hidden = true
    document.querySelector('#deleteVoucher').hidden = true
    const warehousePicker = document.querySelector('#warehousePicker')
    warehousePicker.disabled = true
    document
      .querySelectorAll('#stockReportForm select[name="warehouse"]')
      .forEach(select => {
        select.value = currentUser.warehouseCode
        select.disabled = true
      })
    applyWarehouseRestrictions()
  } catch {
    window.location.replace('/admin')
  }
}

function applyWarehouseRestrictions() {
  if (currentUser?.role !== 'warehouse') return
  const warehouseCode = currentUser.warehouseCode
  const picker = document.querySelector('#warehousePicker')
  const knownSite = warehouseSites.find(
    site =>
      site.siteCode.toLocaleUpperCase('vi') ===
      warehouseCode.toLocaleUpperCase('vi')
  )
  if (!knownSite) return
  picker.value = warehouseCode
  picker.disabled = true
  document.querySelector('#warehouseName').value =
    warehouseNames[warehouseCode] || warehouseCode
  refreshLinkedWarehouseCells()
  const warehouseColumn =
    document.querySelector('.page').dataset.documentType === 'out' ? 6 : 5
  const previousWarehouseColumn = warehouseColumn === 6 ? 5 : 6
  const linkedStores = linkedStoresFor(warehouseCode)
  rows().forEach(row => {
    const previousCell = row.children[previousWarehouseColumn]
    if (previousCell?.getAttribute('aria-readonly') === 'true') {
      previousCell.textContent = ''
      previousCell.removeAttribute('aria-readonly')
      previousCell.setAttribute('contenteditable', 'true')
    }
    const cell = row.children[warehouseColumn]
    if (!cell) return
    const currentStore =
      cell.querySelector('select')?.value || cell.textContent.trim()
    configureLinkedWarehouseCell(
      cell,
      linkedStores.includes(currentStore) ? currentStore : linkedStores[0] || ''
    )
    const linkedStorePicker = cell.querySelector('select')
    if (linkedStorePicker) linkedStorePicker.disabled = true
    cell.setAttribute('aria-readonly', 'true')
  })
  document
    .querySelectorAll('#stockReportForm select[name="warehouse"]')
    .forEach(select => {
      select.value = warehouseCode
      select.disabled = true
    })
}
initializeUserAccess()
const changePasswordDialog = document.querySelector('#changePasswordDialog')
document.querySelector('#changePasswordBtn').addEventListener('click', () => {
  document.querySelector('#passwordMessage').textContent = ''
  changePasswordDialog.showModal()
})
document
  .querySelector('#closePasswordDialog')
  .addEventListener('click', () => changePasswordDialog.close())
document
  .querySelector('#cancelPasswordChange')
  .addEventListener('click', () => changePasswordDialog.close())
document
  .querySelector('#changePasswordForm')
  .addEventListener('submit', async event => {
    event.preventDefault()
    const message = document.querySelector('#passwordMessage')
    const newPassword = document.querySelector('#newPassword').value
    if (newPassword !== document.querySelector('#confirmPassword').value) {
      message.textContent = 'Hai mật khẩu mới chưa khớp.'
      return
    }
    const saveButton = document.querySelector('#savePasswordChange')
    saveButton.disabled = true
    message.textContent = ''
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: document.querySelector('#currentPassword').value,
          newPassword,
        }),
      })
      const result = await readApiJson(response, 'đổi mật khẩu')
      if (!response.ok || !result.success)
        throw new Error(result.error || 'Không thể đổi mật khẩu.')
      document.querySelector('#changePasswordForm').reset()
      changePasswordDialog.close()
      notify('Đã đổi mật khẩu và lưu vào database.')
    } catch (error) {
      message.textContent = apiErrorMessage(error, 'Không thể đổi mật khẩu.')
    } finally {
      saveButton.disabled = false
    }
  })
document.querySelector('#logoutBtn').addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST' })
  } finally {
    window.location.replace('/admin')
  }
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
  if (event.key === 'F6') {
    event.preventDefault()
    document.querySelector('#excelFileInput').click()
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
    event.target.matches('select[data-linked-warehouse]')
  ) {
    event.preventDefault()
    const editable = [
      ...event.target
        .closest('tr')
        .querySelectorAll('[contenteditable="true"]'),
    ]
    editable[0]?.focus()
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
