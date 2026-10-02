const loginForm = document.querySelector('#loginForm')
const loginTitle = document.querySelector('#loginTitle')
const loginIntro = document.querySelector('#loginIntro')
const loginMessage = document.querySelector('#loginMessage')
const passwordInput = document.querySelector('#password')
const submitLogin = document.querySelector('#submitLogin')
const setupNote = document.querySelector('#setupNote')
let setupRequired = false
const authApiBase =
  window.location.port === '3000'
    ? ''
    : `${window.location.protocol}//${window.location.hostname}:3000`

async function initializeLogin() {
  try {
    const response = await fetch(`${authApiBase}/api/auth/status`, {
      credentials: 'include',
    })
    const result = await response.json()
    setupRequired = Boolean(result.setupRequired)
    if (setupRequired) {
      loginTitle.textContent = 'Tạo tài khoản quản trị'
      loginIntro.textContent = 'Thiết lập tài khoản admin đầu tiên cho hệ thống.'
      passwordInput.autocomplete = 'new-password'
      passwordInput.minLength = 12
      passwordInput.setAttribute('aria-describedby', 'setupNote')
      submitLogin.textContent = 'Tạo tài khoản và đăng nhập'
      setupNote.classList.remove('hidden')
    }
    document.querySelector('#username').focus()
  } catch {
    loginMessage.textContent = 'Không kết nối được máy chủ. Hãy chạy npm start rồi tải lại trang.'
    submitLogin.disabled = true
  }
}

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
