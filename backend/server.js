const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const { getDb } = require('./db');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 8080);
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const STORAGE_DIR = path.join(__dirname, '..', 'storage');
const PRODUCT_IMAGE_DIR = path.join(STORAGE_DIR, 'images', 'products');
const EXTERNAL_PRODUCT_IMAGE_DIR = process.env.EXTERNAL_PRODUCT_IMAGE_DIR || 'D:\\Jew\\ProductImage';
const EXPORT_TEMPLATE_XLSX = process.env.EXPORT_TEMPLATE_XLSX || 'C:\\Users\\87511\\Desktop\\导出模板.xlsx';
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp'];

fs.mkdirSync(PRODUCT_IMAGE_DIR, { recursive: true });

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(text);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 50 * 1024 * 1024) reject(new Error('Request too large'));
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function parseList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((v) => String(v || '').trim()).filter(Boolean))];
  }
  if (!value) return [];
  const text = String(value);
  return [...new Set(text.split(/[\s,，、;；]+/).map((v) => v.trim()).filter(Boolean))];
}
function parseOrderNoLines(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((v) => String(v || '').trim()).filter(Boolean))];
  }
  if (!value) return [];
  const text = String(value)
    .replace(/\\n\\r|\\r\\n|\\n|\\r/gi, '\n')
    .replace(/\r\n/g, '\n');
  return [...new Set(text.split(/[\r\n,，、\s]+/).map((v) => v.trim()).filter(Boolean))];
}
function numOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(value) {
  const n = numOrNull(value);
  return n === null ? null : Math.trunc(n);
}

function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

function extractToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return '';
}

function isAdmin(user) {
  return user?.role_code === 'admin';
}

