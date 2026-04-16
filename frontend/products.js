const state = {
  page: 1,
  pageSize: 100,
  total: 0,
  productTypes: [],
  factories: [],
  currentRows: [],
  selectedIds: new Set(),
};

const $ = (id) => document.getElementById(id);

function esc(v) {
  return String(v || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function toMedia(path) {
  if (!path) return '';
  if (String(path).startsWith('/ext-media/')) return path;
  return `/media${path}`;
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

function updateSelectedCount() {
  $('selectedCount').textContent = String(state.selectedIds.size);
}

function setSelected(id, checked) {
  if (checked) state.selectedIds.add(id);
  else state.selectedIds.delete(id);
  updateSelectedCount();
}

function selectAllCurrentPage() {
  for (const r of state.currentRows) state.selectedIds.add(r.id);
  renderRows(state.currentRows);
  updateSelectedCount();
}

function invertCurrentPage() {
  for (const r of state.currentRows) {
    if (state.selectedIds.has(r.id)) state.selectedIds.delete(r.id);
    else state.selectedIds.add(r.id);
  }
  renderRows(state.currentRows);
  updateSelectedCount();
}

function clearSelection() {
  state.selectedIds.clear();
  renderRows(state.currentRows);
  updateSelectedCount();
}

async function copySelectedOrderNos() {
  const selected = state.currentRows.filter((r) => state.selectedIds.has(r.id));
  if (selected.length === 0) {
    $('pageInfo').textContent = '请先勾选要复制编号的数据';
    return;
  }

  const set = new Set();
  for (const row of selected) {
    const code = String(row.product_code || '').trim();
    if (code) set.add(code);
  }

  const text = Array.from(set).join('\n');
  if (!text) {
    $('pageInfo').textContent = '选中数据没有可复制的产品编号';
    return;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      throw new Error('clipboard api unavailable');
    }
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'readonly');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (!ok) {
      $('pageInfo').textContent = '复制失败，请重试';
      return;
    }
  }

  $('pageInfo').textContent = `已复制 ${set.size} 个产品编号（换行）`;
}

function getFilenameFromDisposition(disposition) {
  const text = String(disposition || '');
  const utf8Match = text.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch (_) {}
  }
  const plainMatch = text.match(/filename=\"?([^\";]+)\"?/i);
  if (plainMatch && plainMatch[1]) return plainMatch[1];
  return `products-export-${Date.now()}.xlsx`;
}

async function exportSelectedToTemplate() {
  const ids = Array.from(state.selectedIds);
  if (ids.length === 0) {
    $('pageInfo').textContent = '请先勾选要导出的数据';
    return;
  }

  $('pageInfo').textContent = `正在导出 ${ids.length} 条数据...`;
  const res = await apiFetch('/api/products/export-template', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });

  if (!res.ok) {
    let msg = '导出失败';
    try {
      const data = await res.json();
      msg = data.message || msg;
    } catch (_) {}
    $('pageInfo').textContent = msg;
    return;
  }

  const blob = await res.blob();
  const fileName = getFilenameFromDisposition(res.headers.get('Content-Disposition'));
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
  $('pageInfo').textContent = `已导出 ${ids.length} 条数据`;
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
    tbody.innerHTML = '<tr><td colspan="19" class="hint">暂无数据</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((r, idx) => {
    const checked = state.selectedIds.has(r.id) ? 'checked' : '';
    const serialNo = (state.page - 1) * state.pageSize + idx + 1;
    const img = r.image_path
      ? `<div class="img-cell"><img class="thumb" src="${toMedia(r.image_path)}" alt="thumb" /><div class="img-pop"><img src="${toMedia(r.image_path)}" alt="preview"/></div></div>`
      : '<span class="hint">无图</span>';

    return `<tr>
      <td><input type="checkbox" data-row-check="${r.id}" ${checked} /></td>
      <td>${serialNo}</td>
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
        <button onclick="deleteRow(${r.id})">删除</button>
      </td>
    </tr>`;
  }).join('');

  Array.from(document.querySelectorAll('input[data-row-check]')).forEach((el) => {
    el.addEventListener('change', (e) => {
      const id = Number(e.target.getAttribute('data-row-check'));
      setSelected(id, e.target.checked);
    });
  });
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
    $('summary').textContent = '0';
    return;
  }

  state.total = data.total;
  state.currentRows = data.rows || [];
  const max = pageCount();
  if (state.page > max) {
    state.page = max;
    return loadProducts();
  }

  $('summary').textContent = `${state.total}`;
  $('pageInfo').textContent = `第 ${state.page}/${max} 页，本页 ${state.currentRows.length} 条`;
  renderRows(state.currentRows);
  renderPageTabs();
  updateSelectedCount();
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
  state.selectedIds.delete(id);
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
    let size = Number(e.target.value || state.pageSize);
    if (!Number.isFinite(size) || size < 1) size = 100;
    if (size > 10000) size = 10000;
    state.pageSize = Math.trunc(size);
    e.target.value = String(state.pageSize);
    state.page = 1;
    await loadProducts();
  });
  $('pageSizeSelect').addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    e.target.dispatchEvent(new Event('change'));
  });

  $('btnSelectAll').addEventListener('click', selectAllCurrentPage);
  $('btnInvertSelect').addEventListener('click', invertCurrentPage);
  $('btnClearSelect').addEventListener('click', clearSelection);
  $('btnCopyOrderNos').addEventListener('click', copySelectedOrderNos);
  $('btnExportTemplate').addEventListener('click', exportSelectedToTemplate);

  await loadBase();
  $('pageSizeSelect').value = String(state.pageSize);
  await loadProducts();
  closeModal();
}

bootstrap();

