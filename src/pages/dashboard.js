import { idr, fmtDate } from '../utils.js'
import { unwrap } from '../db.js'
import Chart from 'chart.js/auto'

let charts = {}

export async function renderDashboard(container, db, role = 'manager') {
  const today = new Date()
  const d30 = new Date(today); d30.setDate(today.getDate() - 30)
  const dateFrom = d30.toISOString().slice(0, 10)
  const dateTo = today.toISOString().slice(0, 10)

  container.innerHTML = `
    <div class="space-y-6">
      <!-- Date filter -->
      <div class="flex flex-wrap items-center gap-3 bg-white rounded-2xl px-5 py-3.5 border border-gray-100" style="box-shadow:0 1px 2px rgba(0,0,0,0.04),0 8px 24px rgba(0,0,0,0.04)">
        <span class="text-xs font-bold text-gray-400 uppercase tracking-widest mr-1">Filter</span>
        <div class="flex items-center gap-2">
          <label class="text-xs text-gray-500 font-semibold">From</label>
          <input type="date" id="dash-from" value="${dateFrom}" class="form-input w-auto text-xs"/>
        </div>
        <div class="flex items-center gap-2">
          <label class="text-xs text-gray-500 font-semibold">To</label>
          <input type="date" id="dash-to" value="${dateTo}" class="form-input w-auto text-xs"/>
        </div>
        <button id="dash-filter" class="btn-primary text-xs py-1.5 px-4">Apply</button>
      </div>

      <!-- Summary cards -->
      <div id="dash-summaries" class="grid grid-cols-3 lg:grid-cols-3 gap-4"></div>

      <!-- Charts -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div class="card">
          <div class="flex items-center justify-between mb-5">
            <div>
              <p class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-0.5">Revenue</p>
              <h3 class="font-bold text-gray-900">F&amp;B Sales</h3>
            </div>
            <div class="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center">
              <svg class="w-4.5 h-4.5 text-orange-500 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
            </div>
          </div>
          <canvas id="chart-fnb" height="200"></canvas>
        </div>
        <div class="card">
          <div class="flex items-center justify-between mb-5">
            <div>
              <p class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-0.5">Rentals</p>
              <h3 class="font-bold text-gray-900">Racket Revenue</h3>
            </div>
            <div class="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
          </div>
          <canvas id="chart-racket" height="200"></canvas>
        </div>
      </div>
      <div class="card">
        <div class="flex items-center justify-between mb-5">
          <div>
            <p class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-0.5">Inventory</p>
            <h3 class="font-bold text-gray-900">Stock Adjustments</h3>
          </div>
          <select id="stock-product-filter" class="form-input w-48 text-xs">
            <option value="">All Products</option>
          </select>
        </div>
        <canvas id="chart-stock" height="100"></canvas>
      </div>
    </div>
  `

  // Event
  document.getElementById('dash-filter').addEventListener('click', () => {
    const from = document.getElementById('dash-from').value
    const to = document.getElementById('dash-to').value
    loadDashboard(db, from, to)
  })

  document.getElementById('stock-product-filter').addEventListener('change', () => {
    const from = document.getElementById('dash-from').value
    const to = document.getElementById('dash-to').value
    loadDashboard(db, from, to)
  })

  await loadDashboard(db, dateFrom, dateTo)
}

