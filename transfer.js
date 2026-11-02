const form = document.querySelector('#transferForm')
const rowsHost = document.querySelector('#transferItems')
const message = document.querySelector('#transferMessage')
const warehouseChoices = ['Nguyên liệu', 'Phụ liệu', 'Thành phẩm', 'Hàng mẫu', 'Công cụ dụng cụ']
let transfers = []
let databaseItems = []
let currentUser = null
const selectedDatabaseItems = new Map()
let searchTimer
let availableWarehouses = []
let itemSearchTimer
let helpToastTimer

const clockTime = document.querySelector('#transferClock .live-clock-time')
const clockDate = document.querySelector('#transferClock .live-clock-date')
const clockTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})
const clockDateFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
})
function updateClock() {
  const now = new Date()
  clockTime.textContent = clockTimeFormatter.format(now)
  clockDate.textContent = clockDateFormatter.format(now)
  document.querySelector('#transferClock').dateTime = now.toISOString()
}
updateClock()
window.setInterval(updateClock, 1000)

function showHelp() {
  const toast = document.querySelector('#transferToast')
  toast.textContent = 'Chọn kho chuyển đi và kho nhận, thêm mặt hàng, nhập số lượng rồi bấm “Ghi phiếu điều chuyển”.'
  toast.classList.add('show')
  clearTimeout(helpToastTimer)
  helpToastTimer = setTimeout(() => toast.classList.remove('show'), 4500)
}

document.querySelector('#transferHelpLink').addEventListener('click', event => {
  event.preventDefault()
  showHelp()
})
document.addEventListener('keydown', event => {
  if (event.key === 'F1') {
    event.preventDefault()
    showHelp()
  }
})

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  })
  const type = response.headers.get('content-type') || ''
  if (!type.includes('application/json')) {
    if (response.status === 401) window.location.replace('/admin')
    throw new Error('Máy chủ không trả dữ liệu hợp lệ. Hãy tải lại trang hoặc khởi động lại máy chủ.')
  }
  const result = await response.json()
  if (!response.ok || !result.success) throw new Error(result.error || 'Không thể hoàn tất yêu cầu.')
  return result.data
}

function localIsoDate() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addItemRow(item = {}) {
  const tr = document.createElement('tr')
  const number = document.createElement('td')
  number.className = 'line-number'
  tr.append(number)
  const fields = [
    ['itemCode', 'Mã hàng', 'text', 'code-input', true],
    ['itemName', 'Tên hàng', 'text', 'name-input'],
    ['itemType', 'Loại hàng', 'select', 'type-input', true],
    ['color', 'Màu', 'text', 'color-input'],
    ['unit', 'ĐVT', 'text', 'unit-input'],
    ['quantity', 'Số lượng', 'number', 'qty-input', true],
    ['unitPrice', 'Đơn giá', 'number', 'price-input', true],
  ]
  for (const [name, label, type, className, required] of fields) {
    const cell = document.createElement('td')
    let control
    if (type === 'select') {
      control = document.createElement('select')
      control.className = className
      control.setAttribute('aria-label', label)
      control.add(new Option('Chọn loại', ''))
      warehouseChoices.forEach(option => control.add(new Option(option, option)))
      control.value = item[name] || ''
    } else {
      control = document.createElement('input')
      control.type = type
      control.className = className
      control.name = name
      control.setAttribute('aria-label', label)
      control.placeholder = label
      if (type === 'number') {
        control.min = name === 'quantity' ? '0.000001' : '0'
        control.step = 'any'
        control.value = item[name] ?? ''
      } else control.value = item[name] || ''
    }
    if (required) control.required = true
    control.dataset.field = name
    cell.append(control)
    tr.append(cell)
  }
  const amount = document.createElement('td')
  amount.className = 'line-amount'
  amount.textContent = '0'
  tr.append(amount)
  const deleteCell = document.createElement('td')
  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'row-delete'
  remove.textContent = '×'
  remove.title = 'Xóa dòng'
  remove.setAttribute('aria-label', 'Xóa dòng hàng')
  remove.addEventListener('click', () => {
    if (rowsHost.children.length === 1) {
      tr.querySelectorAll('input').forEach(input => { input.value = input.name === 'unitPrice' ? '0' : '' })
      tr.querySelector('select').value = ''
      recalculate()
    } else {
      tr.remove()
      recalculate()
    }
  })
  deleteCell.append(remove)
  tr.append(deleteCell)
  tr.addEventListener('input', recalculate)
  tr.addEventListener('change', recalculate)
  rowsHost.append(tr)
  recalculate()
}

