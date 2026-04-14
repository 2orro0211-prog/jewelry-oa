const usernameEl = document.getElementById('username');
const passwordEl = document.getElementById('password');
const msgEl = document.getElementById('msg');

if (getToken()) {
  location.href = '/index.html';
}

async function doLogin() {
  const username = usernameEl.value.trim();
  const password = passwordEl.value;
  if (!username || !password) {
    msgEl.textContent = '请输入用户名和密码';
    return;
  }

  msgEl.textContent = '登录中...';
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();

  if (!data.ok) {
    msgEl.textContent = data.message || '登录失败';
    return;
  }

  setToken(data.token);
  setUser(data.user);
  location.href = '/index.html';
}

document.getElementById('btnLogin').addEventListener('click', doLogin);
passwordEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
