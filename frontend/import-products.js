const state = { batchId: null };

const $ = (id) => document.getElementById(id);

async function importPreview() {
  $('importMsg').textContent = '';
  let rows;
  try {
    rows = JSON.parse($('importProductsJson').value || '[]');
    if (!Array.isArray(rows)) throw new Error('JSON 需为数组');
  } catch (err) {
    $('importMsg').textContent = `格式错误：${err.message}`;
    return;
  }

  const res = await apiFetch('/api/import/products/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  });
  const data = await res.json();
  if (!data.ok) {
    $('importMsg').textContent = data.message || '预览失败';
    return;
  }

  state.batchId = data.batch_id;
  $('importMsg').textContent = `预览完成：有效 ${data.valid}，无效 ${data.invalid}，批次 ${data.batch_id}`;
  $('importPreview').textContent = JSON.stringify(data.preview_rows, null, 2);
}

async function importConfirm() {
  if (!state.batchId) {
    $('importMsg').textContent = '请先执行导入预览';
    return;
  }
  const res = await apiFetch('/api/import/products/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch_id: state.batchId }),
  });
  const data = await res.json();
  if (!data.ok) {
    $('importMsg').textContent = data.message || '确认导入失败';
    return;
  }

  $('importMsg').textContent = `确认导入完成：${data.imported} 条`;
  state.batchId = null;
}

if (requireAuth()) {
  document.getElementById('btnImportPreview').addEventListener('click', importPreview);
  document.getElementById('btnImportConfirm').addEventListener('click', importConfirm);
}
