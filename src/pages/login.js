import { signIn } from '../auth.js'

export function renderLogin(container, onSuccess) {
  container.innerHTML = `
    <div class="flex items-center justify-center min-h-screen bg-[#f4f4f5] dark:bg-[#24242a]">
      <div class="w-full max-w-sm">
        <div class="modal-box p-8 space-y-6">
          <div class="text-center">
            <img src="./assets/logo-dark.PNG" alt="Clubhouse" class="h-12 w-auto mx-auto mb-4 dark:hidden" onerror="this.style.display='none'"/>
            <img src="./assets/logo-light.png" alt="Clubhouse" class="h-12 w-auto mx-auto mb-4 hidden dark:block" onerror="this.style.display='none'"/>
            <p class="text-sm text-gray-500 dark:text-zinc-400">Sign in to your account</p>
          </div>

          <div class="space-y-4">
            <div>
              <label class="form-label">Role</label>
              <div class="flex rounded-xl overflow-hidden border border-gray-200 dark:border-white/10">
                <button id="role-manager" data-role="manager"
                  class="role-btn flex-1 py-2 text-sm font-medium bg-orange-500 text-white transition-colors">
                  Manager
                </button>
                <button id="role-staff" data-role="staff"
                  class="role-btn flex-1 py-2 text-sm font-medium text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                  Staff
                </button>
              </div>
            </div>
            <div>
              <label class="form-label">Password</label>
              <input type="password" id="login-password" class="form-input" placeholder="••••••••" autocomplete="current-password"/>
            </div>
            <div id="login-error" class="hidden text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5"></div>
            <button id="btn-login" class="btn-primary w-full justify-center py-2.5 text-base">
              Sign In
            </button>
          </div>
        </div>
        <p class="text-center text-xs text-gray-400 dark:text-zinc-600 mt-4">Clubhouse Management System</p>
      </div>
    </div>
  `

  let selectedRole = 'manager'

  document.querySelectorAll('.role-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedRole = btn.dataset.role
      document.querySelectorAll('.role-btn').forEach(b => {
        const active = b.dataset.role === selectedRole
        b.className = `role-btn flex-1 py-2 text-sm font-medium transition-colors ${
          active
            ? 'bg-orange-500 text-white'
            : 'text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-white/5'
        }`
      })
    })
  })

  const passEl = document.getElementById('login-password')
  const errorEl = document.getElementById('login-error')
  const btnEl = document.getElementById('btn-login')

  async function attemptLogin() {
    const password = passEl.value
    if (!password) {
      showError('Please enter your password.')
      return
    }
    btnEl.disabled = true
    btnEl.textContent = 'Signing in...'
    errorEl.classList.add('hidden')
    try {
      const session = await signIn(selectedRole, password)
      onSuccess(session)
    } catch (err) {
      showError(err.message)
      btnEl.disabled = false
      btnEl.textContent = 'Sign In'
    }
  }

  function showError(msg) {
    errorEl.textContent = msg
    errorEl.classList.remove('hidden')
  }

  btnEl.addEventListener('click', attemptLogin)
  passEl.addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin() })
}
