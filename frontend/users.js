const $ = (id) => document.getElementById(id);
const state = { roles: [], users: [] };

function esc(v) {
  return String(v || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function resetForm() {
  $('uId').value = '';
  $('uUsername').value = '';
  $('uPassword').value = '';
  $('uRole').value = '';
  $('uStatus').value = '1';
  $('uMsg').textContent = '';
}

async function loadRoles() {
  const res = await apiFetch('/api/admin/options');
  const data = await res.json();
  state.roles = data.roles || [];
  $('uRole').innerHTML = '<option value="">选择角色</option>' + state.roles.map((r) => `<option value="${r.id}">${esc(r.name)}(${esc(r.code)})</option>`).join('');
}

async function loadUsers() {
  const res = await apiFetch('/api/admin/users');
  const data = await res.json();
  state.users = data.rows || [];
  $('userRows').innerHTML = state.users.map((u) => `<tr>
    <td>${u.id}</td><td>${esc(u.username)}</td><td>${esc(u.role_name)}</td><td>${u.status ? '启用' : '禁用'}</td><td>${esc(u.created_at || '')}</td>
    <td><button class="btn-secondary" onclick="editUser(${u.id})">编辑</button><button onclick="removeUser(${u.id})">删除</button></td>
  </tr>`).join('') || '<tr><td colspan="6">暂无数据</td></tr>';
}

async function saveUser() {
  const id = $('uId').value;
  const payload = {
    username: $('uUsername').value.trim(),
    password: $('uPassword').value,
    role_id: Number($('uRole').value || 0),
    status: Number($('uStatus').value || 1),
  };

  const url = id ? `/api/admin/users/${id}` : '/api/admin/users';
  const method = id ? 'PUT' : 'POST';
  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) {
    $('uMsg').textContent = data.message || '保存失败';
    return;
  }
  $('uMsg').textContent = '保存成功';
  await loadUsers();
  if (!id) resetForm();
}

window.editUser = function editUser(id) {
  const u = state.users.find((x) => x.id === id);
  if (!u) return;
  $('uId').value = u.id;
  $('uUsername').value = u.username;
  $('uPassword').value = '';
  $('uRole').value = u.role_id;
  $('uStatus').value = String(u.status);
};

window.removeUser = async function removeUser(id) {
  if (!confirm('确认删除该用户？')) return;
  const res = await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!data.ok) {
    $('uMsg').textContent = data.message || '删除失败';
    return;
  }
  await loadUsers();
};

async function bootstrap() {
  if (!requireAuth()) return;
  await loadRoles();
  await loadUsers();
  resetForm();
  $('btnSaveUser').addEventListener('click', saveUser);
  $('btnResetUser').addEventListener('click', resetForm);
}

bootstrap();
