const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'storage', 'data');
const DB_PATH = path.join(DATA_DIR, 'oa.db');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getDb() {
  ensureDataDir();
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

module.exports = {
  getDb,
  DB_PATH,
};