function serveStaticFile(reqPath, res) {
  const target = reqPath === '/' ? 'login.html' : reqPath;
  const filePath = path.join(FRONTEND_DIR, target);
  if (!filePath.startsWith(FRONTEND_DIR)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) return sendText(res, 404, 'Not Found');

    const ext = path.extname(filePath).toLowerCase();
    const contentType = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    }[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function serveMediaFile(reqPath, res) {
  const relative = reqPath.replace(/^\/media/, '');
  const filePath = path.join(STORAGE_DIR, relative);
  if (!filePath.startsWith(STORAGE_DIR)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) return sendText(res, 404, 'Media Not Found');

    const ext = path.extname(filePath).toLowerCase();
    const contentType = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    }[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function getBaseMaps(db) {
  const typeRows = db.prepare('SELECT id, name FROM base_product_type').all();
  const factoryRows = db.prepare('SELECT id, code FROM base_factory').all();
  return {
    typeByName: Object.fromEntries(typeRows.map((r) => [r.name, r.id])),
    factoryByCode: Object.fromEntries(factoryRows.map((r) => [r.code, r.id])),
    factoryByName: Object.fromEntries(factoryRows.map((r) => [r.name, r.id])),
  };
}

function normalizeFieldKey(key) {
  return String(key || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-\/\\\[\](){}<>:：,，.;；|"'`~!@#$%^&*+=?]+/g, '');
}

function createFieldGetter(raw) {
  const normMap = new Map();
  for (const [k, v] of Object.entries(raw || {})) {
    normMap.set(normalizeFieldKey(k), v);
  }

  return function getField(...aliases) {
    for (const key of aliases) {
      if (Object.prototype.hasOwnProperty.call(raw, key)) return raw[key];
      const byNorm = normMap.get(normalizeFieldKey(key));
      if (byNorm !== undefined) return byNorm;
    }
    return undefined;
  };
}

let externalImageIndexCache = {
  loadedAt: 0,
  byCodeLower: new Map(),
};

function loadExternalImageIndex() {
  const now = Date.now();
  if (now - externalImageIndexCache.loadedAt < 5000) {
    return externalImageIndexCache.byCodeLower;
  }

  const byCodeLower = new Map();
  if (fs.existsSync(EXTERNAL_PRODUCT_IMAGE_DIR)) {
    const entries = fs.readdirSync(EXTERNAL_PRODUCT_IMAGE_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.includes(ext)) continue;
      const base = path.basename(entry.name, ext).trim().toLowerCase();
      if (!base || byCodeLower.has(base)) continue;
      byCodeLower.set(base, entry.name);
    }
  }

  externalImageIndexCache = {
    loadedAt: now,
    byCodeLower,
  };
  return byCodeLower;
}

function findExternalImagePathByProductCode(productCode) {
  const code = String(productCode || '').trim();
  if (!code) return null;
  const index = loadExternalImageIndex();
  const fileName = index.get(code.toLowerCase());
  if (!fileName) return null;
  return `/ext-media/products/${encodeURIComponent(fileName)}`;
}

function fillFallbackImagePath(row) {
  if (!row || row.image_path) return row;
  const fallback = findExternalImagePathByProductCode(row.product_code);
  if (fallback) row.image_path = fallback;
  return row;
}

function resolveImageFilePath(imagePath) {
  const p = String(imagePath || '').trim();
  if (!p) return null;
  if (p.startsWith('/ext-media/products/')) {
    const fileName = decodeURIComponent(p.slice('/ext-media/products/'.length));
    return path.join(EXTERNAL_PRODUCT_IMAGE_DIR, path.basename(fileName));
  }
  if (p.startsWith('/images/products/')) {
    const fileName = decodeURIComponent(p.slice('/images/products/'.length));
    return path.join(PRODUCT_IMAGE_DIR, path.basename(fileName));
  }
  if (p.startsWith('/images/')) {
    const fileName = decodeURIComponent(p.slice('/images/'.length));
    return path.join(STORAGE_DIR, 'images', path.basename(fileName));
  }
  return null;
}

function getProductsForExport(db, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const cleanIds = [...new Set(ids.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0))];
  if (cleanIds.length === 0) return [];

  const placeholders = cleanIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT
      p.id,
      p.product_code,
      p.weight,
      p.small_stone_count,
      p.odd_stone_count,
      p.main_stone_price,
      p.blank_price,
      p.plating_fee,
      p.labor_cost,
      p.plating_color,
      p.remark,
      t.name AS product_type,
      f.code AS factory_code,
      (
        SELECT image_path FROM product_image pi
        WHERE pi.product_id = p.id
        ORDER BY pi.updated_at DESC, pi.id DESC
        LIMIT 1
      ) AS image_path,
      (
        SELECT GROUP_CONCAT(order_no, ',') FROM product_order po
        WHERE po.product_id = p.id
      ) AS order_nos,
      (
        SELECT GROUP_CONCAT(tag, ',') FROM product_tag pt
        WHERE pt.product_id = p.id
      ) AS tags
    FROM product p
    LEFT JOIN base_product_type t ON t.id = p.product_type_id
    LEFT JOIN base_factory f ON f.id = p.factory_id
    WHERE p.id IN (${placeholders})
  `).all(...cleanIds);

  const byId = new Map(rows.map((r) => [r.id, r]));
  const orderedRows = [];
  for (const id of cleanIds) {
    const r = byId.get(id);
    if (!r) continue;
    fillFallbackImagePath(r);
    r.order_nos = r.order_nos ? r.order_nos.split(',') : [];
    r.tags = r.tags ? r.tags.split(',') : [];
    orderedRows.push(r);
  }
  return orderedRows;
}

function deepCloneStyle(style) {
  if (!style) return {};
  return JSON.parse(JSON.stringify(style));
}

function copyRowStyle(ws, srcRowNo, dstRowNo, maxCol = 17) {
  for (let col = 1; col <= maxCol; col += 1) {
    const src = ws.getCell(srcRowNo, col);
    const dst = ws.getCell(dstRowNo, col);
    dst.style = deepCloneStyle(src.style);
  }
  const srcRow = ws.getRow(srcRowNo);
  const dstRow = ws.getRow(dstRowNo);
  dstRow.height = srcRow.height;
}

function toExcelImageExtension(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.png') return 'png';
  if (ext === '.jpg' || ext === '.jpeg') return 'jpeg';
  if (ext === '.webp') return 'png';
  if (ext === '.bmp') return 'png';
  return null;
}

async function buildExportWorkbookBuffer(rows) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXPORT_TEMPLATE_XLSX);
  const ws = workbook.getWorksheet(1);
  const targetRowHeightPt = 128;
  // ExcelJS column width unit is not points; this value approximates ~128pt visual width.
  const pictureColumnWidth = 24;
  const imageSizePx = 166;
  const imagePaddingPx = 2;

  const dataStartRow = 9;
  const templateDataRows = 4;
  const baseStyleRow = 12;
  let summaryRow = 13;
  let summaryTotalRow = 14;

  const count = rows.length;
  const extra = Math.max(0, count - templateDataRows);
  if (extra > 0) {
    const blanks = Array.from({ length: extra }, () => []);
    ws.spliceRows(summaryRow, 0, ...blanks);
    for (let i = 1; i <= extra; i += 1) {
      copyRowStyle(ws, baseStyleRow, baseStyleRow + i);
    }
    summaryRow += extra;
    summaryTotalRow += extra;
  }

  ws.getColumn(2).width = pictureColumnWidth;

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const rr = dataStartRow + i;
    ws.getCell(rr, 1).value = i + 1;
    ws.getCell(rr, 3).value = r.product_code || '';
    ws.getCell(rr, 4).value = '';
    ws.getCell(rr, 5).value = r.plating_color || '';
    ws.getCell(rr, 6).value = 1;
    ws.getCell(rr, 7).value = Number(r.weight || 0);
    ws.getCell(rr, 8).value = { formula: `F${rr}*G${rr}` };
    ws.getCell(rr, 9).value = Number(r.main_stone_price || 0);
    ws.getCell(rr, 10).value = Number(r.labor_cost || 0);
    ws.getCell(rr, 11).value = Number(r.blank_price || 0);
    ws.getCell(rr, 12).value = { formula: `F${rr}*K${rr}` };
    ws.getCell(rr, 13).value = r.factory_code || '';
    ws.getCell(rr, 14).value = Number(r.small_stone_count || 0);
    ws.getCell(rr, 15).value = (r.tags || []).join(', ');
    ws.getCell(rr, 17).value = r.plating_color || (r.plating_fee ? String(r.plating_fee) : '');

    const imageFilePath = resolveImageFilePath(r.image_path);
    if (imageFilePath && fs.existsSync(imageFilePath)) {
      const ext = toExcelImageExtension(imageFilePath);
      if (ext) {
        try {
          const imageId = workbook.addImage({ filename: imageFilePath, extension: ext });
          ws.addImage(imageId, {
            tl: { col: 1 + imagePaddingPx / imageSizePx, row: rr - 1 + imagePaddingPx / imageSizePx },
            ext: { width: imageSizePx, height: imageSizePx },
          });
          ws.getRow(rr).height = targetRowHeightPt;
        } catch (_) {}
      }
    }
    ws.getRow(rr).height = targetRowHeightPt;
  }

  if (count < templateDataRows) {
    for (let rr = dataStartRow + count; rr < dataStartRow + templateDataRows; rr += 1) {
      for (const cc of [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17]) {
        ws.getCell(rr, cc).value = null;
      }
    }
  }

  const dataEndRow = dataStartRow + count - 1;
  ws.getCell(summaryRow, 1).value = 'Items';
  ws.getCell(summaryRow, 3).value = 'Quantity';
  ws.getCell(summaryRow, 6).value = 'Total Weight';
  ws.getCell(summaryRow, 9).value = 'Total Amount';
  ws.getCell(summaryRow, 11).value = { formula: `SUM(L${dataStartRow}:L${dataEndRow})` };
  ws.getCell(summaryTotalRow, 1).value = { formula: `COUNT(A${dataStartRow}:A${dataEndRow})` };
  ws.getCell(summaryTotalRow, 3).value = { formula: `SUM(F${dataStartRow}:F${dataEndRow})` };
  ws.getCell(summaryTotalRow, 6).value = { formula: `SUM(H${dataStartRow}:H${dataEndRow})` };

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function normalizeProductPayload(raw, maps) {
  const getField = createFieldGetter(raw || {});
  const productCode = String(getField('product_code', 'productCode', '产品编号', '产品编码', '货号', '款号', '编码', 'sku', 'SKU', 'sku编码', '浜у搧缂栧彿') ?? '').trim();
  const productTypeName = String(getField('product_type', 'productType', '产品类型', '品类', '类别', '浜у搧绫诲瀷') ?? '').trim();
  const factoryCode = String(getField('factory_code', 'factoryCode', '工厂编号', '工厂代码', '工厂', '工厂名称', '供应商编号', '宸ュ巶缂栧彿') ?? '').trim();

  const payload = {
    product_code: productCode,
    product_type_id: intOrNull(getField('product_type_id', 'productTypeId', '产品类型ID')),
    factory_id: intOrNull(getField('factory_id', 'factoryId', '工厂ID')),
    weight: numOrNull(getField('weight', 'netWeight', 'grossWeight', '重量', '克重', '净重', '閲嶉噺')) ?? 0,
    small_stone_count: intOrNull(getField('small_stone_count', 'smallStoneCount', '细石数', '副石数', '配石数', '缁嗙煶鏁?')) ?? 0,
    odd_stone_count: intOrNull(getField('odd_stone_count', 'oddStoneCount', '异形石数', '方石数', '寮傚舰鐭虫暟')) ?? 0,
    main_stone_count: intOrNull(getField('main_stone_count', 'mainStoneCount', '主石数', '涓荤煶鏁?')) ?? 0,
    main_stone_price: numOrNull(getField('main_stone_price', 'mainStonePrice', '主石价', '主石价格', '银价', '涓荤煶浠?', '涓荤煶浠锋牸')) ?? 0,
    blank_price: numOrNull(getField('blank_price', 'blankPrice', '胚', '胚价', '鑳氫环')) ?? 0,
    plating_fee: numOrNull(getField('plating_fee', 'platingFee', '电镀', '电镀费', '鐢甸晙璐?')) ?? 0,
    labor_cost: numOrNull(getField('labor_cost', 'laborCost', '成本工费', '工费', '成本', '鎴愭湰宸ヨ垂', '鎴愭湰')) ?? 0,
    plating_color: String(getField('plating_color', 'platingColor', '电镀颜色', '颜色', '鐢甸晙棰滆壊') ?? '').trim() || null,
    remark: String(getField('remark', '备注', '说明', '澶囨敞') ?? '').trim() || null,
    order_nos: parseOrderNoLines(getField('order_nos', 'orderNos', '单号', '订单号', '鍗曞彿')),
    tags: parseList(getField('tags', '标签', '鏍囩')),
  };

  if (!payload.product_type_id && productTypeName) payload.product_type_id = maps.typeByName[productTypeName] || null;
  if (!payload.factory_id && factoryCode) {
    payload.factory_id = maps.factoryByCode[factoryCode] || maps.factoryByName[factoryCode] || null;
  }

  const errors = [];
  if (!payload.product_code) errors.push('浜у搧缂栧彿涓嶈兘涓虹┖');
  if (productTypeName && !payload.product_type_id) errors.push(`浜у搧绫诲瀷涓嶅瓨鍦? ${productTypeName}`);
  if (factoryCode && !payload.factory_id) errors.push(`宸ュ巶缂栧彿涓嶅瓨鍦? ${factoryCode}`);

  return { payload, errors };
}

function upsertRelations(db, productId, orderNos, tags) {
  db.prepare('DELETE FROM product_order WHERE product_id = ?').run(productId);
  db.prepare('DELETE FROM product_tag WHERE product_id = ?').run(productId);

  const insOrder = db.prepare('INSERT OR IGNORE INTO product_order (product_id, order_no) VALUES (?, ?)');
  const insTag = db.prepare('INSERT OR IGNORE INTO product_tag (product_id, tag) VALUES (?, ?)');
  for (const o of orderNos) insOrder.run(productId, o);
  for (const t of tags) insTag.run(productId, t);
}

function getProductById(db, id) {
  const row = db.prepare(`
    SELECT
      p.*,
      t.name AS product_type,
      f.code AS factory_code,
      (
        SELECT image_path FROM product_image pi
        WHERE pi.product_id = p.id
        ORDER BY pi.updated_at DESC, pi.id DESC
        LIMIT 1
      ) AS image_path,
      (
        SELECT GROUP_CONCAT(order_no, ',') FROM product_order po
        WHERE po.product_id = p.id
      ) AS order_nos,
      (
        SELECT GROUP_CONCAT(tag, ',') FROM product_tag pt
        WHERE pt.product_id = p.id
      ) AS tags
    FROM product p
    LEFT JOIN base_product_type t ON t.id = p.product_type_id
    LEFT JOIN base_factory f ON f.id = p.factory_id
    WHERE p.id = ?
  `).get(id);

  if (!row) return null;
  row.order_nos = row.order_nos ? row.order_nos.split(',') : [];
  row.tags = row.tags ? row.tags.split(',') : [];
  return fillFallbackImagePath(row);
}

function queryProducts(db, query) {
  const page = Math.max(Number(query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(query.pageSize || 100), 1), 10000);
  const offset = (page - 1) * pageSize;

  const where = [];
  const binds = [];

  const keyword = String(query.keyword || '').trim();
  if (keyword) {
    where.push('p.product_code LIKE ?');
    binds.push(`%${keyword}%`);
  }

  const orderNos = parseOrderNoLines(query.orderNos);
  if (orderNos.length > 0) {
    const placeholders = orderNos.map(() => '?').join(',');
    where.push(`(
      p.product_code IN (${placeholders})
      OR EXISTS (
        SELECT 1 FROM product_order po
        WHERE po.product_id = p.id AND po.order_no IN (${placeholders})
      )
    )`);
    binds.push(...orderNos, ...orderNos);
  }

  const productTypeId = intOrNull(query.productTypeId);
  if (productTypeId) {
    where.push('p.product_type_id = ?');
    binds.push(productTypeId);
  }

  const factoryId = intOrNull(query.factoryId);
  if (factoryId) {
    where.push('p.factory_id = ?');
    binds.push(factoryId);
  }

  const weightMin = numOrNull(query.weightMin);
  const weightMax = numOrNull(query.weightMax);
  const smallStoneMin = intOrNull(query.smallStoneMin);
  const smallStoneMax = intOrNull(query.smallStoneMax);
  const laborCostMin = numOrNull(query.laborCostMin);
  const laborCostMax = numOrNull(query.laborCostMax);

  if (weightMin !== null) {
    where.push('p.weight >= ?');
    binds.push(weightMin);
  }
  if (weightMax !== null) {
    where.push('p.weight <= ?');
    binds.push(weightMax);
  }
  if (smallStoneMin !== null) {
    where.push('p.small_stone_count >= ?');
    binds.push(smallStoneMin);
  }
  if (smallStoneMax !== null) {
    where.push('p.small_stone_count <= ?');
    binds.push(smallStoneMax);
  }
  if (laborCostMin !== null) {
    where.push('p.labor_cost >= ?');
    binds.push(laborCostMin);
  }
  if (laborCostMax !== null) {
    where.push('p.labor_cost <= ?');
    binds.push(laborCostMax);
  }

  const tag = String(query.tag || '').trim();
  if (tag) {
    where.push('EXISTS (SELECT 1 FROM product_tag pt WHERE pt.product_id = p.id AND pt.tag LIKE ?)');
    binds.push(`%${tag}%`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS c FROM product p ${whereSql}`).get(...binds).c;
  const rows = db.prepare(`
    SELECT
      p.id,
      p.product_code,
      p.product_type_id,
      p.factory_id,
      p.weight,
      p.small_stone_count,
      p.odd_stone_count,
      p.main_stone_count,
      p.main_stone_price,
      p.blank_price,
      p.plating_fee,
      p.labor_cost,
      p.plating_color,
      p.remark,
      p.updated_at,
      t.name AS product_type,
      f.code AS factory_code,
      (
        SELECT image_path FROM product_image pi
        WHERE pi.product_id = p.id
        ORDER BY pi.updated_at DESC, pi.id DESC
        LIMIT 1
      ) AS image_path,
      (
        SELECT GROUP_CONCAT(order_no, ',') FROM product_order po
        WHERE po.product_id = p.id
      ) AS order_nos,
      (
        SELECT GROUP_CONCAT(tag, ',') FROM product_tag pt
        WHERE pt.product_id = p.id
      ) AS tags
    FROM product p
    LEFT JOIN base_product_type t ON t.id = p.product_type_id
    LEFT JOIN base_factory f ON f.id = p.factory_id
    ${whereSql}
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT ? OFFSET ?
  `).all(...binds, pageSize, offset);

  for (const r of rows) {
    r.order_nos = r.order_nos ? r.order_nos.split(',') : [];
    r.tags = r.tags ? r.tags.split(',') : [];
    fillFallbackImagePath(r);
  }

  return { page, pageSize, total, rows };
}

