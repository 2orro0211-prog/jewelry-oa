const crypto = require('crypto');
const { getDb, DB_PATH } = require('./db');

const db = getDb();

db.exec(`
CREATE TABLE IF NOT EXISTS base_factory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS base_product_type (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS product (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_code TEXT NOT NULL UNIQUE,
  product_type_id INTEGER,
  factory_id INTEGER,
  weight REAL DEFAULT 0,
  small_stone_count INTEGER DEFAULT 0,
  odd_stone_count INTEGER DEFAULT 0,
  main_stone_count INTEGER DEFAULT 0,
  main_stone_price REAL DEFAULT 0,
  blank_price REAL DEFAULT 0,
  plating_fee REAL DEFAULT 0,
  labor_cost REAL DEFAULT 0,
  plating_color TEXT,
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (product_type_id) REFERENCES base_product_type(id),
  FOREIGN KEY (factory_id) REFERENCES base_factory(id)
);

CREATE TABLE IF NOT EXISTS product_order (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  order_no TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(product_id, order_no),
  FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_tag (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(product_id, tag),
  FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_image (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  image_name TEXT NOT NULL,
  image_path TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(product_id, image_name),
  FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS import_batch (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_count INTEGER DEFAULT 0,
  valid_count INTEGER DEFAULT 0,
  invalid_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  confirmed_at TEXT
);

CREATE TABLE IF NOT EXISTS import_product_row (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  row_no INTEGER NOT NULL,
  raw_json TEXT NOT NULL,
  normalized_json TEXT,
  error_msg TEXT,
  is_valid INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (batch_id) REFERENCES import_batch(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS role (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS permission (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS role_permission (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  UNIQUE(role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES role(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permission(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS menu_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  group_name TEXT DEFAULT '业务功能',
  sort_no INTEGER DEFAULT 100,
  is_enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS role_menu (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id INTEGER NOT NULL,
  menu_item_id INTEGER NOT NULL,
  UNIQUE(role_id, menu_item_id),
  FOREIGN KEY (role_id) REFERENCES role(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_item(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_account (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role_id INTEGER NOT NULL,
  status INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (role_id) REFERENCES role(id)
);

CREATE TABLE IF NOT EXISTS session_token (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (user_id) REFERENCES user_account(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_code ON product(product_code);
CREATE INDEX IF NOT EXISTS idx_product_type ON product(product_type_id);
CREATE INDEX IF NOT EXISTS idx_product_factory ON product(factory_id);
CREATE INDEX IF NOT EXISTS idx_product_weight ON product(weight);
CREATE INDEX IF NOT EXISTS idx_product_small_stone ON product(small_stone_count);
CREATE INDEX IF NOT EXISTS idx_product_labor_cost ON product(labor_cost);
CREATE INDEX IF NOT EXISTS idx_order_no ON product_order(order_no);
CREATE INDEX IF NOT EXISTS idx_tag ON product_tag(tag);
CREATE INDEX IF NOT EXISTS idx_image_product ON product_image(product_id);
CREATE INDEX IF NOT EXISTS idx_user_role ON user_account(role_id);
CREATE INDEX IF NOT EXISTS idx_session_user ON session_token(user_id);
`);

function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
}

function seedBaseData() {
  const factoryCount = db.prepare('SELECT COUNT(*) AS c FROM base_factory').get().c;
  const typeCount = db.prepare('SELECT COUNT(*) AS c FROM base_product_type').get().c;

  if (factoryCount === 0) {
    const insFactory = db.prepare('INSERT INTO base_factory (code, name) VALUES (?, ?)');
    insFactory.run('F001', '深圳一厂');
    insFactory.run('F002', '广州二厂');
    insFactory.run('F003', '东莞三厂');
  }

  if (typeCount === 0) {
    const insType = db.prepare('INSERT INTO base_product_type (name) VALUES (?)');
    insType.run('戒指');
    insType.run('项链');
    insType.run('耳饰');
    insType.run('吊坠');
  }
}

