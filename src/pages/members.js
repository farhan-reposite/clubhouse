import { toast, confirm, now, fileToBase64, fmtDate } from '../utils.js'
import { unwrap } from '../db.js'

export async function renderMembers(container, db, role = 'manager') {
  container.innerHTML = `
    <div class="space-y-5">
      <div class="card p-0 overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 class="text-lg font-semibold text-gray-800">Member List</h3>
            <p class="text-sm text-gray-500">Manage active and inactive members</p>
          </div>
          <button id="btn-add-member" class="btn-primary flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Add Member
          </button>
        </div>
        <div class="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
          <input type="text" id="member-search" placeholder="Search member name..." class="form-input max-w-xs"/>
          <select id="member-status-filter" class="form-input w-40">
            <option value="">All Status</option>
            <option value="0">Active</option>
            <option value="1">Non-Active</option>
          </select>
        </div>
        <div id="members-table" class="p-5"></div>
      </div>
    </div>

    <!-- Add/Edit Modal -->
    <div id="modal-member" class="modal-overlay hidden">
      <div class="modal-box">
        <div class="modal-header">
          <h3 id="modal-member-title" class="font-semibold">Add Member</h3>
          <button class="modal-close text-white/80 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div class="p-6 space-y-4">
          <input type="hidden" id="member-id"/>
          <div class="flex flex-col items-center gap-3">
            <div id="member-img-preview" class="w-20 h-20 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-2xl font-bold overflow-hidden border-2 border-orange-200">
              <span id="member-img-initial">?</span>
            </div>
            <label class="btn-secondary text-xs cursor-pointer">
              Change Photo
              <input type="file" id="member-image" accept="image/*" class="hidden"/>
            </label>
          </div>
          <div>
            <label class="form-label">Member Name <span class="text-red-500">*</span></label>
            <input type="text" id="member-name" class="form-input" placeholder="Enter member name"/>
          </div>
          <div>
            <label class="form-label">Status</label>
            <select id="member-status" class="form-input">
              <option value="0">Active</option>
              <option value="1">Non-Active</option>
            </select>
          </div>
          <div class="flex gap-3 pt-2">
            <button id="btn-save-member" class="btn-primary flex-1">Save</button>
            <button class="btn-secondary modal-close flex-1">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  `

  document.getElementById('btn-add-member').addEventListener('click', () => openMemberModal())
  document.getElementById('member-search').addEventListener('input', () => loadMembers(db))
  document.getElementById('member-status-filter').addEventListener('change', () => loadMembers(db))
  document.querySelectorAll('#modal-member .modal-close').forEach(b => b.addEventListener('click', () => closeMemberModal()))
  document.getElementById('btn-save-member').addEventListener('click', () => saveMember(db))
  document.getElementById('member-name').addEventListener('input', e => {
    const initial = e.target.value.charAt(0).toUpperCase() || '?'
    const span = document.getElementById('member-img-initial')
    if (span) span.textContent = initial
  })
  document.getElementById('member-image').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return
    const b64 = await fileToBase64(f)
    const preview = document.getElementById('member-img-preview')
    preview.innerHTML = `<img src="${b64}" class="w-full h-full object-cover"/>`
  })

  await loadMembers(db)
}

