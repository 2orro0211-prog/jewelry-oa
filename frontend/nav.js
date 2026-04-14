(async () => {
  if (!requireAuth()) return;

  const page = document.body.dataset.page;
  const menuWrap = document.getElementById('dynamicMenu');
  const userBox = document.getElementById('currentUser');
  const logoutBtn = document.getElementById('btnLogout');

  const localUser = getUser();
  if (userBox) userBox.textContent = `${localUser.username || '未登录'} (${localUser.role_name || '-'})`;
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  try {
    const meRes = await apiFetch('/api/auth/me');
    const meData = await meRes.json();
    if (meData.ok) {
      setUser(meData.user);
      if (userBox) userBox.textContent = `${meData.user.username} (${meData.user.role_name})`;
    }

    const res = await apiFetch('/api/nav/menus');
    const data = await res.json();
    if (!data.ok) return;

    if (menuWrap) {
      menuWrap.innerHTML = (data.rows || []).map((m) => {
        const active = m.key === page ? 'active' : '';
        return `<a class="menu-item ${active}" href="${m.path}">${m.name}</a>`;
      }).join('');
    }
  } catch (_) {
  }
})();
