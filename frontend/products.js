const state = {
  page: 1,
  pageSize: 15,
  total: 0,
  productTypes: [],
  factories: [],
};

const $ = (id) => document.getElementById(id);

function esc(v) {
  return String(v || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function toMedia(path) {
  return path ? `/media${path}` : '';
}

function listText(v) {
  return Array.isArray(v) ? v.join(', ') : '';
}

function pageCount() {
  return Math.max(1, Math.ceil(state.total / state.pageSize));
}

function getFilters() {
  return {
    keyword: $('fKeyword').value.trim(),
    orderNos: $('fOrderNos').value,
    tag: $('fTag').value.trim(),
    productTypeId: $('fProductType').value,
    factoryId: $('fFactory').value,
    weightMin: $('fWeightMin').value,
    weightMax: $('fWeightMax').value,
    smallStoneMin: $('fSmallStoneMin').value,
    smallStoneMax: $('fSmallStoneMax').value,
    laborCostMin: $('fLaborMin').value,
    laborCostMax: $('fLaborMax').value,
  };
}

function qs(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v) !== '') q.set(k, v);
  }
  return q.toString();
}

async function loadBase() {
  const [typesRes, factoriesRes] = await Promise.all([
    apiFetch('/api/base/product-types'),
    apiFetch('/api/base/factories'),
  ]);
  const types = await typesRes.json();
  const factories = await factoriesRes.json();
  state.productTypes = types.rows || [];
  state.factories = factories.rows || [];

  for (const elId of ['fProductType', 'pType']) {
    const el = $(elId);
    const first = elId === 'fProductType' ? '<option value="">产品类型（全部）</option>' : '<option value="">产品类型</option>';
    el.innerHTML = first + state.productTypes.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  }

  for (const elId of ['fFactory', 'pFactory']) {
    const el = $(elId);
    const first = elId === 'fFactory' ? '<option value="">工厂编号（全部）</option>' : '<option value="">工厂编号</option>';
    el.innerHTML = first + state.factories.map((f) => `<option value="${f.id}">${esc(f.code)}</option>`).join('');
  }
}

function renderRows(rows) {
  const tbody = $('rows');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="17" class="hint">暂无数据</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((r) => {
    const img = r.image_path
      ? `<div class="img-cell"><img class="thumb" src="${toMedia(r.image_path)}" alt="thumb" /><div class="img-pop"><img src="${toMedia(r.image_path)}" alt="preview"/></div></div>`
      : '<span class="hint">无图</span>';

    return `<tr>
      <td>${img}</td>
      <td>${esc(r.product_code)}</td>
      <td>${esc(r.product_type || '')}</td>
      <td>${esc(r.factory_code || '')}</td>
      <td>${Number(r.weight || 0).toFixed(2)}</td>
      <td>${r.small_stone_count ?? 0}</td>
      <td>${r.odd_stone_count ?? 0}</td>
      <td>${r.main_stone_count ?? 0}</td>
      <td>${Number(r.main_stone_price || 0).toFixed(2)}</td>
      <td>${Number(r.blank_price || 0).toFixed(2)}</td>
      <td>${Number(r.plating_fee || 0).toFixed(2)}</td>
      <td>${Number(r.labor_cost || 0).toFixed(2)}</td>
      <td>${esc(r.plating_color || '')}</td>
      <td>${esc(listText(r.order_nos))}</td>
      <td>${esc(listText(r.tags))}</td>
      <td>${esc(r.remark || '')}</td>
      <td>
        <button class="btn-secondary" onclick="editRow(${r.id})">编辑</button>
        <button onclick="deleteRow(${r.id})">删</button>
      </td>
    </tr>`;
  }).join('');
}

function renderPageTabs() {
  const tabs = $('pageTabs');
  const max = pageCount();
  if (max <= 1) {
    tabs.innerHTML = '';
    return;
  }

  const start = Math.max(1, state.page - 4);
  const end = Math.min(max, start + 8);
  const html = [];
  for (let p = start; p <= end; p += 1) {
    const active = p === state.page ? 'active' : '';
    html.push(`<button class="tab-btn ${active}" onclick="jumpPage(${p})">${p}</button>`);
  }
  tabs.innerHTML = html.join('');
}

async function loadProducts() {
  const query = {
    ...getFilters(),
    page: state.page,
    pageSize: state.pageSize,
  };

  const res = await apiFetch(`/api/products?${qs(query)}`);
  const data = await res.json();
  if (!data.ok) {
    $('summary').textContent = '查询失败';
    return;
  }

  state.total = data.total;
  const max = pageCount();
  if (state.page > max) {
    state.page = max;
    return loadProducts();
  }

  $('summary').textContent = `共 ${state.total} 条`;
  $('pageInfo').textContent = `第 ${state.page}/${max} 页，本页 ${data.rows.length} 条，每页 ${state.pageSize} 条`;
  renderRows(data.rows || []);
  renderPageTabs();
}

