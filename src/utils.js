export function idr(n) {
  return 'Rp ' + Number(n).toLocaleString('id-ID')
}

export function fmtDate(str) {
  if (!str) return '-'
  return new Date(str).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtDateTime(str) {
  if (!str) return '-'
  return new Date(str).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function toast(msg, type = 'success') {
  const el = document.getElementById('toast')
  const msgEl = document.getElementById('toast-msg')
  if (!el || !msgEl) return
  msgEl.textContent = msg
  el.firstElementChild.className = `px-5 py-3 rounded-xl shadow-lg text-sm flex items-center gap-2 ${type === 'error' ? 'bg-red-600' : type === 'warning' ? 'bg-yellow-500' : 'bg-gray-900'} text-white`
  el.classList.remove('hidden')
  clearTimeout(el._t)
  el._t = setTimeout(() => el.classList.add('hidden'), 3000)
}

export function confirm(msg) {
  return window.confirm(msg)
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function now() {
  const d = new Date()
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

export function addHours(dateStr, hours) {
  const d = new Date(dateStr)
  d.setHours(d.getHours() + hours)
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

export function debounce(fn, delay = 300) {
  let t
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay) }
}

// Simple modal helper
export function openModal(id) {
  document.getElementById(id)?.classList.remove('hidden')
}
export function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden')
}
