(async () => {
  if (!requireAuth()) return;

  const page = document.body.dataset.page;
  const menuWrap = document.getElementById('dynamicMenu');
  const sidebar = document.querySelector('.sidebar');
  const appShell = document.querySelector('.app-shell');
  const userBox = document.getElementById('currentUser');
  const logoutBtn = document.getElementById('btnLogout');
  const SIDEBAR_MODE_KEY = 'sidebar_mode_auto_hide';

  const localUser = getUser();
  if (userBox) userBox.textContent = `${localUser.username || '未登录'} (${localUser.role_name || '-'})`;
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  function isAutoHideMode() {
    return localStorage.getItem(SIDEBAR_MODE_KEY) === '1';
  }

  function setAutoHideMode(enabled) {
    localStorage.setItem(SIDEBAR_MODE_KEY, enabled ? '1' : '0');
    document.body.classList.toggle('sidebar-auto-hide', enabled);
    if (!enabled) {
      document.body.classList.remove('sidebar-hover-reveal');
    }
  }

  function applySidebarMode() {
    setAutoHideMode(isAutoHideMode());
  }

  function ensureSidebarToggleButton() {
    if (!sidebar) return;
    if (sidebar.querySelector('#btnSidebarMode')) return;
    const btn = document.createElement('button');
    btn.id = 'btnSidebarMode';
    btn.className = 'sidebar-mode-btn';
    btn.type = 'button';
    btn.title = '切换菜单自动隐藏';
    btn.setAttribute('aria-label', '切换菜单自动隐藏');
    btn.innerHTML = '<span class=\"sidebar-mode-icon\"></span>';
    sidebar.prepend(btn);
    btn.addEventListener('click', () => {
      const nextAuto = !isAutoHideMode();
      setAutoHideMode(nextAuto);
    });
  }

  function ensureEdgeHotzone() {
    if (document.getElementById('sidebarEdgeHotzone')) return;
    const zone = document.createElement('div');
    zone.id = 'sidebarEdgeHotzone';
    zone.className = 'sidebar-edge-hotzone';
    document.body.appendChild(zone);
    zone.addEventListener('mouseenter', () => {
      if (!isAutoHideMode()) return;
      document.body.classList.add('sidebar-hover-reveal');
    });
  }

  function bindAutoHideEvents() {
    if (!sidebar) return;
    sidebar.addEventListener('mouseleave', () => {
      if (!isAutoHideMode()) return;
      document.body.classList.remove('sidebar-hover-reveal');
    });
    sidebar.addEventListener('mouseenter', () => {
      if (!isAutoHideMode()) return;
      document.body.classList.add('sidebar-hover-reveal');
    });
    if (appShell) {
      appShell.addEventListener('mouseleave', () => {
        if (!isAutoHideMode()) return;
        document.body.classList.remove('sidebar-hover-reveal');
      });
    }
  }

  ensureSidebarToggleButton();
  ensureEdgeHotzone();
  bindAutoHideEvents();
  applySidebarMode();

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
