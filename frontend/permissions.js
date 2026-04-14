const $ = (id) => document.getElementById(id);
const state = { rows: [] };

function esc(v) {
  return String(v || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function resetForm() {
  $('pId').value = '';
  $('pCode').value = '';
  $('pName').value = '';
  $('pRemark').value = '';
  $('pMsg').textContent = '';
}

async function loadRows() {
  const res = await apiFetch('/api/admin/permissions');
  const data = await res.json();
  state.rows = data.rows || [];
  $('permRows').innerHTML = state.rows.map((r) => `<tr>
    <td>${r.id}</td><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td>${esc(r.remark || '')}</td>
    <td><button class="btn-secondary" onclick="editPerm(${r.id})">编辑</button><button onclick="removePerm(${r.id})">删除</button></td>
  </tr>`).join('') || '<tr><td colspan="5">暂无数据</td></tr>';
}

async function savePerm() {
  const id = $('pId').value;
  const payload = {
    code: $('pCode').value.trim(),
    name: $('pName').value.trim(),
    remark: $('pRemark').value.trim(),
  };
  const url = id ? `/api/admin/permissions/${id}` : '/api/admin/permissions';
  const method = id ? 'PUT' : 'POST';
  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) {
    $('pMsg').textContent = data.message || '保存失败';
    return;
  }
  $('pMsg').textContent = '保存成功';
  await loadRows();
  if (!id) resetForm();
}

window.editPerm = function editPerm(id) {
  const p = state.rows.find((x) => x.id === id);
  if (!p) return;
  $('pId').value = p.id;
  $('pCode').value = p.code;
  $('pName').value = p.name;
  $('pRemark').value = p.remark || '';
};

window.removePerm = async function removePerm(id) {
  if (!confirm('确认删除该权限？')) return;
  const res = await apiFetch(`/api/admin/permissions/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!data.ok) {
    $('pMsg').textContent = data.message || '删除失败';
    return;
  }
  await loadRows();
};

async function bootstrap() {
  if (!requireAuth()) return;
  await loadRows();
  resetForm();
  $('btnSavePerm').addEventListener('click', savePerm);
  $('btnResetPerm').addEventListener('click', resetForm);
}

bootstrap();
