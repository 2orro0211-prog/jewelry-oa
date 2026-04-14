const filesState = { rows: [] };

const $ = (id) => document.getElementById(id);

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const full = String(reader.result || '');
      const base64 = full.includes(',') ? full.split(',')[1] : full;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function productCodeFromFileName(name) {
  const i = name.lastIndexOf('.');
  return (i > 0 ? name.slice(0, i) : name).trim();
}

function renderRows(rows) {
  const tbody = $('imageRows');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="hint">未读取到图片</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((r) => `<tr><td>${r.image_name}</td><td>${r.product_code}</td><td>${(r.size / 1024).toFixed(1)}</td></tr>`).join('');
}

async function scanFolder() {
  const input = $('folderInput');
  const files = Array.from(input.files || []);
  const images = files.filter((f) => f.type.startsWith('image/'));

  if (!images.length) {
    $('folderMsg').textContent = '未读取到图片文件';
    renderRows([]);
    filesState.rows = [];
    return;
  }

  const rows = [];
  for (const file of images) {
    rows.push({
      product_code: productCodeFromFileName(file.name),
      image_name: file.name,
      file,
      size: file.size,
    });
  }

  filesState.rows = rows;
  $('folderMsg').textContent = `已读取 ${rows.length} 张图片，可执行导入。`;
  renderRows(rows);
}

async function importFolderImages() {
  if (!filesState.rows.length) {
    $('folderMsg').textContent = '请先读取文件夹';
    return;
  }

  $('folderMsg').textContent = `正在处理 ${filesState.rows.length} 张图片，请稍候...`;
  const rows = [];
  for (const r of filesState.rows) {
    const image_base64 = await toBase64(r.file);
    rows.push({
      产品编号: r.product_code,
      图片名: r.image_name,
      image_base64,
    });
  }

  const res = await apiFetch('/api/import/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  });
  const data = await res.json();
  if (!data.ok) {
    $('folderMsg').textContent = data.message || '导入失败';
    return;
  }
  $('folderMsg').textContent = `导入完成：成功 ${data.imported}，失败 ${data.failed}`;
}

if (requireAuth()) {
  $('btnScanFolder').addEventListener('click', scanFolder);
  $('btnImportFolderImages').addEventListener('click', importFolderImages);
  renderRows([]);
}
