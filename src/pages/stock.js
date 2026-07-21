import { idr, fmtDateTime, toast, confirm, fileToBase64, now } from '../utils.js'
import { unwrap } from '../db.js'

const CATEG = { 1: 'Beverages', 2: 'Foods', 3: 'Snacks' }

export async function renderStock(container, db, role = 'manager') {
  const isManager = role === 'manager'
  container.innerHTML = `
    <div class="space-y-5">
      <div class="card p-0 overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 class="text-lg font-semibold text-gray-800">F&B Stock Management</h3>
            <p class="text-sm text-gray-500">Manage products and inventory levels</p>
          </div>
          ${isManager ? `<button id="btn-add-product" class="btn-primary flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Add Product
          </button>` : ''}
        </div>
        <div class="flex flex-wrap gap-3 items-center px-5 py-3 border-b border-gray-100">
          <input type="text" id="stock-search" placeholder="Search product..." class="form-input max-w-xs"/>
          <select id="stock-categ-filter" class="form-input w-36">
            <option value="">All Categories</option>
            <option value="1">Beverages</option>
            <option value="2">Foods</option>
            <option value="3">Snacks</option>
          </select>
        </div>
      </div>

      <div id="stock-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"></div>
    </div>

    <!-- Add/Edit Product Modal -->
    <div id="modal-product" class="modal-overlay hidden">
      <div class="modal-box">
        <div class="modal-header">
          <h3 id="modal-product-title" class="font-semibold">Add Product</h3>
          <button class="modal-close-prod text-white/80 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div class="p-6 space-y-4">
          <input type="hidden" id="prod-id"/>
          <div>
            <label class="form-label">Product Name <span class="text-red-500">*</span></label>
            <input type="text" id="prod-name" class="form-input" placeholder="e.g. Mineral Water"/>
          </div>
          <div>
            <label class="form-label">Description</label>
            <textarea id="prod-desc" class="form-input" rows="2" placeholder="Optional"></textarea>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="form-label">Price (Rp) <span class="text-red-500">*</span></label>
              <input type="number" id="prod-price" class="form-input" placeholder="10000" min="0"/>
            </div>
            <div>
              <label class="form-label">Category <span class="text-red-500">*</span></label>
              <select id="prod-categ" class="form-input">
                <option value="1">Beverages</option>
                <option value="2">Foods</option>
                <option value="3">Snacks</option>
              </select>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="form-label">Stock</label>
              <input type="number" id="prod-stock" class="form-input" placeholder="0" min="0"/>
            </div>
            <div>
              <label class="form-label">Safety Stock</label>
              <input type="number" id="prod-safety" class="form-input" placeholder="5" min="0"/>
            </div>
          </div>
          <div>
            <label class="form-label">Product Image</label>
            <input type="file" id="prod-image-file" accept="image/*" class="form-input text-xs"/>
            <div id="prod-image-preview" class="mt-2 hidden">
              <img id="prod-preview-img" class="w-24 h-24 object-cover rounded-lg border"/>
            </div>
          </div>
          <div class="flex gap-3 pt-2">
            <button id="btn-save-product" class="btn-primary flex-1">Save Product</button>
            <button class="modal-close-prod btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Adjust Stock Modal -->
    <div id="modal-adjust" class="modal-overlay hidden">
      <div class="modal-box">
        <div class="modal-header">
          <h3 class="font-semibold">Adjust Stock</h3>
          <button class="modal-close-adj text-white/80 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div class="p-6 space-y-4">
          <input type="hidden" id="adj-prod-id"/>
          <p id="adj-prod-name" class="font-medium text-gray-700"></p>
          <p class="text-sm text-gray-500">Current stock: <span id="adj-current-stock" class="font-semibold text-gray-800"></span></p>
          <div>
            <label class="form-label">Adjustment</label>
            <div class="flex gap-2">
              <button id="adj-minus" class="w-10 h-10 bg-red-100 text-red-600 rounded-lg font-bold text-lg hover:bg-red-200 flex-shrink-0">-</button>
              <input type="number" id="adj-qty" class="form-input text-center" value="0"/>
              <button id="adj-plus" class="w-10 h-10 bg-green-100 text-green-600 rounded-lg font-bold text-lg hover:bg-green-200 flex-shrink-0">+</button>
            </div>
            <p class="text-xs text-gray-400 mt-1">Use positive to add, negative to reduce</p>
          </div>
          <div>
            <label class="form-label">Reason</label>
            <input type="text" id="adj-reason" class="form-input" placeholder="e.g. Stock in, damaged, etc."/>
          </div>
          <div id="adj-preview" class="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 hidden"></div>
          <div class="flex gap-3 pt-2">
            <button id="btn-save-adj" class="btn-primary flex-1">Apply Adjustment</button>
            <button class="modal-close-adj btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Stock History Modal -->
    <div id="modal-history" class="modal-overlay hidden">
      <div class="modal-box max-w-2xl">
        <div class="modal-header">
          <h3 id="modal-history-title" class="font-semibold">Stock History</h3>
          <button class="modal-close-hist text-white/80 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div class="p-6">
          <div id="history-content"></div>
        </div>
      </div>
    </div>
  `

  // Image preview
  document.getElementById('prod-image-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const b64 = await fileToBase64(file)
    document.getElementById('prod-preview-img').src = b64
    document.getElementById('prod-image-preview').classList.remove('hidden')
  })

  // Adj qty buttons
  document.getElementById('adj-minus').addEventListener('click', () => {
    const q = document.getElementById('adj-qty')
    q.value = parseInt(q.value || 0) - 1
    updateAdjPreview()
  })
  document.getElementById('adj-plus').addEventListener('click', () => {
    const q = document.getElementById('adj-qty')
    q.value = parseInt(q.value || 0) + 1
    updateAdjPreview()
  })
  document.getElementById('adj-qty').addEventListener('input', updateAdjPreview)

  // Modals close
  document.querySelectorAll('.modal-close-prod').forEach(b => b.addEventListener('click', () => document.getElementById('modal-product').classList.add('hidden')))
  document.querySelectorAll('.modal-close-adj').forEach(b => b.addEventListener('click', () => document.getElementById('modal-adjust').classList.add('hidden')))
  document.querySelectorAll('.modal-close-hist').forEach(b => b.addEventListener('click', () => document.getElementById('modal-history').classList.add('hidden')))

  if (isManager) {
    document.getElementById('btn-add-product').addEventListener('click', () => openProductModal())
    document.getElementById('btn-save-product').addEventListener('click', () => saveProduct(db))
  }
  document.getElementById('btn-save-adj').addEventListener('click', () => saveAdjustment(db))
  document.getElementById('stock-search').addEventListener('input', () => loadStock(db, isManager))
  document.getElementById('stock-categ-filter').addEventListener('change', () => loadStock(db, isManager))

  await loadStock(db, isManager)
}