function ensureImageWrite(imageName, imageBase64) {
  if (!imageBase64) throw new Error('image_base64 涓嶈兘涓虹┖');
  const safeName = path.basename(String(imageName || '').trim() || `image-${Date.now()}.png`);
  const targetPath = path.join(PRODUCT_IMAGE_DIR, safeName);

  if (fs.existsSync(targetPath)) {
    const ext = path.extname(safeName);
    const base = safeName.slice(0, safeName.length - ext.length);
    const oldName = `${base}-old-${Date.now()}${ext}`;
    const oldPath = path.join(PRODUCT_IMAGE_DIR, oldName);
    fs.renameSync(targetPath, oldPath);
  }

  const buffer = Buffer.from(imageBase64, 'base64');
  fs.writeFileSync(targetPath, buffer);
  return {
    image_name: safeName,
    image_path: `/images/products/${safeName}`,
  };
}

function serveExternalProductImage(reqPath, res) {
  const prefix = '/ext-media/products/';
  if (!reqPath.startsWith(prefix)) {
    sendText(res, 404, 'Media Not Found');
    return;
  }

  if (!fs.existsSync(EXTERNAL_PRODUCT_IMAGE_DIR)) {
    sendText(res, 404, 'Media Not Found');
    return;
  }

  const encodedFileName = reqPath.slice(prefix.length);
  const safeName = path.basename(decodeURIComponent(encodedFileName));
  if (!safeName) {
    sendText(res, 404, 'Media Not Found');
    return;
  }

  const ext = path.extname(safeName).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  const filePath = path.join(EXTERNAL_PRODUCT_IMAGE_DIR, safeName);
  fs.readFile(filePath, (err, data) => {
    if (err) return sendText(res, 404, 'Media Not Found');
    const contentType = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

async function handleAiQuery(prompt) {
  if (!prompt) return { ok: false, answer: '请输入问题。' };

  const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/generate';
  const model = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
  try {
    const resp = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: `浣犳槸鐝犲疂OA鏈湴鍔╂墜锛岃鏍规嵁鏈湴涓氬姟鍦烘櫙鍥炵瓟銆傞棶棰橈細${prompt}`,
        stream: false,
      }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return { ok: true, answer: data.response || '模型无返回。', provider: 'ollama' };
  } catch (_) {
    return {
      ok: true,
      answer: '本地 AI 模型未连接，当前返回框架占位结果。可后续接入 Ollama + Qwen。',
      provider: 'fallback',
    };
  }
}

function getUserByToken(db, token) {
  if (!token) return null;
  return db.prepare(`
    SELECT
      u.id,
      u.username,
      u.role_id,
      u.status,
      r.code AS role_code,
      r.name AS role_name,
      s.expires_at
    FROM session_token s
    JOIN user_account u ON u.id = s.user_id
    JOIN role r ON r.id = u.role_id
    WHERE s.token = ? AND s.expires_at > ? AND u.status = 1
    LIMIT 1
  `).get(token, Date.now());
}

function requireAdminOrThrow(currentUser) {
  if (!isAdmin(currentUser)) {
    const err = new Error('闇€瑕佺鐞嗗憳鏉冮檺');
    err.statusCode = 403;
    throw err;
  }
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
    res.end();
    return;
  }

  let currentUser = null;

  try {
    if (pathname.startsWith('/api/')) {
      const publicApi = new Set(['/api/health', '/api/auth/login']);
      if (!publicApi.has(pathname)) {
        const db = getDb();
        const token = extractToken(req);
        currentUser = getUserByToken(db, token);
        db.close();
        if (!currentUser) {
          sendJson(res, 401, { ok: false, message: '未登录或登录已过期' });
          return;
        }
      }
    }

    if (pathname === '/api/health' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, now: new Date().toISOString() });
      return;
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await parseBody(req);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      if (!username || !password) {
        sendJson(res, 400, { ok: false, message: '鐢ㄦ埛鍚嶅拰瀵嗙爜涓嶈兘涓虹┖' });
        return;
      }

      const db = getDb();
      const user = db.prepare(`
        SELECT u.*, r.code AS role_code, r.name AS role_name
        FROM user_account u
        JOIN role r ON r.id = u.role_id
        WHERE u.username = ?
        LIMIT 1
      `).get(username);

      if (!user || user.status !== 1) {
        db.close();
        sendJson(res, 401, { ok: false, message: '账号不存在或已禁用' });
        return;
      }

      const passHash = hashPassword(password, user.password_salt);
      if (passHash !== user.password_hash) {
        db.close();
        sendJson(res, 401, { ok: false, message: '鐢ㄦ埛鍚嶆垨瀵嗙爜閿欒' });
        return;
      }

      const token = randomToken();
      const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
      db.prepare('INSERT INTO session_token (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expiresAt);
      db.close();

      sendJson(res, 200, {
        ok: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          role_id: user.role_id,
          role_code: user.role_code,
          role_name: user.role_name,
        },
      });
      return;
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const token = extractToken(req);
      const db = getDb();
      if (token) db.prepare('DELETE FROM session_token WHERE token = ?').run(token);
      db.close();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        user: {
          id: currentUser.id,
          username: currentUser.username,
          role_id: currentUser.role_id,
          role_code: currentUser.role_code,
          role_name: currentUser.role_name,
        },
      });
      return;
    }

    if (pathname === '/api/nav/menus' && req.method === 'GET') {
      const db = getDb();
      let rows = db.prepare(`
        SELECT m.id, m.key, m.name, m.path, m.group_name, m.sort_no
        FROM role_menu rm
        JOIN menu_item m ON m.id = rm.menu_item_id
        WHERE rm.role_id = ? AND m.is_enabled = 1
        ORDER BY m.group_name ASC, m.sort_no ASC, m.id ASC
      `).all(currentUser.role_id);

      if (rows.length === 0 && isAdmin(currentUser)) {
        rows = db.prepare(`
          SELECT id, key, name, path, group_name, sort_no
          FROM menu_item
          WHERE is_enabled = 1
          ORDER BY group_name ASC, sort_no ASC, id ASC
        `).all();
      }

      db.close();
      sendJson(res, 200, { ok: true, rows });
      return;
    }

    if (pathname === '/api/dashboard' && req.method === 'GET') {
      const db = getDb();
      const totalProducts = db.prepare('SELECT COUNT(*) AS c FROM product').get().c;
      const totalFactories = db.prepare('SELECT COUNT(*) AS c FROM base_factory').get().c;
      const totalTypes = db.prepare('SELECT COUNT(*) AS c FROM base_product_type').get().c;
      const recent = db.prepare(`
        SELECT p.product_code, p.updated_at, t.name AS product_type
        FROM product p
        LEFT JOIN base_product_type t ON t.id = p.product_type_id
        ORDER BY p.updated_at DESC, p.id DESC
        LIMIT 8
      `).all();
      const typeStats = db.prepare(`
        SELECT COALESCE(t.name, '未分类') AS product_type, COUNT(*) AS count
        FROM product p
        LEFT JOIN base_product_type t ON t.id = p.product_type_id
        GROUP BY COALESCE(t.name, '未分类')
        ORDER BY count DESC
        LIMIT 8
      `).all();
      db.close();
      sendJson(res, 200, { ok: true, totalProducts, totalFactories, totalTypes, recent, typeStats });
      return;
    }

    if (pathname === '/api/base/product-types' && req.method === 'GET') {
      const db = getDb();
      const rows = db.prepare('SELECT id, name FROM base_product_type ORDER BY id').all();
      db.close();
      sendJson(res, 200, { ok: true, rows });
      return;
    }

    if (pathname === '/api/base/factories' && req.method === 'GET') {
      const db = getDb();
      const rows = db.prepare('SELECT id, code, name FROM base_factory ORDER BY id').all();
      db.close();
      sendJson(res, 200, { ok: true, rows });
      return;
    }

    if (pathname === '/api/products' && req.method === 'GET') {
      const db = getDb();
      const result = queryProducts(db, parsed.query || {});
      db.close();
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (pathname === '/api/products/export-template' && req.method === 'POST') {
      const body = await parseBody(req);
      const ids = Array.isArray(body.ids) ? body.ids : [];
      const cleanIds = [...new Set(ids.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0))];
      if (cleanIds.length === 0) {
        sendJson(res, 400, { ok: false, message: '请先选择要导出的数据' });
        return;
      }

      if (!fs.existsSync(EXPORT_TEMPLATE_XLSX)) {
        sendJson(res, 500, { ok: false, message: `导出模板不存在: ${EXPORT_TEMPLATE_XLSX}` });
        return;
      }

      const db = getDb();
      const rows = getProductsForExport(db, cleanIds);
      db.close();
      if (rows.length === 0) {
        sendJson(res, 404, { ok: false, message: '未找到可导出的产品数据' });
        return;
      }

      try {
        const outputFileName = `products-export-${new Date().toISOString().slice(0, 10)}-${Date.now()}.xlsx`;
        const buf = await buildExportWorkbookBuffer(rows);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename=\"products-export.xlsx\"; filename*=UTF-8''${encodeURIComponent(outputFileName)}`,
        });
        res.end(buf);
      } catch (err) {
        sendJson(res, 500, { ok: false, message: err.message || '导出失败' });
      }
      return;
    }

    if (pathname === '/api/products' && req.method === 'POST') {
      const body = await parseBody(req);
      const db = getDb();
      const maps = getBaseMaps(db);
      const { payload, errors } = normalizeProductPayload(body, maps);
      if (errors.length > 0) {
        db.close();
        sendJson(res, 400, { ok: false, message: errors.join('；') });
        return;
      }

      db.exec('BEGIN');
      try {
        const ins = db.prepare(`
          INSERT INTO product (
            product_code, product_type_id, factory_id, weight,
            small_stone_count, odd_stone_count, main_stone_count,
            main_stone_price, blank_price, plating_fee, labor_cost,
            plating_color, remark
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const r = ins.run(
          payload.product_code,
          payload.product_type_id,
          payload.factory_id,
          payload.weight,
          payload.small_stone_count,
          payload.odd_stone_count,
          payload.main_stone_count,
          payload.main_stone_price,
          payload.blank_price,
          payload.plating_fee,
          payload.labor_cost,
          payload.plating_color,
          payload.remark
        );

        upsertRelations(db, r.lastInsertRowid, payload.order_nos, payload.tags);
        db.exec('COMMIT');
        const row = getProductById(db, r.lastInsertRowid);
        db.close();
        sendJson(res, 200, { ok: true, row });
      } catch (err) {
        db.exec('ROLLBACK');
        db.close();
        sendJson(res, 400, { ok: false, message: err.message });
      }
      return;
    }

    const productIdMatch = pathname.match(/^\/api\/products\/(\d+)$/);
    if (productIdMatch && req.method === 'GET') {
      const id = Number(productIdMatch[1]);
      const db = getDb();
      const row = getProductById(db, id);
      db.close();
      if (!row) return sendJson(res, 404, { ok: false, message: '记录不存在' });
      sendJson(res, 200, { ok: true, row });
      return;
    }

    if (productIdMatch && req.method === 'PUT') {
      const id = Number(productIdMatch[1]);
      const body = await parseBody(req);
      const db = getDb();
      const maps = getBaseMaps(db);
      const { payload, errors } = normalizeProductPayload(body, maps);
      if (errors.length > 0) {
        db.close();
        sendJson(res, 400, { ok: false, message: errors.join('；') });
        return;
      }

      db.exec('BEGIN');
      try {
        db.prepare(`
          UPDATE product SET
            product_code = ?,
            product_type_id = ?,
            factory_id = ?,
            weight = ?,
            small_stone_count = ?,
            odd_stone_count = ?,
            main_stone_count = ?,
            main_stone_price = ?,
            blank_price = ?,
            plating_fee = ?,
            labor_cost = ?,
            plating_color = ?,
            remark = ?,
            updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(
          payload.product_code,
          payload.product_type_id,
          payload.factory_id,
          payload.weight,
          payload.small_stone_count,
          payload.odd_stone_count,
          payload.main_stone_count,
          payload.main_stone_price,
          payload.blank_price,
          payload.plating_fee,
          payload.labor_cost,
          payload.plating_color,
          payload.remark,
          id
        );

        upsertRelations(db, id, payload.order_nos, payload.tags);
        db.exec('COMMIT');
        const row = getProductById(db, id);
        db.close();
        sendJson(res, 200, { ok: true, row });
      } catch (err) {
        db.exec('ROLLBACK');
        db.close();
        sendJson(res, 400, { ok: false, message: err.message });
      }
      return;
    }

    if (productIdMatch && req.method === 'DELETE') {
      const id = Number(productIdMatch[1]);
      const db = getDb();
      db.prepare('DELETE FROM product WHERE id = ?').run(id);
      db.close();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === '/api/import/products/preview' && req.method === 'POST') {
      const body = await parseBody(req);
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (rows.length === 0) return sendJson(res, 400, { ok: false, message: '瀵煎叆鏁版嵁涓虹┖' });

      const db = getDb();
      const maps = getBaseMaps(db);
      const insBatch = db.prepare('INSERT INTO import_batch (kind, status, total_count, valid_count, invalid_count) VALUES (?, ?, ?, 0, 0)');
      const insRow = db.prepare(`
        INSERT INTO import_product_row (batch_id, row_no, raw_json, normalized_json, error_msg, is_valid)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const batch = insBatch.run('product', 'pending', rows.length);
      const batchId = batch.lastInsertRowid;
      let valid = 0;
      let invalid = 0;

      db.exec('BEGIN');
      try {
        for (let i = 0; i < rows.length; i += 1) {
          const raw = rows[i];
          const { payload, errors } = normalizeProductPayload(raw, maps);
          const isValid = errors.length === 0 ? 1 : 0;
          if (isValid) valid += 1;
          else invalid += 1;

          insRow.run(
            batchId,
            i + 1,
            JSON.stringify(raw),
            JSON.stringify(payload),
            errors.join('；') || null,
            isValid
          );
        }

        db.prepare('UPDATE import_batch SET valid_count = ?, invalid_count = ? WHERE id = ?').run(valid, invalid, batchId);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        db.close();
        return sendJson(res, 500, { ok: false, message: err.message });
      }

      const previewRows = db.prepare(`
        SELECT row_no, raw_json, normalized_json, error_msg, is_valid
        FROM import_product_row
        WHERE batch_id = ?
        ORDER BY row_no
        LIMIT 80
      `).all(batchId);
      db.close();

      sendJson(res, 200, {
        ok: true,
        batch_id: batchId,
        total: rows.length,
        valid,
        invalid,
        preview_rows: previewRows,
      });
      return;
    }

    if (pathname === '/api/import/products/confirm' && req.method === 'POST') {
      const body = await parseBody(req);
      const batchId = Number(body.batch_id || 0);
      if (!batchId) return sendJson(res, 400, { ok: false, message: 'batch_id 鏃犳晥' });

      const db = getDb();
      const batch = db.prepare('SELECT * FROM import_batch WHERE id = ?').get(batchId);
      if (!batch || batch.kind !== 'product') {
        db.close();
        return sendJson(res, 404, { ok: false, message: '批次不存在' });
      }
      if (batch.status === 'confirmed') {
        db.close();
        return sendJson(res, 400, { ok: false, message: '璇ユ壒娆″凡纭瀵煎叆' });
      }

      const rows = db.prepare(`
        SELECT normalized_json
        FROM import_product_row
        WHERE batch_id = ? AND is_valid = 1
        ORDER BY row_no
      `).all(batchId);

      const upsert = db.prepare(`
        INSERT INTO product (
          product_code, product_type_id, factory_id, weight,
          small_stone_count, odd_stone_count, main_stone_count,
          main_stone_price, blank_price, plating_fee, labor_cost,
          plating_color, remark
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(product_code) DO UPDATE SET
          product_type_id = excluded.product_type_id,
          factory_id = excluded.factory_id,
          weight = excluded.weight,
          small_stone_count = excluded.small_stone_count,
          odd_stone_count = excluded.odd_stone_count,
          main_stone_count = excluded.main_stone_count,
          main_stone_price = excluded.main_stone_price,
          blank_price = excluded.blank_price,
          plating_fee = excluded.plating_fee,
          labor_cost = excluded.labor_cost,
          plating_color = excluded.plating_color,
          remark = excluded.remark,
          updated_at = datetime('now', 'localtime')
      `);

      db.exec('BEGIN');
      try {
        for (const r of rows) {
          const p = JSON.parse(r.normalized_json);
          upsert.run(
            p.product_code,
            p.product_type_id,
            p.factory_id,
            p.weight,
            p.small_stone_count,
            p.odd_stone_count,
            p.main_stone_count,
            p.main_stone_price,
            p.blank_price,
            p.plating_fee,
            p.labor_cost,
            p.plating_color,
            p.remark
          );
          const productId = db.prepare('SELECT id FROM product WHERE product_code = ?').get(p.product_code).id;
          upsertRelations(db, productId, p.order_nos || [], p.tags || []);
        }

        db.prepare("UPDATE import_batch SET status = 'confirmed', confirmed_at = datetime('now', 'localtime') WHERE id = ?").run(batchId);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        db.close();
        return sendJson(res, 500, { ok: false, message: err.message });
      }

      db.close();
      sendJson(res, 200, { ok: true, imported: rows.length });
      return;
    }

    if (pathname === '/api/import/images' && req.method === 'POST') {
      const body = await parseBody(req);
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (rows.length === 0) return sendJson(res, 400, { ok: false, message: '鍥剧墖瀵煎叆鏁版嵁涓虹┖' });

      const db = getDb();
      const upsertImage = db.prepare(`
        INSERT INTO product_image (product_id, image_name, image_path)
        VALUES (?, ?, ?)
        ON CONFLICT(product_id, image_name) DO UPDATE SET
          image_path = excluded.image_path,
          updated_at = datetime('now', 'localtime')
      `);

      const errors = [];
      let success = 0;
      db.exec('BEGIN');
      try {
        for (let i = 0; i < rows.length; i += 1) {
          const r = rows[i] || {};
          const productCode = String(r.product_code || r['浜у搧缂栧彿'] || '').trim();
          const imageName = String(r.image_name || r['图片名'] || '').trim() || `${productCode}.png`;
          const imageBase64 = String(r.image_base64 || '').trim();

          if (!productCode) {
            errors.push({ index: i, message: '浜у搧缂栧彿涓虹┖' });
            continue;
          }

          const product = db.prepare('SELECT id FROM product WHERE product_code = ?').get(productCode);
          if (!product) {
            errors.push({ index: i, message: `浜у搧涓嶅瓨鍦? ${productCode}` });
            continue;
          }

          try {
            const saved = ensureImageWrite(imageName, imageBase64);
            upsertImage.run(product.id, saved.image_name, saved.image_path);
            success += 1;
          } catch (err) {
            errors.push({ index: i, message: err.message });
          }
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        db.close();
        return sendJson(res, 500, { ok: false, message: err.message });
      }
      db.close();

      sendJson(res, 200, {
        ok: true,
        imported: success,
        failed: errors.length,
        errors,
      });
      return;
    }

    if (pathname === '/api/ai/query' && req.method === 'POST') {
      const body = await parseBody(req);
      const data = await handleAiQuery(String(body.prompt || '').trim());
      sendJson(res, 200, data);
      return;
    }

    if (pathname === '/api/admin/users' && req.method === 'GET') {
      requireAdminOrThrow(currentUser);
      const db = getDb();
      const rows = db.prepare(`
        SELECT u.id, u.username, u.role_id, u.status, u.created_at, r.code AS role_code, r.name AS role_name
        FROM user_account u
        JOIN role r ON r.id = u.role_id
        ORDER BY u.id ASC
      `).all();
      db.close();
      sendJson(res, 200, { ok: true, rows });
      return;
    }

    if (pathname === '/api/admin/users' && req.method === 'POST') {
      requireAdminOrThrow(currentUser);
      const body = await parseBody(req);
      const username = String(body.username || '').trim();
      const password = String(body.password || '').trim();
      const roleId = Number(body.role_id || 0);
      const status = Number(body.status ?? 1) ? 1 : 0;
      if (!username || !password || !roleId) {
        sendJson(res, 400, { ok: false, message: 'username/password/role_id 蹇呭～' });
        return;
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const passHash = hashPassword(password, salt);
      const db = getDb();
      db.prepare(`
        INSERT INTO user_account (username, password_hash, password_salt, role_id, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(username, passHash, salt, roleId, status);
      db.close();
      sendJson(res, 200, { ok: true });
      return;
    }

    const userIdMatch = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
    if (userIdMatch && req.method === 'PUT') {
      requireAdminOrThrow(currentUser);
      const userId = Number(userIdMatch[1]);
      const body = await parseBody(req);
      const username = String(body.username || '').trim();
      const roleId = Number(body.role_id || 0);
      const status = Number(body.status ?? 1) ? 1 : 0;
      const password = String(body.password || '').trim();
      if (!username || !roleId) {
        sendJson(res, 400, { ok: false, message: 'username/role_id 蹇呭～' });
        return;
      }

      const db = getDb();
      db.exec('BEGIN');
      try {
        db.prepare(`
          UPDATE user_account
          SET username = ?, role_id = ?, status = ?, updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(username, roleId, status, userId);

        if (password) {
          const salt = crypto.randomBytes(16).toString('hex');
          const passHash = hashPassword(password, salt);
          db.prepare('UPDATE user_account SET password_hash = ?, password_salt = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?')
            .run(passHash, salt, userId);
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        db.close();
        sendJson(res, 400, { ok: false, message: err.message });
        return;
      }
      db.close();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (userIdMatch && req.method === 'DELETE') {
      requireAdminOrThrow(currentUser);
      const userId = Number(userIdMatch[1]);
      if (userId === currentUser.id) {
        sendJson(res, 400, { ok: false, message: '涓嶈兘鍒犻櫎褰撳墠鐧诲綍鐢ㄦ埛' });
        return;
      }
      const db = getDb();
      db.prepare('DELETE FROM user_account WHERE id = ?').run(userId);
      db.prepare('DELETE FROM session_token WHERE user_id = ?').run(userId);
      db.close();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === '/api/admin/roles' && req.method === 'GET') {
      requireAdminOrThrow(currentUser);
      const db = getDb();
      const roles = db.prepare('SELECT id, code, name, remark, created_at FROM role ORDER BY id').all();
      const permRows = db.prepare('SELECT role_id, permission_id FROM role_permission').all();
      const menuRows = db.prepare('SELECT role_id, menu_item_id FROM role_menu').all();
      db.close();

      const roleMap = new Map(roles.map((r) => [r.id, { ...r, permission_ids: [], menu_item_ids: [] }]));
      for (const p of permRows) roleMap.get(p.role_id)?.permission_ids.push(p.permission_id);
      for (const m of menuRows) roleMap.get(m.role_id)?.menu_item_ids.push(m.menu_item_id);
      sendJson(res, 200, { ok: true, rows: Array.from(roleMap.values()) });
      return;
    }

    if (pathname === '/api/admin/roles' && req.method === 'POST') {
      requireAdminOrThrow(currentUser);
      const body = await parseBody(req);
      const code = String(body.code || '').trim();
      const name = String(body.name || '').trim();
      const remark = String(body.remark || '').trim() || null;
      if (!code || !name) {
        sendJson(res, 400, { ok: false, message: 'code/name 蹇呭～' });
        return;
      }

      const db = getDb();
      db.prepare('INSERT INTO role (code, name, remark) VALUES (?, ?, ?)').run(code, name, remark);
      db.close();
      sendJson(res, 200, { ok: true });
      return;
    }

    const roleIdMatch = pathname.match(/^\/api\/admin\/roles\/(\d+)$/);
    if (roleIdMatch && req.method === 'PUT') {
      requireAdminOrThrow(currentUser);
      const roleId = Number(roleIdMatch[1]);
      const body = await parseBody(req);
      const code = String(body.code || '').trim();
      const name = String(body.name || '').trim();
      const remark = String(body.remark || '').trim() || null;
      const permissionIds = Array.isArray(body.permission_ids) ? body.permission_ids.map(Number).filter(Boolean) : [];
      const menuIds = Array.isArray(body.menu_item_ids) ? body.menu_item_ids.map(Number).filter(Boolean) : [];
      if (!code || !name) {
        sendJson(res, 400, { ok: false, message: 'code/name 蹇呭～' });
        return;
      }

      const db = getDb();
      db.exec('BEGIN');
      try {
        db.prepare('UPDATE role SET code = ?, name = ?, remark = ? WHERE id = ?').run(code, name, remark, roleId);
        db.prepare('DELETE FROM role_permission WHERE role_id = ?').run(roleId);
        db.prepare('DELETE FROM role_menu WHERE role_id = ?').run(roleId);

        const rp = db.prepare('INSERT OR IGNORE INTO role_permission (role_id, permission_id) VALUES (?, ?)');
        const rm = db.prepare('INSERT OR IGNORE INTO role_menu (role_id, menu_item_id) VALUES (?, ?)');
        for (const pid of permissionIds) rp.run(roleId, pid);
        for (const mid of menuIds) rm.run(roleId, mid);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        db.close();
        sendJson(res, 400, { ok: false, message: err.message });
        return;
      }
      db.close();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (roleIdMatch && req.method === 'DELETE') {
      requireAdminOrThrow(currentUser);
      const roleId = Number(roleIdMatch[1]);
      const db = getDb();
      const role = db.prepare('SELECT code FROM role WHERE id = ?').get(roleId);
      if (role?.code === 'admin') {
        db.close();
        sendJson(res, 400, { ok: false, message: '默认管理员角色不可删除' });
        return;
      }
      db.prepare('DELETE FROM role WHERE id = ?').run(roleId);
      db.close();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === '/api/admin/permissions' && req.method === 'GET') {
      requireAdminOrThrow(currentUser);
      const db = getDb();
      const rows = db.prepare('SELECT id, code, name, remark, created_at FROM permission ORDER BY id').all();
      db.close();
      sendJson(res, 200, { ok: true, rows });
      return;
    }

    if (pathname === '/api/admin/permissions' && req.method === 'POST') {
      requireAdminOrThrow(currentUser);
      const body = await parseBody(req);
      const code = String(body.code || '').trim();
      const name = String(body.name || '').trim();
      const remark = String(body.remark || '').trim() || null;
      if (!code || !name) {
        sendJson(res, 400, { ok: false, message: 'code/name 蹇呭～' });
        return;
      }

      const db = getDb();
      db.prepare('INSERT INTO permission (code, name, remark) VALUES (?, ?, ?)').run(code, name, remark);
      db.close();
      sendJson(res, 200, { ok: true });
      return;
    }

    const permIdMatch = pathname.match(/^\/api\/admin\/permissions\/(\d+)$/);
    if (permIdMatch && req.method === 'PUT') {
      requireAdminOrThrow(currentUser);
      const id = Number(permIdMatch[1]);
      const body = await parseBody(req);
      const code = String(body.code || '').trim();
      const name = String(body.name || '').trim();
      const remark = String(body.remark || '').trim() || null;
      if (!code || !name) {
        sendJson(res, 400, { ok: false, message: 'code/name 蹇呭～' });
        return;
      }

      const db = getDb();
      db.prepare('UPDATE permission SET code = ?, name = ?, remark = ? WHERE id = ?').run(code, name, remark, id);
      db.close();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (permIdMatch && req.method === 'DELETE') {
      requireAdminOrThrow(currentUser);
      const id = Number(permIdMatch[1]);
      const db = getDb();
      db.prepare('DELETE FROM permission WHERE id = ?').run(id);
      db.close();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === '/api/admin/menus' && req.method === 'GET') {
      requireAdminOrThrow(currentUser);
      const db = getDb();
      const rows = db.prepare('SELECT id, key, name, path, group_name, sort_no, is_enabled, created_at FROM menu_item ORDER BY group_name ASC, sort_no ASC, id ASC').all();
      db.close();
      sendJson(res, 200, { ok: true, rows });
      return;
    }

    if (pathname === '/api/admin/menus' && req.method === 'POST') {
      requireAdminOrThrow(currentUser);
      const body = await parseBody(req);
      const key = String(body.key || '').trim();
      const name = String(body.name || '').trim();
      const menuPath = String(body.path || '').trim();
      const groupName = String(body.group_name || '涓氬姟鍔熻兘').trim() || '涓氬姟鍔熻兘';
      const sortNo = Number(body.sort_no || 100);
      const isEnabled = Number(body.is_enabled ?? 1) ? 1 : 0;
      if (!key || !name || !menuPath) {
        sendJson(res, 400, { ok: false, message: 'key/name/path 蹇呭～' });
        return;
      }
      const db = getDb();
      db.prepare('INSERT INTO menu_item (key, name, path, group_name, sort_no, is_enabled) VALUES (?, ?, ?, ?, ?, ?)').run(key, name, menuPath, groupName, sortNo, isEnabled);
      db.close();
      sendJson(res, 200, { ok: true });
      return;
    }

    const menuIdMatch = pathname.match(/^\/api\/admin\/menus\/(\d+)$/);
    if (menuIdMatch && req.method === 'PUT') {
      requireAdminOrThrow(currentUser);
      const id = Number(menuIdMatch[1]);
      const body = await parseBody(req);
      const key = String(body.key || '').trim();
      const name = String(body.name || '').trim();
      const menuPath = String(body.path || '').trim();
      const groupName = String(body.group_name || '涓氬姟鍔熻兘').trim() || '涓氬姟鍔熻兘';
      const sortNo = Number(body.sort_no || 100);
      const isEnabled = Number(body.is_enabled ?? 1) ? 1 : 0;
      if (!key || !name || !menuPath) {
        sendJson(res, 400, { ok: false, message: 'key/name/path 蹇呭～' });
        return;
      }
      const db = getDb();
      db.prepare('UPDATE menu_item SET key = ?, name = ?, path = ?, group_name = ?, sort_no = ?, is_enabled = ? WHERE id = ?')
        .run(key, name, menuPath, groupName, sortNo, isEnabled, id);
      db.close();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (menuIdMatch && req.method === 'DELETE') {
      requireAdminOrThrow(currentUser);
      const id = Number(menuIdMatch[1]);
      const db = getDb();
      db.prepare('DELETE FROM menu_item WHERE id = ?').run(id);
      db.close();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === '/api/admin/menus/reorder' && req.method === 'POST') {
      requireAdminOrThrow(currentUser);
      const body = await parseBody(req);
      const items = Array.isArray(body.items) ? body.items : [];
      if (items.length === 0) {
        sendJson(res, 400, { ok: false, message: 'items 涓嶈兘涓虹┖' });
        return;
      }

      const db = getDb();
      db.exec('BEGIN');
      try {
        const upd = db.prepare('UPDATE menu_item SET group_name = ?, sort_no = ? WHERE id = ?');
        for (const it of items) {
          const id = Number(it.id || 0);
          const groupName = String(it.group_name || '涓氬姟鍔熻兘').trim() || '涓氬姟鍔熻兘';
          const sortNo = Number(it.sort_no || 0);
          if (!id) continue;
          upd.run(groupName, sortNo, id);
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        db.close();
        sendJson(res, 500, { ok: false, message: err.message });
        return;
      }
      db.close();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === '/api/admin/options' && req.method === 'GET') {
      requireAdminOrThrow(currentUser);
      const db = getDb();
      const roles = db.prepare('SELECT id, code, name FROM role ORDER BY id').all();
      const permissions = db.prepare('SELECT id, code, name FROM permission ORDER BY id').all();
      const menus = db.prepare('SELECT id, key, name, path, group_name, sort_no, is_enabled FROM menu_item ORDER BY group_name, sort_no, id').all();
      db.close();
      sendJson(res, 200, { ok: true, roles, permissions, menus });
      return;
    }

    if (pathname.startsWith('/ext-media/products/')) {
      serveExternalProductImage(pathname, res);
      return;
    }

    if (pathname.startsWith('/media/')) {
      serveMediaFile(pathname, res);
      return;
    }

    serveStaticFile(pathname, res);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    sendJson(res, statusCode, { ok: false, message: err.message || 'Internal Server Error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Local OA server running at http://${HOST}:${PORT}`);
});

