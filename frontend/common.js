const TOKEN_KEY = 'oa_token';
const USER_KEY = 'oa_user';

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function setUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || '{}');
  } catch (_) {
    return {};
  }
}

function isLoginPage() {
  return location.pathname.endsWith('/login.html') || location.pathname === '/';
}

function redirectToLogin() {
  if (!isLoginPage()) location.href = '/login.html';
}

function requireAuth() {
  const token = getToken();
  if (!token) {
    redirectToLogin();
    return false;
  }
  return true;
}

async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    clearAuth();
    redirectToLogin();
    throw new Error('未登录或登录过期');
  }
  return res;
}

async function logout() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch (_) {
  }
  clearAuth();
  location.href = '/login.html';
}