function updateAdjPreview() {
  const cur = parseInt(document.getElementById('adj-current-stock').textContent || 0)
  const diff = parseInt(document.getElementById('adj-qty').value || 0)
  const newStock = cur + diff
  const p = document.getElementById('adj-preview')
  if (diff !== 0) {
    p.classList.remove('hidden')
    p.innerHTML = `${cur} → <strong class="${newStock < 0 ? 'text-red-600' : 'text-green-600'}">${newStock}</strong> (${diff > 0 ? '+' : ''}${diff})`
  } else {
    p.classList.add('hidden')
  }
}

async function loadStock(db, isManager = true) {
  const search = document.getElementById('stock-search')?.value?.trim() || ''
  const categ = document.getElementById('stock-categ-filter')?.value || ''

  let query = db.from('fnb_stock').select('*')
  if (search) query = query.ilike('fnb_name', `%${search}%`)
  if (categ) query = query.eq('categ', parseInt(categ))
  query = query.order('fnb_name')

  const products = unwrap(await query)

  const grid = document.getElementById('stock-grid')
  if (!products.length) {
    grid.innerHTML = `<div class="col-span-full text-center text-gray-400 py-12">No products found</div>`
    return
  }

  grid.innerHTML = products.map(p => {
    const lowStock = p.safety_stock > 0 && p.stock <= p.safety_stock
    const imgHtml = p.fnb_image
      ? `<img src="${p.fnb_image}" class="w-full h-32 object-cover rounded-t-xl"/>`
      : `<div class="w-full h-32 bg-gray-100 rounded-t-xl flex items-center justify-center text-4xl">${p.categ === 1 ? '🥤' : p.categ === 2 ? '🍱' : '🍿'}</div>`

    return `
      <div class="card p-0 overflow-hidden flex flex-col">
        ${imgHtml}
        <div class="p-4 flex-1 flex flex-col gap-2">
          <div>
            <p class="font-semibold text-gray-800 text-sm leading-tight">${p.fnb_name}</p>
            <span class="badge-gray text-xs">${CATEG[p.categ]}</span>
          </div>
          <div class="flex items-center justify-between">
            <p class="text-orange-600 font-bold">${idr(p.price)}</p>
            <div class="flex items-center gap-1">
              <span class="text-sm font-semibold ${lowStock ? 'text-red-600' : 'text-gray-700'}">${p.stock}</span>
              <span class="text-xs text-gray-400">pcs</span>
              ${lowStock ? '<span class="badge-red text-xs ml-1">Low</span>' : ''}
            </div>
          </div>
          <div class="flex gap-1.5 mt-auto pt-1">
            <button class="btn-adj flex-1 text-xs py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium" data-id="${p.id}" data-name="${p.fnb_name}" data-stock="${p.stock}">Adjust</button>
            <button class="btn-hist flex-1 text-xs py-1.5 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 font-medium" data-id="${p.id}" data-name="${p.fnb_name}">History</button>
            ${isManager ? `<button class="btn-edit-prod text-xs py-1.5 px-2 bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 font-medium" data-id="${p.id}">Edit</button>
            <button class="btn-del-prod text-xs py-1.5 px-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium" data-id="${p.id}">Del</button>` : ''}
          </div>
        </div>
      </div>
    `
  }).join('')

  // Events
  document.querySelectorAll('.btn-adj').forEach(b => b.addEventListener('click', () => {
    document.getElementById('adj-prod-id').value = b.dataset.id
    document.getElementById('adj-prod-name').textContent = b.dataset.name
    document.getElementById('adj-current-stock').textContent = b.dataset.stock
    document.getElementById('adj-qty').value = 0
    document.getElementById('adj-reason').value = ''
    document.getElementById('adj-preview').classList.add('hidden')
    document.getElementById('modal-adjust').classList.remove('hidden')
  }))

  document.querySelectorAll('.btn-hist').forEach(b => b.addEventListener('click', async () => {
    document.getElementById('modal-history-title').textContent = `Stock History: ${b.dataset.name}`
    document.getElementById('modal-history').classList.remove('hidden')
    const hist = unwrap(await db.from('fnb_stock_history').select('*').eq('product_id', b.dataset.id).order('created_at', { ascending: false }).limit(50))
    document.getElementById('history-content').innerHTML = hist.length
      ? `<div class="overflow-x-auto"><table class="w-full text-sm">
          <thead><tr>
            <th class="table-th">Date</th><th class="table-th">Before</th><th class="table-th">After</th><th class="table-th">Diff</th><th class="table-th">By</th><th class="table-th">Note</th>
          </tr></thead>
          <tbody>${hist.map(h => `
            <tr class="hover:bg-gray-50">
              <td class="table-td text-xs">${fmtDateTime(h.created_at)}</td>
              <td class="table-td">${h.prev_stock}</td>
              <td class="table-td font-medium">${h.new_stock}</td>
              <td class="table-td font-semibold ${h.diff > 0 ? 'text-green-600' : 'text-red-600'}">${h.diff > 0 ? '+' : ''}${h.diff}</td>
              <td class="table-td text-xs">${h.changed_by}</td>
              <td class="table-td text-xs text-gray-500">${h.description || '-'}</td>
            </tr>
          `).join('')}</tbody>
        </table></div>`
      : '<p class="text-gray-400 text-center py-8">No history yet</p>'
  }))

  document.querySelectorAll('.btn-edit-prod').forEach(b => b.addEventListener('click', async () => {
    const p = unwrap(await db.from('fnb_stock').select('*').eq('id', b.dataset.id).single())
    if (p) openProductModal(p)
  }))

  document.querySelectorAll('.btn-del-prod').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this product?')) return
    unwrap(await db.from('fnb_stock').delete().eq('id', b.dataset.id))
    toast('Product deleted')
    loadStock(db)
  }))
}

