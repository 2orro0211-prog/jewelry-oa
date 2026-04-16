(async () => {
  if (!requireAuth()) return;

  const page = document.body.dataset.page;
  const menuWrap = document.getElementById('dynamicMenu');
  const sidebar = document.querySelector('.sidebar');
  const appShell = document.querySelector('.app-shell');
  const userBox = document.getElementById('currentUser');
  const logoutBtn = document.getElementById('btnLogout');
  const SIDEBAR_MODE_KEY = 'sidebar_mode_auto_hide';
  const MOBILE_BREAKPOINT = 1024;

  const localUser = getUser();
  if (userBox) userBox.textContent = `${localUser.username || '未登录'} (${localUser.role_name || '-'})`;

  function isCompactScreen() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  function isAutoHideMode() {
    return localStorage.getItem(SIDEBAR_MODE_KEY) === '1';
  }

  function openMobileSidebar() {
    if (!isCompactScreen()) return;
    document.body.classList.add('sidebar-open');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (backdrop) backdrop.classList.add('visible');
  }

  function closeMobileSidebar() {
    document.body.classList.remove('sidebar-open');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (backdrop) backdrop.classList.remove('visible');
  }

  function setAutoHideMode(enabled) {
    localStorage.setItem(SIDEBAR_MODE_KEY, enabled ? '1' : '0');
    if (isCompactScreen()) {
      document.body.classList.remove('sidebar-auto-hide', 'sidebar-hover-reveal');
      return;
    }
    document.body.classList.toggle('sidebar-auto-hide', enabled);
    if (!enabled) {
      document.body.classList.remove('sidebar-hover-reveal');
    }
  }

  function applySidebarMode() {
    if (isCompactScreen()) {
      document.body.classList.remove('sidebar-auto-hide', 'sidebar-hover-reveal');
      return;
    }
    setAutoHideMode(isAutoHideMode());
  }

  function syncResponsiveSidebarState() {
    document.body.classList.toggle('sidebar-compact', isCompactScreen());
    if (isCompactScreen()) {
      document.body.classList.remove('sidebar-auto-hide', 'sidebar-hover-reveal');
      closeMobileSidebar();
      return;
    }
    closeMobileSidebar();
    applySidebarMode();
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
    btn.innerHTML = '<span class="sidebar-mode-icon"></span>';
    sidebar.prepend(btn);
    btn.addEventListener('click', () => {
      if (isCompactScreen()) return;
      const nextAuto = !isAutoHideMode();
      setAutoHideMode(nextAuto);
    });
  }

  function ensureMobileSidebarControls() {
    if (!document.getElementById('mobileNavToggle')) {
      const btn = document.createElement('button');
      btn.id = 'mobileNavToggle';
      btn.className = 'mobile-nav-toggle';
      btn.type = 'button';
      btn.title = '打开菜单';
      btn.setAttribute('aria-label', '打开菜单');
      btn.addEventListener('click', () => {
        if (document.body.classList.contains('sidebar-open')) closeMobileSidebar();
        else openMobileSidebar();
      });
      document.body.appendChild(btn);
    }

    if (!document.getElementById('sidebarBackdrop')) {
      const backdrop = document.createElement('div');
      backdrop.id = 'sidebarBackdrop';
      backdrop.className = 'sidebar-backdrop';
      backdrop.addEventListener('click', closeMobileSidebar);
      document.body.appendChild(backdrop);
    }
  }

  function ensureEdgeHotzone() {
    if (document.getElementById('sidebarEdgeHotzone')) return;
    const zone = document.createElement('div');
    zone.id = 'sidebarEdgeHotzone';
    zone.className = 'sidebar-edge-hotzone';
    document.body.appendChild(zone);
    zone.addEventListener('mouseenter', () => {
      if (isCompactScreen()) return;
      if (!isAutoHideMode()) return;
      document.body.classList.add('sidebar-hover-reveal');
    });
  }

  function bindAutoHideEvents() {
    if (!sidebar) return;
    sidebar.addEventListener('mouseleave', () => {
      if (isCompactScreen()) return;
      if (!isAutoHideMode()) return;
      document.body.classList.remove('sidebar-hover-reveal');
    });
    sidebar.addEventListener('mouseenter', () => {
      if (isCompactScreen()) return;
      if (!isAutoHideMode()) return;
      document.body.classList.add('sidebar-hover-reveal');
    });
    if (appShell) {
      appShell.addEventListener('mouseleave', () => {
        if (isCompactScreen()) return;
        if (!isAutoHideMode()) return;
        document.body.classList.remove('sidebar-hover-reveal');
      });
    }
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      closeMobileSidebar();
      await logout();
    });
  }

  ensureSidebarToggleButton();
  ensureMobileSidebarControls();
  ensureEdgeHotzone();
  bindAutoHideEvents();
  syncResponsiveSidebarState();

  window.addEventListener('resize', syncResponsiveSidebarState);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobileSidebar();
  });

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

      menuWrap.addEventListener('click', (e) => {
        const target = e.target.closest('a.menu-item');
        if (target) closeMobileSidebar();
      });
    }
  } catch (_) {
  }
})();
