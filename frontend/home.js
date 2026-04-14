const typeRows = document.getElementById('typeRows');
const recentRows = document.getElementById('recentRows');

function esc(v) {
  return String(v || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function loadDashboard() {
  if (!requireAuth()) return;
  const res = await apiFetch('/api/dashboard');
  const data = await res.json();
  if (!data.ok) return;

  document.getElementById('kpiProducts').textContent = data.totalProducts;
  document.getElementById('kpiFactories').textContent = data.totalFactories;
  document.getElementById('kpiTypes').textContent = data.totalTypes;

  typeRows.innerHTML = (data.typeStats || []).map((r) => `<tr><td>${esc(r.product_type)}</td><td>${r.count}</td></tr>`).join('') || '<tr><td colspan="2">暂无数据</td></tr>';
  recentRows.innerHTML = (data.recent || []).map((r) => `<tr><td>${esc(r.product_code)}</td><td>${esc(r.product_type || '')}</td><td>${esc(r.updated_at || '')}</td></tr>`).join('') || '<tr><td colspan="3">暂无数据</td></tr>';
}

loadDashboard();