function itemRows() {
  return [...rowsHost.rows].map(row => Object.fromEntries(
    [...row.querySelectorAll('[data-field]')].map(input => [input.dataset.field, input.value.trim()])
  )).filter(item => item.itemCode || item.itemName || item.quantity)
}

function recalculate() {
  let totalQuantity = 0
  let totalAmount = 0
  ;[...rowsHost.rows].forEach((row, index) => {
    row.querySelector('.line-number').textContent = String(index + 1)
    const quantity = Number(row.querySelector('[data-field="quantity"]').value) || 0
    const price = Number(row.querySelector('[data-field="unitPrice"]').value) || 0
    const amount = quantity * price
    row.querySelector('.line-amount').textContent = amount.toLocaleString('vi-VN')
    totalQuantity += quantity
    totalAmount += amount
  })
  document.querySelector('#transferFooterQuantity').textContent = totalQuantity.toLocaleString('vi-VN')
  document.querySelector('#transferFooterAmount').textContent = totalAmount.toLocaleString('vi-VN')
}

async function loadNextNumber() {
  const input = document.querySelector('#transferVoucherNo')
  input.value = ''
  input.placeholder = 'Đang lấy số...'
  try {
    const result = await api('/api/warehouse-transfers/next-number')
    input.value = result.voucherNo
    input.placeholder = ''
  } catch (error) {
    input.placeholder = 'Không tải được số phiếu'
    message.textContent = error.message
  }
}

async function loadWarehouses() {
  const warehouses = await api('/api/warehouse-transfers/warehouses')
  availableWarehouses = warehouses
  for (const id of ['sourceWarehouse', 'destinationWarehouse']) {
    const select = document.getElementById(id)
    for (const code of warehouses) select.add(new Option(code, code))
  }
  if (warehouses.length === 1) {
    document.querySelector('#sourceWarehouse').value = warehouses[0]
    document.querySelector('#sourceWarehouse').disabled = true
    document.querySelector('#destinationWarehouse').disabled = true
  }
}

async function loadCurrentUser() {
  const user = await api('/api/auth/me')
  currentUser = user
  document.querySelector('#transferUserLabel').textContent = `Tài khoản: ${user.username}`
}

function itemKey(item) {
  return [item.itemCode, item.itemName, item.itemType, item.color, item.unit]
    .map(value => String(value || '').toLocaleUpperCase('vi'))
    .join('\u0000')
}

function updateSelectedCount() {
  document.querySelector('#selectedItemCount').textContent = `Đã chọn ${selectedDatabaseItems.size} mặt hàng`
}

