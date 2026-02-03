/**
 * Persists and reads the admin session (accessToken + refreshToken)
 * from ~/.ecomon/session.json.  Nothing else touches this file.
 */
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { join } = require('path');
const os = require('os');

const DIR  = join(os.homedir(), '.ecomon');
const FILE = join(DIR, 'session.json');

function load() {
  if (!existsSync(FILE)) return null;
  try { return JSON.parse(readFileSync(FILE, 'utf8')); }
  catch { return null; }
}

function save(session) {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 });
  writeFileSync(FILE, JSON.stringify(session, null, 2), { mode: 0o600 });
}

function clear() {
  if (existsSync(FILE)) require('fs').unlinkSync(FILE);
}

module.exports = { load, save, clear };
