#!/usr/bin/env node
/**
 * EcoMon end-to-end test script.
 *
 * Usage:
 *   node test.js                          — runs auth steps only (register → login → security checks → refresh → logout)
 *   node test.js --access-key=KEY --secret-key=SECRET   — also stores EcoFlow creds and hits the real DELTA 2 API
 *
 * The app must be running: npm run start:dev   (port 3030)
 */

const BASE = 'http://localhost:3030';

// ── helpers ───────────────────────────────────────────────────────────────────
async function req(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

function pass(label) { console.log(`  ✅  ${label}`); }
function fail(label, detail) { console.log(`  ❌  ${label}`); if (detail) console.log(`      → ${detail}`); }
function section(title) { console.log(`\n── ${title} ──`); }

// ── main ──────────────────────────────────────────────────────────────────────
(async () => {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const hit = args.find(a => a.startsWith(flag));
    return hit ? hit.split('=')[1] : null;
  };
  const accessKey = get('--access-key');
  const secretKey = get('--secret-key');
  const ecoflowMode = !!(accessKey && secretKey);

  console.log('EcoMon test script');
  console.log(`Target: ${BASE}`);
  console.log(`EcoFlow credentials: ${ecoflowMode ? 'provided' : 'not provided — auth-only mode'}\n`);

  // ── 1. Register ─────────────────────────────────────────────────────────
  section('1. Register (first user → admin, then locked)');
  const reg = await req('POST', '/auth/register', {
    body: { email: 'serhii@test.com', password: 'SecurePass1$' },
  });
  if (reg.status === 201) {
    pass('First user registered');
    if (reg.body?.user?.password) fail('password leaked in response');
    else pass('Password not in response');
    if (reg.body?.user?.role === 'admin') pass('Role = admin');
    else fail('Role = admin', `got role=${reg.body?.user?.role}`);

    // Second registration attempt must be blocked
    const reg2 = await req('POST', '/auth/register', {
      body: { email: 'attacker@evil.com', password: 'SecurePass1$' },
    });
    if (reg2.status === 403) pass('Second registration → 403 Forbidden');
    else fail('Second registration blocked', `got ${reg2.status}`);

  } else if (reg.status === 403) {
    pass('Registration already locked (user exists) — continuing');
  } else {
    fail('Register', JSON.stringify(reg));
    process.exit(1);
  }

  // ── 2. Login ────────────────────────────────────────────────────────────
  section('2. Login');
  const login = await req('POST', '/auth/login', {
    body: { email: 'serhii@test.com', password: 'SecurePass1$' },
  });
  if (login.status !== 200 || !login.body?.accessToken) {
    fail('Login', JSON.stringify(login));
    process.exit(1);
  }
  let TOKEN = login.body.accessToken;
  let REFRESH = login.body.refreshToken;
  const OLD_REFRESH = REFRESH;           // save for step 9
  pass(`Got accessToken  (${TOKEN.slice(0,30)}…)`);
  pass(`Got refreshToken (${REFRESH.slice(0,30)}…)`);
  pass(`expiresIn = ${login.body.expiresIn}s`);

  // ── 6. Security checks (no EcoFlow creds needed) ───────────────────────
  section('6. Security checks');

  // 6a — no token → 401
  const noToken = await req('GET', '/ecoflow/devices');
  if (noToken.status === 401) pass('No token → 401');
  else fail('No token → 401', `got ${noToken.status}`);

  // 6b — fake token → 401
  const fakeToken = await req('GET', '/ecoflow/devices', { token: 'eyJhbGci.fake.token' });
  if (fakeToken.status === 401) pass('Fake token → 401');
  else fail('Fake token → 401', `got ${fakeToken.status}`);

  // ── 7. Refresh ──────────────────────────────────────────────────────────
  section('7. Token refresh');
  const refreshed = await req('POST', '/auth/refresh', { body: { refreshToken: REFRESH } });
  if (refreshed.status === 200 && refreshed.body?.accessToken) {
    TOKEN  = refreshed.body.accessToken;
    REFRESH = refreshed.body.refreshToken;
    pass('New accessToken  obtained');
    pass('New refreshToken obtained');
  } else {
    fail('Refresh', JSON.stringify(refreshed));
  }

  // ── 9. Old refresh token is revoked ─────────────────────────────────────
  section('9. Old refresh token revoked');
  const oldRefreshTry = await req('POST', '/auth/refresh', { body: { refreshToken: OLD_REFRESH } });
  if (oldRefreshTry.status === 401) pass('Old refreshToken correctly rejected');
  else fail('Old refreshToken revoked', `got ${oldRefreshTry.status}`);

  // ── 8. Change password ─────────────────────────────────────────────────
  section('8. Change password');

  // 8a — wrong current password → 401
  const cpBad = await req('PATCH', '/auth/password', {
    token: TOKEN,
    body: { currentPassword: 'WrongPassword1$', newPassword: 'NewSecurePass2$' },
  });
  if (cpBad.status === 401) pass('Wrong current password → 401');
  else fail('Wrong current password → 401', `got ${cpBad.status}`);

  // 8b — correct current password → 200, all sessions revoked
  const cpGood = await req('PATCH', '/auth/password', {
    token: TOKEN,
    body: { currentPassword: 'SecurePass1$', newPassword: 'NewSecurePass2$' },
  });
  if (cpGood.status === 200) {
    pass('Password changed');
    pass(cpGood.body?.message || '');
  } else {
    fail('Change password', JSON.stringify(cpGood));
  }

  // 8c — old refresh token must be revoked after password change
  const cpOldRefresh = await req('POST', '/auth/refresh', { body: { refreshToken: REFRESH } });
  if (cpOldRefresh.status === 401) pass('Refresh token revoked after password change');
  else fail('Refresh token revoked after password change', `got ${cpOldRefresh.status}`);

  // 8d — login with NEW password works
  const loginNew = await req('POST', '/auth/login', {
    body: { email: 'serhii@test.com', password: 'NewSecurePass2$' },
  });
  if (loginNew.status === 200) {
    TOKEN  = loginNew.body.accessToken;
    REFRESH = loginNew.body.refreshToken;
    pass('Login with new password works');
  } else {
    fail('Login with new password', JSON.stringify(loginNew));
  }

  // 8e — login with OLD password fails
  const loginOld = await req('POST', '/auth/login', {
    body: { email: 'serhii@test.com', password: 'SecurePass1$' },
  });
  if (loginOld.status === 401) pass('Old password correctly rejected');
  else fail('Old password rejected', `got ${loginOld.status}`);

  // ── 10. Logout ──────────────────────────────────────────────────────────
  section('10. Logout');
  const logout = await req('POST', '/auth/logout', { token: TOKEN, body: { refreshToken: REFRESH } });
  if (logout.status === 200) pass('Logout successful');
  else fail('Logout', JSON.stringify(logout));

  // ── EcoFlow steps (only if keys provided) ──────────────────────────────
  if (!ecoflowMode) {
    console.log('\n── Done (auth-only) ──');
    console.log('To test EcoFlow, re-login first then run:');
    console.log('  node test.js --access-key=YOUR_KEY --secret-key=YOUR_SECRET\n');
    process.exit(0);
  }

  // Re-login to get a fresh token for EcoFlow steps
  section('Re-login for EcoFlow steps');
  const login2 = await req('POST', '/auth/login', {
    body: { email: 'serhii@test.com', password: 'SecurePass1$' },
  });
  if (login2.status !== 200) { fail('Re-login', JSON.stringify(login2)); process.exit(1); }
  TOKEN = login2.body.accessToken;
  pass('Fresh token ready');

  // ── 3. Store EcoFlow credentials ────────────────────────────────────────
  section('3. Store EcoFlow credentials');
  const store = await req('POST', '/ecoflow/credentials', {
    token: TOKEN,
    body: { accessKey, secretKey, label: 'Home DELTA 2' },
  });
  if (store.status === 201 || store.status === 200) {
    pass(`Credentials stored — id: ${store.body?.id}`);
  } else {
    fail('Store credentials', JSON.stringify(store));
    process.exit(1);
  }

  // ── 4. Get device list ──────────────────────────────────────────────────
  section('4. Get device list');
  const devices = await req('GET', '/ecoflow/devices', { token: TOKEN });
  if (devices.status !== 200) { fail('Get devices', JSON.stringify(devices)); process.exit(1); }
  console.log('  Response:', JSON.stringify(devices.body, null, 2));

  const deviceList = devices.body?.data ?? devices.body;
  if (Array.isArray(deviceList) && deviceList.length > 0) {
    pass(`Found ${deviceList.length} device(s)`);
    deviceList.forEach(d => console.log(`      • ${d.deviceName || d.sn}  (sn: ${d.sn}, online: ${d.online})`));
  } else {
    fail('No devices returned');
  }

  // ── 5. Get DELTA 2 live status ──────────────────────────────────────────
  if (Array.isArray(deviceList) && deviceList.length > 0) {
    const sn = deviceList[0].sn;
    section(`5. Live status — ${sn}`);
    const status = await req('GET', `/ecoflow/devices/${sn}/status`, { token: TOKEN });
    if (status.status === 200) {
      pass('Got live status');
      console.log('  Response:', JSON.stringify(status.body, null, 2));
    } else {
      fail('Get status', JSON.stringify(status));
    }

    // 6c — fake device SN → 403
    section('6c. Fake device SN → 403');
    const fakeSn = await req('GET', '/ecoflow/devices/FAKE000SN/status', { token: TOKEN });
    if (fakeSn.status === 403) pass('Fake SN → 403');
    else fail('Fake SN → 403', `got ${fakeSn.status}: ${JSON.stringify(fakeSn.body)}`);
  }

  console.log('\n── All done ──\n');
})();
