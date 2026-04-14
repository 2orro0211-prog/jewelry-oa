const fs = require('fs');
const path = require('path');
const { getDb } = require('./db');

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('Usage: node backend/import-legacy-csv.js <csv-path>');
  process.exit(1);
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let i = 0;
  let inQuote = false;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i += 2;
        continue;
      }
      inQuote = !inQuote;
      i += 1;
      continue;
    }
    if (ch === ',' && !inQuote) {
      out.push(cur);
      cur = '';
      i += 1;
      continue;
    }
    cur += ch;
    i += 1;
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]);
    const row = {};
    for (let c = 0; c < headers.length; c += 1) {
      row[headers[c]] = (cells[c] || '').trim();
    }
    rows.push(row);
  }
  return { headers, rows };
}

function toNum(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const fullPath = path.resolve(csvPath);
const raw = fs.readFileSync(fullPath);
const text = raw.toString('utf8');
const { headers, rows } = parseCsv(text);

if (headers.length === 0) {
  console.error('CSV is empty');
  process.exit(1);
}

const db = getDb();
const upsert = db.prepare(`
  INSERT INTO product (
    product_code, weight, labor_cost, remark
  ) VALUES (?, ?, ?, ?)
  ON CONFLICT(product_code) DO UPDATE SET
    weight = excluded.weight,
    labor_cost = excluded.labor_cost,
    remark = excluded.remark,
    updated_at = datetime('now', 'localtime')
`);

let ok = 0;
let skipped = 0;
const errors = [];

db.exec('BEGIN');
try {
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const productCode = String(r['产品编号'] || r['product_code'] || '').trim();
    if (!productCode) {
      skipped += 1;
      continue;
    }

    const weight = toNum(r['重量'] ?? r['weight']);
    const laborCost = toNum(r['成本工费'] ?? r['成本'] ?? r['labor_cost']);
    const remark = String(r['备注'] ?? r['remark'] ?? '').trim() || null;

    try {
      upsert.run(productCode, weight ?? 0, laborCost ?? 0, remark);
      ok += 1;
    } catch (err) {
      errors.push({ row: i + 2, productCode, message: err.message });
    }
  }
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  db.close();
  throw err;
}

const total = db.prepare('SELECT COUNT(*) AS c FROM product').get().c;
db.close();

console.log(JSON.stringify({
  source: fullPath,
  headers,
  imported: ok,
  skipped,
  errors: errors.slice(0, 20),
  errorCount: errors.length,
  totalProductRowsAfterImport: total,
}, null, 2));
