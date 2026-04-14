const $ = (id) => document.getElementById(id);
const state = { rows: [], dragId: null };

function esc(v) {
  return String(v || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function resetForm() {
  $('mId').value = '';
  $('mKey').value = '';
  $('mName').value = '';
  $('mPath').value = '';
  $('mGroup').value = '业务功能';
  $('mSort').value = '100';
  $('mEnabled').value = '1';
  $('mMsg').textContent = '';
}

function groupedRows(rows) {
  const map = new Map();
  for (const r of rows) {
    const g = r.group_name || '业务功能';
    if (!map.has(g)) map.set(g, []);
    map.get(g).push(r);
  }
  return map;
}

function renderRows() {
  const rows = state.rows;
  const gmap = groupedRows(rows);
  const html = [];
  for (const [groupName, list] of gmap.entries()) {
    html.push(`<tr><td colspan="9" style="background:#eef6ff;font-weight:700;">分组：${esc(groupName)}</td></tr>`);
    for (const m of list) {
      html.push(`<tr draggable="true" data-id="${m.id}" data-group="${esc(groupName)}" class="drag-row">
        <td style="cursor:grab;">☰</td>
        <td>${m.id}</td>
        <td>${esc(m.group_name || '')}</td>
        <td>${esc(m.key)}</td>
        <td>${esc(m.name)}</td>
        <td>${esc(m.path)}</td>
        <td>${m.sort_no}</td>
        <td>${m.is_enabled ? '启用' : '禁用'}</td>
        <td><button class="btn-secondary" onclick="editMenu(${m.id})">编辑</button><button onclick="removeMenu(${m.id})">删除</button></td>
      </tr>`);
    }
  }

  $('menuRows').innerHTML = html.join('') || '<tr><td colspan="9">暂无数据</td></tr>';
  bindDragEvents();
}

function bindDragEvents() {
  const tbody = $('menuRows');
  const rows = Array.from(tbody.querySelectorAll('tr.drag-row'));

  rows.forEach((row) => {
    row.addEventListener('dragstart', () => {
      state.dragId = Number(row.dataset.id);
      row.style.opacity = '0.4';
    });
    row.addEventListener('dragend', () => {
      row.style.opacity = '';
      state.dragId = null;
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      const targetId = Number(row.dataset.id);
      const targetGroup = row.dataset.group;
      const drag = state.rows.find((x) => x.id === state.dragId);
      const target = state.rows.find((x) => x.id === targetId);
      if (!drag || !target) return;
      reorderAcrossGroups(drag.id, target.id, targetGroup);
      renderRows();
    });
  });
}

function reorderAcrossGroups(dragId, targetId, targetGroupName) {
  const drag = state.rows.find((r) => r.id === dragId);
  if (!drag) return;

  const targetGroup = targetGroupName || '业务功能';
  drag.group_name = targetGroup;

  const groupList = state.rows.filter((r) => (r.group_name || '业务功能') === targetGroup);
  const from = groupList.findIndex((r) => r.id === dragId);
  const to = groupList.findIndex((r) => r.id === targetId);
  if (from < 0 || to < 0) return;

  const [item] = groupList.splice(from, 1);
  groupList.splice(to, 0, item);

  const groups = new Map();
  for (const row of state.rows) {
    const g = row.group_name || '业务功能';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(row);
  }

  for (const [gName, list] of groups.entries()) {
    if (gName === targetGroup) {
      groups.set(gName, groupList);
    }
  }

  for (const list of groups.values()) {
    list.sort((a, b) => a.sort_no - b.sort_no || a.id - b.id);
    list.forEach((r, idx) => { r.sort_no = (idx + 1) * 10; });
  }

  state.rows = Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
    .flatMap(([, list]) => list);
}

async function loadRows() {
  const res = await apiFetch('/api/admin/menus');
  const data = await res.json();
  state.rows = data.rows || [];
  renderRows();
}

async function saveMenu() {
  const id = $('mId').value;
  const payload = {
    key: $('mKey').value.trim(),
    name: $('mName').value.trim(),
    path: $('mPath').value.trim(),
    group_name: $('mGroup').value.trim() || '业务功能',
    sort_no: Number($('mSort').value || 100),
    is_enabled: Number($('mEnabled').value || 1),
  };
  const url = id ? `/api/admin/menus/${id}` : '/api/admin/menus';
  const method = id ? 'PUT' : 'POST';
  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) {
    $('mMsg').textContent = data.message || '保存失败';
    return;
  }
  $('mMsg').textContent = '保存成功';
  await loadRows();
  if (!id) resetForm();
}

async function saveReorder() {
  const items = state.rows.map((r) => ({
    id: r.id,
    group_name: r.group_name || '业务功能',
    sort_no: r.sort_no,
  }));
  const res = await apiFetch('/api/admin/menus/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  const data = await res.json();
  if (!data.ok) {
    $('mMsg').textContent = data.message || '保存排序失败';
    return;
  }
  $('mMsg').textContent = '拖拽顺序已保存';
  await loadRows();
}

window.editMenu = function editMenu(id) {
  const m = state.rows.find((x) => x.id === id);
  if (!m) return;
  $('mId').value = m.id;
  $('mKey').value = m.key;
  $('mName').value = m.name;
  $('mPath').value = m.path;
  $('mGroup').value = m.group_name || '业务功能';
  $('mSort').value = m.sort_no;
  $('mEnabled').value = String(m.is_enabled);
};

window.removeMenu = async function removeMenu(id) {
  if (!confirm('确认删除该菜单？')) return;
  const res = await apiFetch(`/api/admin/menus/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!data.ok) {
    $('mMsg').textContent = data.message || '删除失败';
    return;
  }
  await loadRows();
};

async function bootstrap() {
  if (!requireAuth()) return;
  await loadRows();
  resetForm();
  $('btnSaveMenu').addEventListener('click', saveMenu);
  $('btnResetMenu').addEventListener('click', resetForm);
  $('btnSaveReorder').addEventListener('click', saveReorder);
}

bootstrap();
