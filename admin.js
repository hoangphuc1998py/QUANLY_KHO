const loginForm = document.querySelector('#loginForm')
const loginTitle = document.querySelector('#loginTitle')
const loginIntro = document.querySelector('#loginIntro')
const loginMessage = document.querySelector('#loginMessage')
const passwordInput = document.querySelector('#password')
const submitLogin = document.querySelector('#submitLogin')
const setupNote = document.querySelector('#setupNote')
const loginScene = document.querySelector('#loginScene')
const loginPanel = document.querySelector('#loginPanel')
const lampPull = document.querySelector('#lampPull')
const pullHint = document.querySelector('#pullHint')
let setupRequired = false
const authApiBase =
  window.location.port === '8888'
    ? ''
    : `${window.location.protocol}//${window.location.hostname || 'localhost'}:8888`

async function initializeLogin() {
  try {
    const response = await fetch(`${authApiBase}/api/auth/status`, {
      credentials: 'include',
    })
    const result = await response.json()
    setupRequired = Boolean(result.setupRequired)
    if (setupRequired) {
      loginTitle.textContent = 'Chào mừng'
      loginIntro.textContent = 'Thiết lập tài khoản admin đầu tiên cho hệ thống.'
      passwordInput.autocomplete = 'new-password'
      passwordInput.minLength = 12
      passwordInput.setAttribute('aria-describedby', 'setupNote')
      submitLogin.textContent = 'Tạo tài khoản và đăng nhập'
      setupNote.classList.remove('hidden')
    }
  } catch {
    loginMessage.textContent = 'Không kết nối được máy chủ. Hãy chạy npm start rồi tải lại trang.'
    submitLogin.disabled = true
  }
}

function revealLogin() {
  if (loginScene.classList.contains('is-open')) return
  loginScene.classList.add('is-open')
  loginPanel.inert = false
  lampPull.setAttribute('aria-expanded', 'true')
  pullHint.textContent = 'Biểu mẫu đăng nhập đã mở'
  window.setTimeout(() => document.querySelector('#username').focus(), 450)
}

function hideLogin() {
  if (!loginScene.classList.contains('is-open')) return
  loginScene.classList.remove('is-open')
  loginPanel.inert = true
  lampPull.setAttribute('aria-expanded', 'false')
  pullHint.textContent = 'Kéo dây đèn để đăng nhập'
  lampPull.focus()
}

function toggleLogin() {
  if (loginScene.classList.contains('is-open')) hideLogin()
  else revealLogin()
}

let pullStartY = null
let suppressPullClick = false
lampPull.addEventListener('pointerdown', event => {
  pullStartY = event.clientY
  lampPull.setPointerCapture(event.pointerId)
})
lampPull.addEventListener('pointerup', event => {
  if (pullStartY !== null) {
    const movement = event.clientY - pullStartY
    if (movement > 5) {
      revealLogin()
      suppressPullClick = true
    } else if (movement < -5) {
      hideLogin()
      suppressPullClick = true
    }
  }
  pullStartY = null
})
lampPull.addEventListener('pointercancel', () => { pullStartY = null })
lampPull.addEventListener('click', () => {
  if (suppressPullClick) {
    suppressPullClick = false
    return
  }
  toggleLogin()
})

loginForm.addEventListener('submit', async event => {
  event.preventDefault()
  loginMessage.textContent = ''
  submitLogin.disabled = true
  submitLogin.textContent = setupRequired ? 'Đang tạo tài khoản...' : 'Đang đăng nhập...'
  const endpoint = setupRequired ? '/api/auth/setup' : '/api/auth/login'
  try {
    const response = await fetch(`${authApiBase}${endpoint}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.querySelector('#username').value.trim(),
        password: passwordInput.value,
      }),
    })
    const result = await response.json()
    if (!response.ok || !result.success) throw new Error(result.error || 'Không thể đăng nhập.')
    window.location.replace(authApiBase ? `${authApiBase}/` : '/')
  } catch (error) {
    loginMessage.textContent = error.message || 'Không thể kết nối máy chủ.'
    submitLogin.disabled = false
    submitLogin.textContent = setupRequired ? 'Tạo tài khoản và đăng nhập' : 'Đăng nhập'
  }
})

initializeLogin()
