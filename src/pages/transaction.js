import { idr, fmtDateTime } from '../utils.js'
import { unwrap } from '../db.js'

export async function renderTransaction(container, db, role = 'manager') {
  const today = new Date().toISOString().slice(0, 10)
  const d7 = new Date(); d7.setDate(d7.getDate() - 7)
  const from = d7.toISOString().slice(0, 10)

  container.innerHTML = `
    <div class="space-y-5">
      <div class="card p-0 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100">
          <h3 class="text-lg font-semibold text-gray-800">Transaction History</h3>
          <p class="text-sm text-gray-500">View all F&B sales and racket rental records</p>
        </div>
        <div class="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-gray-100">
          <div class="flex items-center gap-2">
            <label class="text-sm text-gray-600 font-medium">From:</label>
            <input type="date" id="trx-from" value="${from}" class="form-input w-auto"/>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-sm text-gray-600 font-medium">To:</label>
            <input type="date" id="trx-to" value="${today}" class="form-input w-auto"/>
          </div>
          <button id="btn-trx-filter" class="btn-primary">Filter</button>
        </div>
        <!-- Tabs -->
        <div class="flex gap-2 px-5 border-b border-gray-200">
          <button id="tab-fnb" class="tab-btn px-4 py-2 text-sm font-medium border-b-2 border-orange-500 text-orange-600">F&B Sales</button>
          <button id="tab-rental" class="tab-btn px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">Racket Rentals</button>
        </div>
        <div id="trx-content" class="p-5"></div>
      </div>
    </div>
  `

  let activeTab = 'fnb'

  function setTab(tab) {
    activeTab = tab
    document.getElementById('tab-fnb').className = `tab-btn px-4 py-2 text-sm font-medium border-b-2 ${tab === 'fnb' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`
    document.getElementById('tab-rental').className = `tab-btn px-4 py-2 text-sm font-medium border-b-2 ${tab === 'rental' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`
    loadTransactions(db)
  }

  document.getElementById('tab-fnb').addEventListener('click', () => setTab('fnb'))
  document.getElementById('tab-rental').addEventListener('click', () => setTab('rental'))
  document.getElementById('btn-trx-filter').addEventListener('click', () => loadTransactions(db))

  async function loadTransactions(db) {
    const from = document.getElementById('trx-from').value
    const to = document.getElementById('trx-to').value
    const content = document.getElementById('trx-content')
    content.innerHTML = `<div class="flex justify-center py-8"><div class="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div></div>`

    if (activeTab === 'fnb') {
      const rows = unwrap(await db.rpc('get_fnb_transactions', { date_from: from, date_to: to }))

      if (!rows.length) {
        content.innerHTML = `<div class="card text-center text-gray-400 py-12">No F&B transactions in this period</div>`
        return
      }

      const tbody = rows.map(row => {
        const customer = row.member_name || row.guest_name || 'Guest'
        return `
          <tr class="hover:bg-gray-50 cursor-pointer" data-log-id="${row.id}">
            <td class="table-td text-xs text-gray-400">#${row.id}</td>
            <td class="table-td font-medium">${customer}</td>
            <td class="table-td font-semibold text-orange-600">${idr(row.total_price)}</td>
            <td class="table-td text-xs text-gray-500">${fmtDateTime(row.created_at)}</td>
            <td class="table-td">
              <button class="btn-expand text-xs text-blue-600 hover:underline" data-id="${row.id}">Details</button>
            </td>
          </tr>
          <tr id="expand-${row.id}" class="hidden bg-orange-50">
            <td colspan="5" class="px-4 py-3">
              <div id="detail-${row.id}" class="text-sm text-gray-600">Loading...</div>
            </td>
          </tr>
        `
      }).join('')

      content.innerHTML = `
        <div class="card p-0 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr>
                  <th class="table-th">ID</th>
                  <th class="table-th">Customer</th>
                  <th class="table-th">Total</th>
                  <th class="table-th">Date</th>
                  <th class="table-th"></th>
                </tr>
              </thead>
              <tbody>${tbody}</tbody>
            </table>
          </div>
        </div>
        <p class="text-xs text-gray-400 mt-2">${rows.length} transaction(s)</p>
      `

      document.querySelectorAll('.btn-expand').forEach(b => b.addEventListener('click', async () => {
        const id = b.dataset.id
        const row = document.getElementById(`expand-${id}`)
        const detail = document.getElementById(`detail-${id}`)
        if (row.classList.contains('hidden')) {
          row.classList.remove('hidden')
          const items = unwrap(await db.from('fnb_log_items').select('*').eq('log_id', id))
          detail.innerHTML = items.length
            ? `<table class="text-xs w-full max-w-lg">
                <thead><tr><th class="text-left pb-1">Item</th><th class="text-right pb-1">Qty</th><th class="text-right pb-1">Price</th><th class="text-right pb-1">Subtotal</th></tr></thead>
                <tbody>${items.map(i => `<tr><td>${i.fnb_name}</td><td class="text-right">${i.qty}</td><td class="text-right">${idr(i.price)}</td><td class="text-right font-medium">${idr(i.qty * i.price)}</td></tr>`).join('')}</tbody>
               </table>`
            : '<span class="text-gray-400">No item details</span>'
          b.textContent = 'Hide'
        } else {
          row.classList.add('hidden')
          b.textContent = 'Details'
        }
      }))

    } else {
      // Rentals
      const rows = unwrap(await db.rpc('get_rental_transactions', { date_from: from, date_to: to }))

      if (!rows.length) {
        content.innerHTML = `<div class="card text-center text-gray-400 py-12">No rental transactions in this period</div>`
        return
      }

      const tbody = rows.map(row => {
        const customer = row.member_name || row.guest_name || 'Guest'
        return `
          <tr class="hover:bg-gray-50">
            <td class="table-td text-xs text-gray-400">#${row.id}</td>
            <td class="table-td">
              <div class="font-medium">${row.racket_name}</div>
              <div class="text-xs text-gray-400">${row.racket_model}</div>
            </td>
            <td class="table-td">${customer}</td>
            <td class="table-td text-xs">${fmtDateTime(row.start)} <span class="text-gray-400">(${row.duration}h)</span></td>
            <td class="table-td font-semibold text-orange-600">${idr(row.total_price)}</td>
            <td class="table-td">
              <span class="${row.status === 0 ? 'badge-orange' : 'badge-green'}">${row.status === 0 ? 'Renting' : 'Returned'}</span>
            </td>
          </tr>
        `
      }).join('')

      content.innerHTML = `
        <div class="card p-0 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr>
                  <th class="table-th">ID</th>
                  <th class="table-th">Racket</th>
                  <th class="table-th">Customer</th>
                  <th class="table-th">Start / Duration</th>
                  <th class="table-th">Total</th>
                  <th class="table-th">Status</th>
                </tr>
              </thead>
              <tbody>${tbody}</tbody>
            </table>
          </div>
        </div>
        <p class="text-xs text-gray-400 mt-2">${rows.length} rental(s)</p>
      `
    }
  }

  loadTransactions(db)
}