async function loadDatabaseItems() {
  const body = document.querySelector('#itemPickerRows')
  body.replaceChildren()
  const query = document.querySelector('#itemPickerSearch').value.trim()
  const sourceWarehouseCode = document.querySelector('#sourceWarehouse').value
  if (!sourceWarehouseCode) {
    const empty = cell(body.insertRow(), 'Chọn kho chuyển đi để xem số lượng tồn hiện tại.')
    empty.colSpan = 9
    empty.className = 'picker-empty'
    return
  }
  try {
    const params = new URLSearchParams({ warehouse: sourceWarehouseCode })
    if (query) params.set('q', query)
    databaseItems = await api(`/api/warehouse-transfers/items?${params}`)
    if (!databaseItems.length) {
      const row = document.createElement('tr')
      const empty = cell(row, 'Không tìm thấy mặt hàng phù hợp trong database.')
      empty.colSpan = 9
      empty.className = 'picker-empty'
      body.append(row)
      return
    }
    for (const item of databaseItems) {
      const key = itemKey(item)
      const row = document.createElement('tr')
      if (selectedDatabaseItems.has(key)) row.className = 'picker-selected'
      const checkCell = document.createElement('td')
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.checked = selectedDatabaseItems.has(key)
      checkbox.setAttribute('aria-label', `Chọn ${item.itemCode}`)
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedDatabaseItems.set(key, item)
        else selectedDatabaseItems.delete(key)
        row.classList.toggle('picker-selected', checkbox.checked)
        updateSelectedCount()
      })
      checkCell.append(checkbox)
      row.append(checkCell)
      cell(row, item.itemCode)
      cell(row, item.itemName)
      cell(row, item.itemType)
      cell(row, item.color)
      cell(row, item.unit)
      cell(row, Number(item.currentQuantity || 0).toLocaleString('vi-VN'))
      cell(row, Number(item.unitPrice || 0).toLocaleString('vi-VN'))
      cell(row, item.warehouseCode)
      body.append(row)
    }
  } catch (error) {
    const row = document.createElement('tr')
    const errorCell = cell(row, error.message)
    errorCell.colSpan = 9
    errorCell.className = 'picker-empty'
    body.append(row)
  }
}

function addSelectedDatabaseItems() {
  const chosen = [...selectedDatabaseItems.values()]
  if (!chosen.length) return
  const existing = new Set(itemRows().map(itemKey))
  let added = 0
  for (const item of chosen) {
    const key = itemKey(item)
    if (existing.has(key)) continue
    const blankRow = [...rowsHost.rows].find(row => !row.querySelector('[data-field="itemCode"]').value.trim())
    if (blankRow) {
      blankRow.remove()
      recalculate()
    }
    addItemRow({ ...item, quantity: '' })
    existing.add(key)
    added += 1
  }
  if (!rowsHost.rows.length) addItemRow()
  if (added) {
    message.className = 'message success-message'
    message.textContent = `Đã thêm ${added} mặt hàng từ database. Nhập số lượng trước khi lưu phiếu.`
  } else {
    message.className = 'message'
    message.textContent = 'Các mặt hàng đã chọn đã có trong bảng.'
  }
  selectedDatabaseItems.clear()
  updateSelectedCount()
  document.querySelector('#itemPickerDialog').close()
}

function cell(row, value) {
  const td = document.createElement('td')
  td.textContent = value == null || value === '' ? '—' : String(value)
  row.append(td)
  return td
}

function showDetails(record) {
  document.querySelector('#detailTitle').textContent = `Phiếu ${record.voucherNo}`
  document.querySelector('#detailSubtitle').textContent = `${record.voucherDate || ''} · ${record.sourceWarehouseCode} → ${record.destinationWarehouseCode}`
  document.querySelector('#detailDescription').textContent = record.description || ''
  const body = document.querySelector('#detailRows')
  body.replaceChildren()
  for (const [index, item] of record.items.entries()) {
    const row = document.createElement('tr')
    cell(row, index + 1); cell(row, item.itemCode); cell(row, item.itemName); cell(row, item.itemType)
    cell(row, item.color); cell(row, item.unit); cell(row, Number(item.quantity).toLocaleString('vi-VN'))
    cell(row, Number(item.unitPrice).toLocaleString('vi-VN'))
    cell(row, (Number(item.quantity) * Number(item.unitPrice)).toLocaleString('vi-VN'))
    body.append(row)
  }
  document.querySelector('#transferDetailDialog').showModal()
}

