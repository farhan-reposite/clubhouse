import './style.css'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getDb } from './db.js'
import { getSession, signOut } from './auth.js'
import { renderLogin } from './pages/login.js'
import { renderDashboard } from './pages/dashboard.js'
import { renderFnb } from './pages/fnb.js'
import { renderRacket } from './pages/racket.js'
import { renderStock } from './pages/stock.js'
import { renderMembers } from './pages/members.js'
import { renderTransaction } from './pages/transaction.js'
import { renderReport } from './pages/report.js'

// Pages accessible by role
const pages = {
  dashboard: { title: 'Dashboard',         render: renderDashboard, roles: ['manager'] },
  fnb:       { title: 'F&B POS',           render: renderFnb,       roles: ['manager', 'staff'] },
  racket:    { title: 'Racket Management', render: renderRacket,    roles: ['manager', 'staff'] },
  stock:     { title: 'Stock F&B',         render: renderStock,     roles: ['manager', 'staff'] },
  members:   { title: 'Members',           render: renderMembers,   roles: ['manager'] },
  transaction: { title: 'Transaction History', render: renderTransaction, roles: ['manager', 'staff'] },
  report:    { title: 'Report',            render: renderReport,    roles: ['manager'] },
}

let currentPage = null
let db = null
let currentRole = null  // { role: 'manager'|'staff', display_name: string }
let currentUser = null

async function navigate(hash) {
  const page = hash.replace('#', '') || (currentRole?.role === 'staff' ? 'fnb' : 'dashboard')
  const pageDef = pages[page]

  if (!pageDef || !pageDef.roles.includes(currentRole?.role)) {
    const fallback = currentRole?.role === 'staff' ? 'fnb' : 'dashboard'
    return navigate('#' + fallback)
  }

  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page)
  })
  document.getElementById('page-title').textContent = pageDef.title

  const content = document.getElementById('app-content')
  content.innerHTML = `<div class="flex items-center justify-center h-64"><div class="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div></div>`
  currentPage = page
  await pageDef.render(content, db, currentRole.role)
}

function applyNavVisibility(role) {
  document.querySelectorAll('.nav-link').forEach(a => {
    const page = a.dataset.page
    const allowed = pages[page]?.roles.includes(role)
    a.classList.toggle('hidden', !allowed)
  })
}

function showApp(session) {
  currentUser = session.user
  currentRole = session.role

  // Show app shell, hide login wrapper
  document.getElementById('app-shell').classList.remove('hidden')
  document.getElementById('app-shell').classList.add('flex')
  document.getElementById('login-wrapper').classList.add('hidden')

  // Show user info + logout in sidebar
  document.getElementById('sidebar-user-name').textContent = session.role.display_name || session.user.email
  document.getElementById('sidebar-user-role').textContent = session.role.role === 'manager' ? 'Manager' : 'Staff'

  applyNavVisibility(session.role.role)

  // Navigate to default page
  const hash = window.location.hash
  const page = hash.replace('#', '')
  const target = page && pages[page]?.roles.includes(session.role.role) ? hash : (session.role.role === 'staff' ? '#fnb' : '#dashboard')
  navigate(target)
}

async function init() {
  document.getElementById('current-date').textContent = new Date().toLocaleDateString('id-ID', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric'
  })

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark')
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  })

  await initWindowControls()

  db = await getDb()

  // Check existing session
  const session = await getSession().catch(() => null)
  if (session) {
    showApp(session)
  } else {
    document.getElementById('login-wrapper').classList.remove('hidden')
    document.getElementById('app-shell').classList.add('hidden')
    renderLogin(document.getElementById('login-wrapper'), (s) => showApp(s))
  }

  // Navigation
  window.addEventListener('hashchange', () => {
    if (currentRole) navigate(window.location.hash)
  })

  // Logout
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await signOut()
    currentRole = null
    currentUser = null
    document.getElementById('app-shell').classList.add('hidden')
    document.getElementById('login-wrapper').classList.remove('hidden')
    renderLogin(document.getElementById('login-wrapper'), (s) => showApp(s))
    window.location.hash = ''
  })
}

async function initWindowControls() {
  const appWin = getCurrentWindow()
  let isFs = await appWin.isFullscreen()
  updateFullscreenUI(isFs)

  await appWin.onResized(async () => {
    isFs = await appWin.isFullscreen()
    updateFullscreenUI(isFs)
  })

  function updateFullscreenUI(fullscreen) {
    document.getElementById('icon-topbar-expand').classList.toggle('hidden', fullscreen)
    document.getElementById('icon-topbar-compress').classList.toggle('hidden', !fullscreen)
  }

  document.getElementById('topbar-fullscreen-btn').addEventListener('click', async () => {
    isFs = !isFs
    await appWin.setFullscreen(isFs)
    updateFullscreenUI(isFs)
  })

  document.getElementById('topbar-minimize-btn').addEventListener('click', () => appWin.minimize())
  document.getElementById('topbar-close-btn').addEventListener('click', () => appWin.close())
}

init().catch(err => {
  document.getElementById('app-content').innerHTML = `
    <div class="flex flex-col items-center justify-center h-full gap-4">
      <div class="text-red-500 text-6xl">⚠️</div>
      <p class="text-red-600 font-semibold">Failed to initialize</p>
      <pre class="text-xs text-gray-500 bg-gray-100 p-4 rounded-lg">${err.message}</pre>
    </div>
  `
})