async function loadDashboard(db, from, to) {
  // Load FnB sales via RPC
  const fnbRows = unwrap(await db.rpc('get_fnb_revenue', { date_from: from, date_to: to }))

  // Load racket rentals via RPC
  const racketRows = unwrap(await db.rpc('get_racket_revenue', { date_from: from, date_to: to }))

  // Summary totals
  const fnbTotal = fnbRows.reduce((s, r) => s + (r.revenue || 0), 0)
  const fnbCount = fnbRows.reduce((s, r) => s + (r.count || 0), 0)
  const racketTotal = racketRows.reduce((s, r) => s + (r.revenue || 0), 0)
  const racketCount = racketRows.reduce((s, r) => s + (r.count || 0), 0)

 document.getElementById('dash-summaries').innerHTML = `
  <div class="stat-card flex items-center justify-between">
    <div>
      <p class="text-xs font-bold text-gray-400 uppercase tracking-widest">F&amp;B Revenue</p>
      <p class="text-xl font-bold text-gray-900 mt-0.5 tracking-tight">${idr(fnbTotal)}</p>
      <p class="text-xs text-gray-400 mt-0.5">${fnbCount} transactions</p>
    </div>
    <div class="stat-icon bg-orange-50">
      <svg class="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
    </div>
  </div>

  <div class="stat-card flex items-center justify-between">
    <div>
      <p class="text-xs font-bold text-gray-400 uppercase tracking-widest">Racket Revenue</p>
      <p class="text-xl font-bold text-gray-900 mt-0.5 tracking-tight">${idr(racketTotal)}</p>
      <p class="text-xs text-gray-400 mt-0.5">${racketCount} rentals</p>
    </div>
    <div class="stat-icon bg-blue-50">
      <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
    </div>
  </div>

  <div class="stat-card flex items-center justify-between">
    <div>
      <p class="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Revenue</p>
      <p class="text-xl font-bold text-gray-900 mt-0.5 tracking-tight">${idr(fnbTotal + racketTotal)}</p>
      <p class="text-xs text-gray-400 mt-0.5">${fnbCount + racketCount} transactions</p>
    </div>
    <div class="stat-icon bg-green-50">
      <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 0 0118 0z"/></svg>
    </div>
  </div>

  
`;

  // F&B Chart
  destroyChart('chart-fnb')
  charts['chart-fnb'] = new Chart(document.getElementById('chart-fnb'), {
    data: {
      labels: fnbRows.map(r => r.day),
      datasets: [
        { type: 'bar', label: 'Revenue (Rp)', data: fnbRows.map(r => r.revenue), backgroundColor: 'rgba(252,102,1,0.7)', yAxisID: 'y' },
        { type: 'line', label: 'Transactions', data: fnbRows.map(r => r.count), borderColor: '#3b82f6', yAxisID: 'y1', tension: 0.3, fill: false }
      ]
    },
    options: chartOptions()
  })

  // Racket Chart
  destroyChart('chart-racket')
  charts['chart-racket'] = new Chart(document.getElementById('chart-racket'), {
    data: {
      labels: racketRows.map(r => r.day),
      datasets: [
        { type: 'bar', label: 'Revenue (Rp)', data: racketRows.map(r => r.revenue), backgroundColor: 'rgba(59,130,246,0.7)', yAxisID: 'y' },
        { type: 'line', label: 'Rentals', data: racketRows.map(r => r.count), borderColor: '#fc6601', yAxisID: 'y1', tension: 0.3, fill: false }
      ]
    },
    options: chartOptions()
  })

  // Stock history
  const productFilter = document.getElementById('stock-product-filter')
  const allProducts = unwrap(await db.from('fnb_stock').select('id, fnb_name').order('fnb_name'))
  const curVal = productFilter.value
  productFilter.innerHTML = '<option value="">All Products</option>' +
    allProducts.map(p => `<option value="${p.id}" ${curVal == p.id ? 'selected' : ''}>${p.fnb_name}</option>`).join('')

  const stockProductId = productFilter.value ? parseInt(productFilter.value) : null
  const stockRows = unwrap(await db.rpc('get_stock_adjustments', {
    date_from: from, date_to: to, p_product_id: stockProductId
  }))

  destroyChart('chart-stock')
  charts['chart-stock'] = new Chart(document.getElementById('chart-stock'), {
    type: 'bar',
    data: {
      labels: stockRows.map(r => r.day),
      datasets: [
        { label: 'Added', data: stockRows.map(r => r.added), backgroundColor: 'rgba(34,197,94,0.7)' },
        { label: 'Reduced', data: stockRows.map(r => r.reduced), backgroundColor: 'rgba(239,68,68,0.7)' }
      ]
    },
    options: { responsive: true, plugins: { legend: { position: 'top' } } }
  })
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id] }
}

function chartOptions() {
  const isDark = document.documentElement.classList.contains('dark')
  const font = { family: 'Jost', size: 11 }
  const muted = isDark ? '#6b7280' : '#9ca3af'
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'
  const legendColor = isDark ? '#9ca3af' : '#6b7280'
  return {
    responsive: true,
    interaction: { mode: 'index' },
    scales: {
      y: {
        position: 'left',
        grid: { color: gridColor, drawBorder: false },
        ticks: { font, color: muted },
        title: { display: true, text: 'Revenue (Rp)', font, color: muted }
      },
      y1: {
        position: 'right',
        grid: { drawOnChartArea: false },
        ticks: { font, color: muted },
        title: { display: true, text: 'Count', font, color: muted }
      },
      x: {
        grid: { display: false },
        ticks: { font, color: muted }
      }
    },
    plugins: {
      legend: {
        position: 'top',
        labels: { font, color: legendColor, usePointStyle: true, pointStyle: 'circle', padding: 20 }
      }
    }
  }
}