async function loadTransfers() {
  const body = document.querySelector('#transferRows')
  body.replaceChildren()
  const query = document.querySelector('#transferSearch').value.trim()
  try {
    transfers = await api(`/api/warehouse-transfers${query ? `?q=${encodeURIComponent(query)}` : ''}`)
    if (!transfers.length) {
      const row = document.createElement('tr')
      const empty = cell(row, 'Chưa có phiếu điều chuyển phù hợp.')
      empty.colSpan = 8
      empty.className = 'empty-row'
      body.append(row)
      return
    }
    for (const record of transfers.slice(0, 200)) {
      const row = document.createElement('tr')
      cell(row, record.voucherDate)
      cell(row, record.voucherNo)
      cell(row, record.sourceWarehouseCode)
      cell(row, record.destinationWarehouseCode)
      cell(row, record.items.length)
      cell(row, record.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0).toLocaleString('vi-VN'))
      cell(row, record.createdBy)
      const actionCell = document.createElement('td')
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'detail-button'
      button.textContent = 'Chi tiết'
      button.addEventListener('click', () => showDetails(record))
      actionCell.append(button)
      const isAdmin = currentUser?.role === 'admin'
      const isCreator = String(record.createdBy || '').toLocaleLowerCase('vi') ===
        String(currentUser?.username || '').toLocaleLowerCase('vi')
      const allowedWarehouses = new Set((currentUser?.warehouseCodes || [])
        .map(code => String(code).toLocaleUpperCase('vi')))
      const canManageBothWarehouses = allowedWarehouses.has(String(record.sourceWarehouseCode).toLocaleUpperCase('vi')) &&
        allowedWarehouses.has(String(record.destinationWarehouseCode).toLocaleUpperCase('vi'))
      if (isAdmin || (isCreator && canManageBothWarehouses)) {
        const remove = document.createElement('button')
        remove.type = 'button'
        remove.className = 'detail-button delete-transfer-button'
        remove.textContent = 'Xóa'
        remove.setAttribute('aria-label', `Xóa phiếu điều chuyển ${record.voucherNo}`)
        remove.addEventListener('click', async () => {
          const confirmed = window.confirm(
            `Xóa phiếu ${record.voucherNo}? Hệ thống sẽ xóa dữ liệu phiếu điều chuyển khỏi database và tính lại số tồn trước khi điều chuyển.`
          )
          if (!confirmed) return
          remove.disabled = true
          try {
            await api(`/api/warehouse-transfers/${record.id}/delete`, { method: 'POST' })
            await loadTransfers()
            await loadNextNumber()
            const listMessage = document.querySelector('#listMessage')
            listMessage.textContent = `Đã xóa phiếu ${record.voucherNo}; số tồn kho đã được tính lại.`
            listMessage.classList.add('success-message')
          } catch (error) {
            remove.disabled = false
            const listMessage = document.querySelector('#listMessage')
            listMessage.textContent = error.message
            listMessage.classList.remove('success-message')
          }
        })
        actionCell.append(remove)
      }
      row.append(actionCell)
      body.append(row)
    }
  } catch (error) {
    const row = document.createElement('tr')
    const errorCell = cell(row, error.message)
    errorCell.colSpan = 8
    errorCell.className = 'empty-row'
    body.append(row)
  }
}

