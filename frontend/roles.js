const $ = (id) => document.getElementById(id);
const state = { roles: [], perms: [], menus: [] };

function esc(v) {
  return String(v || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function checkedIds(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map((el) => Number(el.value));
}

function resetForm() {
  $('rId').value = '';
  $('rCode').value = '';
  $('rName').value = '';
  $('rRemark').value = '';
  document.querySelectorAll('input[name="perm"]').forEach((el) => { el.checked = false; });
  document.querySelectorAll('input[name="menu"]').forEach((el) => { el.checked = false; });
  $('rMsg').textContent = '';
}

async function loadMeta() {
  const res = await apiFetch('/api/admin/options');
  const data = await res.json();
  state.perms = data.permissions || [];
  state.menus = data.menus || [];
  $('permChecks').innerHTML = state.perms.map((p) => `<label class="menu-item" style="background:#f8fafc;color:#111827;"><input type="checkbox" name="perm" value="${p.id}" /> ${esc(p.name)}</label>`).join('');
  $('menuChecks').innerHTML = state.menus.map((m) => `<label class="menu-item" style="background:#f8fafc;color:#111827;"><input type="checkbox" name="menu" value="${m.id}" /> ${esc(m.name)}</label>`).join('');
}

async function loadRoles() {
  const res = await apiFetch('/api/admin/roles');
  const data = await res.json();
  state.roles = data.rows || [];
  $('roleRows').innerHTML = state.roles.map((r) => `<tr>
    <td>${r.id}</td><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td>${esc(r.remark || '')}</td>
    <td><button class="btn-secondary" onclick="editRole(${r.id})">编辑</button><button onclick="removeRole(${r.id})">删除</button></td>
  </tr>`).join('') || '<tr><td colspan="5">暂无数据</td></tr>';
}

async function saveRole() {
  const id = $('rId').value;
  const payload = {
    code: $('rCode').value.trim(),
    name: $('rName').value.trim(),
    remark: $('rRemark').value.trim(),
    permission_ids: checkedIds('perm'),
    menu_item_ids: checkedIds('menu'),
  };

  const url = id ? `/api/admin/roles/${id}` : '/api/admin/roles';
  const method = id ? 'PUT' : 'POST';
  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) {
    $('rMsg').textContent = data.message || '保存失败';
    return;
  }
  $('rMsg').textContent = '保存成功';
  await loadRoles();
  if (!id) resetForm();
}

window.editRole = function editRole(id) {
  const role = state.roles.find((x) => x.id === id);
  if (!role) return;
  $('rId').value = role.id;
  $('rCode').value = role.code;
  $('rName').value = role.name;
  $('rRemark').value = role.remark || '';

  const permSet = new Set(role.permission_ids || []);
  const menuSet = new Set(role.menu_item_ids || []);
  document.querySelectorAll('input[name="perm"]').forEach((el) => { el.checked = permSet.has(Number(el.value)); });
  document.querySelectorAll('input[name="menu"]').forEach((el) => { el.checked = menuSet.has(Number(el.value)); });
};

window.removeRole = async function removeRole(id) {
  if (!confirm('确认删除该角色？')) return;
  const res = await apiFetch(`/api/admin/roles/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!data.ok) {
    $('rMsg').textContent = data.message || '删除失败';
    return;
  }
  await loadRoles();
};

async function bootstrap() {
  if (!requireAuth()) return;
  await loadMeta();
  await loadRoles();
  resetForm();
  $('btnSaveRole').addEventListener('click', saveRole);
  $('btnResetRole').addEventListener('click', resetForm);
}

bootstrap();