function openModal(title) {
  $('modalTitle').textContent = title;
  $('modalMask').classList.remove('hidden');
}

function closeModal() {
  $('modalMask').classList.add('hidden');
}

function resetForm() {
  $('pId').value = '';
  $('pCode').value = '';
  $('pType').value = '';
  $('pFactory').value = '';
  $('pWeight').value = '';
  $('pSmallStone').value = '';
  $('pOddStone').value = '';
  $('pMainStone').value = '';
  $('pMainStonePrice').value = '';
  $('pBlankPrice').value = '';
  $('pPlatingFee').value = '';
  $('pLaborCost').value = '';
  $('pPlatingColor').value = '';
  $('pOrderNos').value = '';
  $('pTags').value = '';
  $('pRemark').value = '';
  $('formMsg').textContent = '';
}

function buildPayloadFromForm() {
  return {
    product_code: $('pCode').value.trim(),
    product_type_id: $('pType').value || null,
    factory_id: $('pFactory').value || null,
    weight: $('pWeight').value,
    small_stone_count: $('pSmallStone').value,
    odd_stone_count: $('pOddStone').value,
    main_stone_count: $('pMainStone').value,
    main_stone_price: $('pMainStonePrice').value,
    blank_price: $('pBlankPrice').value,
    plating_fee: $('pPlatingFee').value,
    labor_cost: $('pLaborCost').value,
    plating_color: $('pPlatingColor').value.trim(),
    order_nos: $('pOrderNos').value,
    tags: $('pTags').value.trim(),
    remark: $('pRemark').value.trim(),
  };
}

async function saveForm() {
  const id = $('pId').value;
  const payload = buildPayloadFromForm();
  if (!payload.product_code) {
    $('formMsg').textContent = '产品编号不能为空';
    return;
  }

  const url = id ? `/api/products/${id}` : '/api/products';
  const method = id ? 'PUT' : 'POST';

  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) {
    $('formMsg').textContent = data.message || '保存失败';
    return;
  }

  await loadProducts();
  closeModal();
}

window.editRow = async function editRow(id) {
  const res = await apiFetch(`/api/products/${id}`);
  const data = await res.json();
  if (!data.ok) return;
  const r = data.row;
  $('pId').value = r.id;
  $('pCode').value = r.product_code || '';
  $('pType').value = r.product_type_id || '';
  $('pFactory').value = r.factory_id || '';
  $('pWeight').value = r.weight ?? '';
  $('pSmallStone').value = r.small_stone_count ?? '';
  $('pOddStone').value = r.odd_stone_count ?? '';
  $('pMainStone').value = r.main_stone_count ?? '';
  $('pMainStonePrice').value = r.main_stone_price ?? '';
  $('pBlankPrice').value = r.blank_price ?? '';
  $('pPlatingFee').value = r.plating_fee ?? '';
  $('pLaborCost').value = r.labor_cost ?? '';
  $('pPlatingColor').value = r.plating_color || '';
  $('pOrderNos').value = Array.isArray(r.order_nos) ? r.order_nos.join('\n') : '';
  $('pTags').value = listText(r.tags);
  $('pRemark').value = r.remark || '';
  openModal(`编辑产品 #${r.id}`);
};

window.deleteRow = async function deleteRow(id) {
  if (!confirm('确认删除该记录吗？')) return;
  const res = await apiFetch(`/api/products/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!data.ok) return;
  await loadProducts();
};

window.jumpPage = async function jumpPage(pageNo) {
  state.page = pageNo;
  await loadProducts();
};

async function bootstrap() {
  if (!requireAuth()) return;

  $('btnSearch').addEventListener('click', async () => {
    state.page = 1;
    await loadProducts();
  });

  $('btnReset').addEventListener('click', async () => {
    for (const id of ['fKeyword','fOrderNos','fTag','fProductType','fFactory','fWeightMin','fWeightMax','fSmallStoneMin','fSmallStoneMax','fLaborMin','fLaborMax']) {
      $(id).value = '';
    }
    state.page = 1;
    await loadProducts();
  });

  $('btnAdd').addEventListener('click', () => {
    resetForm();
    openModal('新增产品');
  });

  $('btnCloseModal').addEventListener('click', closeModal);
  $('modalMask').addEventListener('click', (e) => {
    if (e.target.id === 'modalMask') closeModal();
  });
  $('btnSave').addEventListener('click', saveForm);
  $('btnNew').addEventListener('click', resetForm);

  $('btnPrev').addEventListener('click', async () => {
    if (state.page <= 1) return;
    state.page -= 1;
    await loadProducts();
  });

  $('btnNext').addEventListener('click', async () => {
    const max = pageCount();
    if (state.page >= max) return;
    state.page += 1;
    await loadProducts();
  });

  $('pageSizeSelect').addEventListener('change', async (e) => {
    state.pageSize = Number(e.target.value || 15);
    state.page = 1;
    await loadProducts();
  });

  await loadBase();
  await loadProducts();
  closeModal();
}

bootstrap();
