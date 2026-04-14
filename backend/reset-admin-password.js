const crypto = require('crypto');
const { getDb } = require('./db');

function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
}

const db = getDb();
const admin = db.prepare("SELECT id FROM user_account WHERE username = 'admin' LIMIT 1").get();
if (!admin) {
  console.error('admin 用户不存在，请先执行 npm run init-db');
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString('hex');
const passHash = hashPassword('admin123', salt);
db.prepare("UPDATE user_account SET password_hash = ?, password_salt = ?, status = 1, updated_at = datetime('now','localtime') WHERE id = ?").run(passHash, salt, admin.id);

db.prepare('DELETE FROM session_token WHERE user_id = ?').run(admin.id);
db.close();

console.log('admin 密码已重置为 admin123，账号已启用。');