function openProductModal(data = null) {
  document.getElementById('modal-product-title').textContent = data ? 'Edit Product' : 'Add Product'
  document.getElementById('prod-id').value = data?.id || ''
  document.getElementById('prod-name').value = data?.fnb_name || ''
  document.getElementById('prod-desc').value = data?.fnb_desc || ''
  document.getElementById('prod-price').value = data?.price || ''
  document.getElementById('prod-categ').value = data?.categ || 1
  document.getElementById('prod-stock').value = data?.stock || 0
  document.getElementById('prod-safety').value = data?.safety_stock || 0
  document.getElementById('prod-image-file').value = ''
  if (data?.fnb_image) {
    document.getElementById('prod-preview-img').src = data.fnb_image
    document.getElementById('prod-image-preview').classList.remove('hidden')
  } else {
    document.getElementById('prod-image-preview').classList.add('hidden')
  }
  document.getElementById('modal-product').classList.remove('hidden')
}

async function saveProduct(db) {
  const id = document.getElementById('prod-id').value
  const name = document.getElementById('prod-name').value.trim()
  const desc = document.getElementById('prod-desc').value.trim()
  const price = parseInt(document.getElementById('prod-price').value) || 0
  const categ = parseInt(document.getElementById('prod-categ').value)
  const stock = parseInt(document.getElementById('prod-stock').value) || 0
  const safety = parseInt(document.getElementById('prod-safety').value) || 0

  if (!name) { toast('Product name required', 'error'); return }
  if (price <= 0) { toast('Price must be greater than 0', 'error'); return }

  let imageData = ''
  const file = document.getElementById('prod-image-file').files[0]
  if (file) {
    imageData = await fileToBase64(file)
  } else if (id) {
    const existing = unwrap(await db.from('fnb_stock').select('fnb_image').eq('id', id).single())
    imageData = existing?.fnb_image || ''
  }

  if (id) {
    const old = unwrap(await db.from('fnb_stock').select('stock').eq('id', id).single())
    unwrap(await db.from('fnb_stock').update({
      fnb_name: name, fnb_desc: desc, price, categ, stock, safety_stock: safety, fnb_image: imageData
    }).eq('id', id))
    if (old && old.stock !== stock) {
      unwrap(await db.from('fnb_stock_history').insert({
        product_id: parseInt(id), prev_stock: old.stock, new_stock: stock,
        diff: stock - old.stock, changed_by: 'admin', description: 'Manual edit'
      }))
    }
    toast('Product updated')
  } else {
    const inserted = unwrap(await db.from('fnb_stock').insert({
      fnb_name: name, fnb_desc: desc, price, categ, stock, safety_stock: safety, fnb_image: imageData
    }).select('id').single())
    if (stock > 0) {
      unwrap(await db.from('fnb_stock_history').insert({
        product_id: inserted.id, prev_stock: 0, new_stock: stock,
        diff: stock, changed_by: 'admin', description: 'Initial stock'
      }))
    }
    toast('Product added')
  }

  document.getElementById('modal-product').classList.add('hidden')
  document.getElementById('stock-search').dispatchEvent(new Event('input'))
}

async function saveAdjustment(db) {
  const prodId = document.getElementById('adj-prod-id').value
  const diff = parseInt(document.getElementById('adj-qty').value) || 0
  const reason = document.getElementById('adj-reason').value.trim()

  if (diff === 0) { toast('Adjustment cannot be 0', 'error'); return }

  const product = unwrap(await db.from('fnb_stock').select('stock').eq('id', prodId).single())
  const prevStock = product.stock
  const newStock = prevStock + diff

  if (newStock < 0) { toast(`Insufficient stock. Current: ${prevStock}`, 'error'); return }

  unwrap(await db.from('fnb_stock').update({ stock: newStock }).eq('id', prodId))
  unwrap(await db.from('fnb_stock_history').insert({
    product_id: parseInt(prodId), prev_stock: prevStock, new_stock: newStock,
    diff, changed_by: 'admin', description: reason || 'Manual adjustment'
  }))

  toast(`Stock adjusted: ${prevStock} → ${newStock}`)
  document.getElementById('modal-adjust').classList.add('hidden')
  document.getElementById('stock-search').dispatchEvent(new Event('input'))
}
