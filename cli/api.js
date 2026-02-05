/**
 * Thin HTTP layer.  Every public method maps 1-to-1 to a REST endpoint.
 * Handles token refresh transparently: if a call gets 401 and we have a
 * refreshToken, we try once to rotate, then retry.
 */
const session = require('./session');

const BASE = process.env.ECOMON_API || 'http://localhost:3030';

// ── low-level ────────────────────────────────────────────────────────────────
async function raw(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: json };
}

// ── token management ─────────────────────────────────────────────────────────
async function refreshToken() {
  const s = session.load();
  if (!s?.refreshToken) return null;

  const res = await raw('POST', '/auth/refresh', { body: { refreshToken: s.refreshToken } });
  if (res.status !== 200) { session.clear(); return null; }

  // Persist the new pair
  session.save({ ...s, accessToken: res.body.accessToken, refreshToken: res.body.refreshToken });
  return res.body.accessToken;
}

/**
 * Authenticated request.  Transparently refreshes on 401.
 */
async function authed(method, path, opts = {}) {
  const s = session.load();
  if (!s?.accessToken) {
    console.error('Not logged in. Run: ecomon login');
    process.exit(1);
  }

  let res = await raw(method, path, { ...opts, token: s.accessToken });

  if (res.status === 401) {
    const newToken = await refreshToken();
    if (!newToken) {
      console.error('Session expired. Run: ecomon login');
      process.exit(1);
    }
    res = await raw(method, path, { ...opts, token: newToken });
  }

  return res;
}

// ── public API ───────────────────────────────────────────────────────────────
module.exports = {
  // Auth
  register:       (email, password)   => raw('POST',   '/auth/register',  { body: { email, password } }),
  login:          (email, password)   => raw('POST',   '/auth/login',     { body: { email, password } }),
  logout:         (refreshToken)      => authed('POST', '/auth/logout',   { body: { refreshToken } }),
  changePassword: (cur, next)         => authed('PATCH','/auth/password', { body: { currentPassword: cur, newPassword: next } }),

  // EcoFlow – credentials
  storeCredentials: (accessKey, secretKey, label) =>
                                          authed('POST',   '/ecoflow/credentials', { body: { accessKey, secretKey, label } }),
  deleteCredentials:()                 => authed('DELETE', '/ecoflow/credentials'),

  // EcoFlow – devices
  getDevices:     ()                   => authed('GET',  '/ecoflow/devices'),
  getStatus:      (sn, { raw = false } = {}) => authed('GET',  `/ecoflow/devices/${sn}/status${raw ? '?raw=true' : ''}`),
  sendCommand:    (sn, params)         => authed('POST', `/ecoflow/devices/${sn}/command`, { body: { params } }),

  // EcoFlow – monitor
  monitorStart:   (devices)            => authed('POST',   '/ecoflow/monitor/start', devices ? { body: { devices } } : {}),
  monitorStop:    ()                   => authed('DELETE',  '/ecoflow/monitor/stop'),
  monitorStatus:  ()                   => authed('GET',    '/ecoflow/monitor/status'),

  // Audit
  getAudit:       ()                   => authed('GET',  '/audit'),   // placeholder – extend later

  // internals exposed for login flow
  _session: session,
};
