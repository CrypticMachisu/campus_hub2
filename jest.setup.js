// Closes your MySQL pool after each test file so Jest exits cleanly.
// Only matters when tests import ./app directly (i.e. BASE_URL is NOT set).
// If your pool lives somewhere else, add its path to the list below.
afterAll(async () => {
  if (process.env.BASE_URL) return;
  for (const p of ['./db', './config/db', './database', './config/database']) {
    let mod;
    try { mod = require(p); } catch { continue; }
    const pool = mod.pool || mod;
    if (pool && typeof pool.end === 'function') {
      try { await pool.end(); } catch { /* already closed */ }
    }
    return;
  }
});