function seedProducts() {
  const productCount = db.prepare('SELECT COUNT(*) AS c FROM product').get().c;
  if (productCount > 0) return;

  const typeMapRows = db.prepare('SELECT id, name FROM base_product_type').all();
  const factoryMapRows = db.prepare('SELECT id, code FROM base_factory').all();
  const typeMap = Object.fromEntries(typeMapRows.map((r) => [r.name, r.id]));
  const factoryMap = Object.fromEntries(factoryMapRows.map((r) => [r.code, r.id]));

  const insertProduct = db.prepare(`
    INSERT INTO product (
      product_code, product_type_id, factory_id, weight,
      small_stone_count, odd_stone_count, main_stone_count,
      main_stone_price, blank_price, plating_fee, labor_cost,
      plating_color, remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertOrder = db.prepare('INSERT OR IGNORE INTO product_order (product_id, order_no) VALUES (?, ?)');
  const insertTag = db.prepare('INSERT OR IGNORE INTO product_tag (product_id, tag) VALUES (?, ?)');
  const insertImage = db.prepare('INSERT OR IGNORE INTO product_image (product_id, image_name, image_path) VALUES (?, ?, ?)');

  const demo = [
    {
      product_code: 'P-10001',
      product_type: '戒指',
      factory_code: 'F001',
      weight: 2.36,
      small_stone_count: 8,
      odd_stone_count: 1,
      main_stone_count: 1,
      main_stone_price: 560,
      blank_price: 320,
      plating_fee: 45,
      labor_cost: 160,
      plating_color: '白金色',
      remark: '热销款',
      order_nos: ['SO-240501', 'SO-240588'],
      tags: ['现货', '展会'],
      image_name: 'P-10001.png',
      image_path: '/images/demo-ring-1.png',
    },
    {
      product_code: 'P-10002',
      product_type: '项链',
      factory_code: 'F002',
      weight: 5.42,
      small_stone_count: 16,
      odd_stone_count: 2,
      main_stone_count: 1,
      main_stone_price: 920,
      blank_price: 610,
      plating_fee: 62,
      labor_cost: 220,
      plating_color: '玫瑰金',
      remark: '定制款',
      order_nos: ['SO-240777'],
      tags: ['定制'],
      image_name: 'P-10002.png',
      image_path: '/images/demo-necklace-1.png',
    },
  ];

  for (const r of demo) {
    const result = insertProduct.run(
      r.product_code,
      typeMap[r.product_type] || null,
      factoryMap[r.factory_code] || null,
      r.weight,
      r.small_stone_count,
      r.odd_stone_count,
      r.main_stone_count,
      r.main_stone_price,
      r.blank_price,
      r.plating_fee,
      r.labor_cost,
      r.plating_color,
      r.remark
    );

    const productId = result.lastInsertRowid;
    for (const orderNo of r.order_nos) insertOrder.run(productId, orderNo);
    for (const tag of r.tags) insertTag.run(productId, tag);
    insertImage.run(productId, r.image_name, r.image_path);
  }
}

function seedAuth() {
  const roleCount = db.prepare('SELECT COUNT(*) AS c FROM role').get().c;
  if (roleCount === 0) {
    const ins = db.prepare('INSERT INTO role (code, name, remark) VALUES (?, ?, ?)');
    ins.run('admin', '管理员', '系统管理员');
    ins.run('operator', '录入员', '业务录入与查询');
  }

  const permCount = db.prepare('SELECT COUNT(*) AS c FROM permission').get().c;
  if (permCount === 0) {
    const ins = db.prepare('INSERT INTO permission (code, name, remark) VALUES (?, ?, ?)');
    ins.run('product.read', '产品查询', '查看产品数据');
    ins.run('product.write', '产品编辑', '新增/修改/删除产品');
    ins.run('import.manage', '导入管理', '主表导入与图片导入');
    ins.run('ai.use', '本地AI使用', '本地AI查询');
    ins.run('system.admin', '系统管理', '用户/角色/权限/菜单管理');
  }

  const menuCount = db.prepare('SELECT COUNT(*) AS c FROM menu_item').get().c;
  if (menuCount === 0) {
    const ins = db.prepare('INSERT INTO menu_item (key, name, path, group_name, sort_no, is_enabled) VALUES (?, ?, ?, ?, ?, ?)');
    ins.run('home', '主页', '/index.html', '业务功能', 10, 1);
    ins.run('products', '产品主表', '/products.html', '业务功能', 20, 1);
    ins.run('import-products', '主表导入', '/import-products.html', '业务功能', 30, 1);
    ins.run('import-images', '图片导入', '/import-images.html', '业务功能', 40, 1);
    ins.run('ai', '本地AI', '/ai.html', '业务功能', 50, 1);
    ins.run('users', '用户管理', '/users.html', '系统管理', 60, 1);
    ins.run('roles', '角色管理', '/roles.html', '系统管理', 70, 1);
    ins.run('permissions', '权限管理', '/permissions.html', '系统管理', 80, 1);
    ins.run('menus', '菜单管理', '/menus.html', '系统管理', 90, 1);
  }

  const adminRole = db.prepare("SELECT id FROM role WHERE code = 'admin'").get();
  const operatorRole = db.prepare("SELECT id FROM role WHERE code = 'operator'").get();

  if (adminRole) {
    const perms = db.prepare('SELECT id FROM permission').all();
    const menus = db.prepare('SELECT id FROM menu_item').all();
    const rp = db.prepare('INSERT OR IGNORE INTO role_permission (role_id, permission_id) VALUES (?, ?)');
    const rm = db.prepare('INSERT OR IGNORE INTO role_menu (role_id, menu_item_id) VALUES (?, ?)');
    for (const p of perms) rp.run(adminRole.id, p.id);
    for (const m of menus) rm.run(adminRole.id, m.id);
  }

  if (operatorRole) {
    const perms = db.prepare("SELECT id FROM permission WHERE code IN ('product.read', 'product.write', 'import.manage')").all();
    const menus = db.prepare("SELECT id FROM menu_item WHERE key IN ('home', 'products', 'import-products', 'import-images')").all();
    const rp = db.prepare('INSERT OR IGNORE INTO role_permission (role_id, permission_id) VALUES (?, ?)');
    const rm = db.prepare('INSERT OR IGNORE INTO role_menu (role_id, menu_item_id) VALUES (?, ?)');
    for (const p of perms) rp.run(operatorRole.id, p.id);
    for (const m of menus) rm.run(operatorRole.id, m.id);
  }

  const userCount = db.prepare('SELECT COUNT(*) AS c FROM user_account').get().c;
  if (userCount === 0 && adminRole) {
    const salt = crypto.randomBytes(16).toString('hex');
    const passHash = hashPassword('admin123', salt);
    db.prepare(`
      INSERT INTO user_account (username, password_hash, password_salt, role_id, status)
      VALUES (?, ?, ?, ?, 1)
    `).run('admin', passHash, salt, adminRole.id);
  }
}

function migrateSchema() {
  const menuCols = db.prepare("PRAGMA table_info(menu_item)").all().map((r) => r.name);
  if (!menuCols.includes('group_name')) {
    db.exec("ALTER TABLE menu_item ADD COLUMN group_name TEXT DEFAULT '业务功能'");
    db.exec("UPDATE menu_item SET group_name = CASE WHEN key IN ('users','roles','permissions','menus') THEN '系统管理' ELSE '业务功能' END");
  }
}

db.exec('BEGIN');
try {
  migrateSchema();
  seedBaseData();
  seedProducts();
  seedAuth();
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  throw err;
}

console.log(`Database initialized/migrated at: ${DB_PATH}`);
db.close();