async function loadMembers(db) {
  const search = document.getElementById('member-search')?.value?.trim() || ''
  const statusFilter = document.getElementById('member-status-filter')?.value

  let query = db.from('members').select('*')
  if (search) query = query.ilike('member_name', `%${search}%`)
  if (statusFilter !== '') query = query.eq('status', parseInt(statusFilter))
  query = query.order('member_name', { ascending: true })

  const rows = unwrap(await query)

  const esc = s => (s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))

  const tbody = rows.map(m => {
    const imgHtml = m.image
      ? `<img src="${m.image}" class="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-gray-200"/>`
      : `<div class="w-9 h-9 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-sm font-bold flex-shrink-0">${(m.member_name||'?').charAt(0).toUpperCase()}</div>`
    return `
    <tr class="hover:bg-gray-50">
      <td class="table-td">
        <div class="flex items-center gap-3">
          ${imgHtml}
          <span class="font-medium">${esc(m.member_name)}</span>
        </div>
      </td>
      <td class="table-td">
        <span class="${m.status === 0 ? 'badge-green' : 'badge-gray'}">${m.status === 0 ? 'Active' : 'Non-Active'}</span>
      </td>
      <td class="table-td text-gray-400 text-xs">${fmtDate(m.created_at)}</td>
      <td class="table-td">
        <div class="flex items-center gap-2">
          <button class="btn-toggle text-xs px-3 py-1 rounded-lg font-medium border transition-colors ${m.status === 0 ? 'border-yellow-300 text-yellow-700 hover:bg-yellow-50' : 'border-green-300 text-green-700 hover:bg-green-50'}" data-id="${m.id}" data-status="${m.status}">
            ${m.status === 0 ? 'Deactivate' : 'Activate'}
          </button>
          <button class="btn-edit-member text-xs px-3 py-1 rounded-lg font-medium border border-blue-300 text-blue-700 hover:bg-blue-50" data-id="${m.id}" data-name="${esc(m.member_name)}" data-status="${m.status}" data-image="${m.image||''}">Edit</button>
          <button class="btn-del-member text-xs px-3 py-1 rounded-lg font-medium border border-red-300 text-red-600 hover:bg-red-50" data-id="${m.id}">Delete</button>
        </div>
      </td>
    </tr>
  `}).join('')

  document.getElementById('members-table').innerHTML = `
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr>
            <th class="table-th">Name</th>
            <th class="table-th">Status</th>
            <th class="table-th">Joined</th>
            <th class="table-th">Actions</th>
          </tr>
        </thead>
        <tbody>${tbody || '<tr><td colspan="4" class="table-td text-center text-gray-400 py-8">No members found</td></tr>'}</tbody>
      </table>
    </div>
    <p class="text-xs text-gray-400 mt-3">${rows.length} member(s) found</p>
  `

  // Events
  document.querySelectorAll('.btn-toggle').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.id
    const newStatus = b.dataset.status == 0 ? 1 : 0
    unwrap(await db.from('members').update({ status: newStatus, edited_at: now() }).eq('id', id))
    toast(newStatus === 0 ? 'Member activated' : 'Member deactivated')
    loadMembers(db)
  }))

  document.querySelectorAll('.btn-edit-member').forEach(b => b.addEventListener('click', () => {
    openMemberModal({ id: b.dataset.id, member_name: b.dataset.name, status: parseInt(b.dataset.status), image: b.dataset.image })
  }))

  document.querySelectorAll('.btn-del-member').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this member?')) return
    unwrap(await db.from('members').delete().eq('id', b.dataset.id))
    toast('Member deleted')
    loadMembers(db)
  }))
}

function openMemberModal(data = null) {
  document.getElementById('modal-member-title').textContent = data ? 'Edit Member' : 'Add Member'
  document.getElementById('member-id').value = data?.id || ''
  document.getElementById('member-name').value = data?.member_name || ''
  document.getElementById('member-status').value = data?.status ?? 0
  document.getElementById('member-image').value = ''

  const preview = document.getElementById('member-img-preview')
  const initial = (data?.member_name || '?').charAt(0).toUpperCase()
  if (data?.image) {
    preview.innerHTML = `<img src="${data.image}" class="w-full h-full object-cover"/>`
  } else {
    preview.innerHTML = `<span id="member-img-initial">${initial}</span>`
  }

  document.getElementById('modal-member').classList.remove('hidden')
}

function closeMemberModal() {
  document.getElementById('modal-member').classList.add('hidden')
}

async function saveMember(db) {
  const id = document.getElementById('member-id').value
  const name = document.getElementById('member-name').value.trim()
  const status = parseInt(document.getElementById('member-status').value)

  if (!name) { toast('Member name is required', 'error'); return }

  // Resolve image: new file > existing (from preview img src) > ''
  let image = ''
  const file = document.getElementById('member-image').files[0]
  if (file) {
    image = await fileToBase64(file)
  } else if (id) {
    const previewImg = document.querySelector('#member-img-preview img')
    image = previewImg ? previewImg.src : ''
  }

  if (id) {
    unwrap(await db.from('members').update({ member_name: name, status, image, edited_at: now() }).eq('id', id))
    toast('Member updated')
  } else {
    unwrap(await db.from('members').insert({ member_name: name, status, image }))
    toast('Member added')
  }

  closeMemberModal()
  // Trigger reload
  document.getElementById('member-search').dispatchEvent(new Event('input'))
}