document.querySelector('#addTransferRow').addEventListener('click', () => addItemRow())
document.querySelector('#openItemPicker').addEventListener('click', async () => {
  if (!document.querySelector('#sourceWarehouse').value) {
    message.className = 'message'
    message.textContent = 'Vui lòng chọn kho chuyển đi trước khi chọn mặt hàng để xem tồn hiện tại.'
    return
  }
  selectedDatabaseItems.clear()
  updateSelectedCount()
  document.querySelector('#itemPickerSearch').value = ''
  document.querySelector('#itemPickerDialog').showModal()
  await loadDatabaseItems()
})
document.querySelector('#refreshItemChoices').addEventListener('click', loadDatabaseItems)
document.querySelector('#itemPickerSearch').addEventListener('input', () => {
  clearTimeout(itemSearchTimer)
  itemSearchTimer = setTimeout(loadDatabaseItems, 220)
})
document.querySelector('#addSelectedItems').addEventListener('click', addSelectedDatabaseItems)
document.querySelector('#closeItemPicker').addEventListener('click', () => document.querySelector('#itemPickerDialog').close())
document.querySelector('#cancelItemPicker').addEventListener('click', () => document.querySelector('#itemPickerDialog').close())
document.querySelector('#refreshTransfers').addEventListener('click', loadTransfers)
document.querySelector('#transferSearch').addEventListener('input', () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadTransfers, 250)
})
document.querySelector('#closeTransferDetail').addEventListener('click', () => document.querySelector('#transferDetailDialog').close())
document.querySelector('#resetTransfer').addEventListener('click', () => {
  setTimeout(() => {
    document.querySelector('#transferDate').value = localIsoDate()
    document.querySelector('#sourceWarehouse').disabled = availableWarehouses.length < 2
    document.querySelector('#destinationWarehouse').disabled = availableWarehouses.length < 2
    for (const option of document.querySelector('#destinationWarehouse').options) option.disabled = false
    rowsHost.replaceChildren()
    addItemRow()
    message.textContent = ''
    loadNextNumber()
  }, 0)
})
document.querySelector('#sourceWarehouse').addEventListener('change', event => {
  const destination = document.querySelector('#destinationWarehouse')
  for (const option of destination.options) option.disabled = Boolean(option.value && option.value === event.target.value)
  if (destination.value === event.target.value) destination.value = ''
  selectedDatabaseItems.clear()
  updateSelectedCount()
  if (document.querySelector('#itemPickerDialog').open) loadDatabaseItems()
})
form.addEventListener('submit', async event => {
  event.preventDefault()
  message.textContent = ''
  const submit = document.querySelector('#saveTransfer')
  const sourceWarehouseCode = document.querySelector('#sourceWarehouse').value
  const destinationWarehouseCode = document.querySelector('#destinationWarehouse').value
  if (sourceWarehouseCode === destinationWarehouseCode) {
    message.textContent = 'Kho chuyển đi và kho nhận phải khác nhau.'
    return
  }
  const items = itemRows()
  if (!items.length || items.some(item => !item.itemCode || !item.itemType || item.unitPrice === '' || !item.quantity || Number(item.quantity) <= 0)) {
    message.textContent = 'Mỗi dòng cần có mã hàng, loại hàng, đơn giá; số lượng phải lớn hơn 0.'
    return
  }
  submit.disabled = true
  try {
    await api('/api/warehouse-transfers', {
      method: 'POST',
      body: JSON.stringify({
        voucherNo: document.querySelector('#transferVoucherNo').value,
        voucherDate: document.querySelector('#transferDate').value,
        sourceWarehouseCode,
        destinationWarehouseCode,
        description: form.elements.description.value,
        items,
      }),
    })
    form.reset()
    for (const option of document.querySelector('#destinationWarehouse').options) option.disabled = false
    document.querySelector('#transferDate').value = localIsoDate()
    rowsHost.replaceChildren()
    addItemRow()
    await loadNextNumber()
    await loadTransfers()
    message.className = 'message success-message'
    message.textContent = 'Đã lưu phiếu điều chuyển. Báo cáo nhập xuất tồn đã nhận hai phát sinh kho đi/kho nhận.'
  } catch (error) {
    message.className = 'message'
    message.textContent = error.message
  } finally {
    submit.disabled = false
  }
})

document.querySelector('#transferDate').value = localIsoDate()
addItemRow()
Promise.all([loadCurrentUser(), loadWarehouses(), loadNextNumber()]).then(loadTransfers).catch(error => {
  document.querySelector('#transferMessage').textContent = error.message
})
