(function () {
  'use strict';

  const SUPABASE_URL = 'https://keqpovuyzfjxdgxtpebz.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_LnufWt6Oab43qCxVCErK8w_HfHDVSu2';
  const SESSION_KEY = 'keepRichCloudSessionV1';
  const LAST_USER_KEY = 'keepRichLastCloudUserV1';
  const DIRTY_KEY = 'keepRichCloudDirtyV1';
  const LOCAL_PREVIEW = ['127.0.0.1', 'localhost'].includes(location.hostname) && new URLSearchParams(location.search).has('preview');
  const SHIFT_KEY = 'keepRichShiftsV2';
  const PAYSTUB_KEY = 'keepRichPaystubsV1';
  const VIEW_KEY = 'keepRichPayDateViewV1';
  const PAY_SCHEDULE_KEY = 'keepRichPayScheduleV1';
  const $ = selector => document.querySelector(selector);
  const readJson = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value ?? fallback;
    } catch {
      return fallback;
    }
  };
  let session = readJson(SESSION_KEY, null);
  let syncQueue = Promise.resolve();

  function trackerPayload() {
    const shifts = readJson(SHIFT_KEY, []);
    const paystubs = readJson(PAYSTUB_KEY, []);
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      shifts: Array.isArray(shifts) ? shifts : [],
      paystubs: Array.isArray(paystubs) ? paystubs : [],
      preferences: { dashboardPayDate: localStorage.getItem(VIEW_KEY) || 'all', paySchedule: readJson(PAY_SCHEDULE_KEY, null) }
    };
  }

  function setSession(next) {
    session = next;
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else localStorage.removeItem(SESSION_KEY);
  }

  function authHeaders(token) {
    return {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token || SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json'
    };
  }

  async function responseData(response) {
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) throw new Error(data?.msg || data?.message || data?.error_description || data?.error || 'Account service error.');
    return data;
  }

  async function authRequest(path, body) {
    return responseData(await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(body || {})
    }));
  }

  async function ensureSession() {
    if (!session?.access_token) return null;
    const expiresAt = Number(session.expires_at || 0);
    if (!expiresAt || expiresAt * 1000 > Date.now() + 60000) return session;
    if (!session.refresh_token) return null;
    try {
      const refreshed = await authRequest('/token?grant_type=refresh_token', { refresh_token: session.refresh_token });
      setSession(refreshed);
      return refreshed;
    } catch {
      setSession(null);
      return null;
    }
  }

  async function rest(path, options = {}) {
    const current = await ensureSession();
    if (!current) throw new Error('Please sign in again.');
    const headers = authHeaders(current.access_token);
    if (options.prefer) headers.Prefer = options.prefer;
    return responseData(await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: options.method || 'GET', headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    }));
  }

  function setCloudStatus(label, detail, kind = '') {
    const state = $('#cloud-state');
    if (state) { state.textContent = label; state.dataset.state = kind || label.toLowerCase().replace(/\s+/g, '-'); }
    if ($('#cloud-detail')) $('#cloud-detail').textContent = detail;
  }

  function showSignedIn(user) {
    const email = user?.email || session?.user?.email || '';
    if ($('#account-email')) $('#account-email').textContent = email;
    $('#account-auth').hidden = true;
    $('#cloud-sync-now').hidden = false;
    $('#account-signout').hidden = false;
  }

  function showSignedOut(message = '') {
    if ($('#account-email')) $('#account-email').textContent = 'Local browser';
    $('#account-auth').hidden = false;
    $('#cloud-sync-now').hidden = true;
    $('#account-signout').hidden = true;
    setCloudStatus('Device only', message || 'Your data is saved in this browser. Email sync is optional.', 'device-only');
  }

  function loadPayload(payload) {
    if (!payload || !Array.isArray(payload.shifts) || !Array.isArray(payload.paystubs)) throw new Error('Cloud data is not in a recognized format.');
    localStorage.setItem(SHIFT_KEY, JSON.stringify(payload.shifts));
    localStorage.setItem(PAYSTUB_KEY, JSON.stringify(payload.paystubs));
    if (payload.preferences?.dashboardPayDate) localStorage.setItem(VIEW_KEY, payload.preferences.dashboardPayDate);
    if (payload.preferences?.paySchedule) localStorage.setItem(PAY_SCHEDULE_KEY, JSON.stringify(payload.preferences.paySchedule));
    else localStorage.removeItem(PAY_SCHEDULE_KEY);
    window.dispatchEvent(new Event('tracker:data-loaded'));
  }

  function clearLocalTracker() {
    localStorage.setItem(SHIFT_KEY, '[]');
    localStorage.setItem(PAYSTUB_KEY, '[]');
    localStorage.removeItem(VIEW_KEY);
    localStorage.removeItem(PAY_SCHEDULE_KEY);
    localStorage.removeItem(DIRTY_KEY);
    window.dispatchEvent(new Event('tracker:data-loaded'));
  }

  async function upload(reason = 'saved change') {
    const current = await ensureSession();
    if (!current?.user?.id) return false;
    const payload = trackerPayload();
    await rest('keep_rich_tracker?on_conflict=user_id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: { user_id: current.user.id, payload, updated_at: payload.updatedAt }
    });
    localStorage.removeItem(DIRTY_KEY);
    const time = new Date().toLocaleString();
    $('#cloud-last').textContent = time;
    setCloudStatus('Synced', `${reason} is available on your other devices.`, 'synced');
    return true;
  }

  async function hydrate() {
    const current = await ensureSession();
    if (!current?.user?.id) { showSignedOut(); return; }
    showSignedIn(current.user);
    setCloudStatus('Connecting', 'Checking for your saved tracker data…', 'connecting');
    localStorage.setItem(LAST_USER_KEY, current.user.id);
    try {
      if (localStorage.getItem(DIRTY_KEY) === '1') {
        await upload('Your offline changes');
        return;
      }
      const rows = await rest(`keep_rich_tracker?user_id=eq.${encodeURIComponent(current.user.id)}&select=payload,updated_at&limit=1`);
      if (Array.isArray(rows) && rows[0]?.payload) {
        loadPayload(rows[0].payload);
        $('#cloud-last').textContent = rows[0].updated_at ? new Date(rows[0].updated_at).toLocaleString() : 'Just now';
        setCloudStatus('Synced', 'Your account data is loaded on this device.', 'synced');
      } else {
        await upload('Your existing browser data');
      }
    } catch (error) {
      console.error(error);
      const setupNeeded = /keep_rich_tracker|schema cache|relation/i.test(error.message);
      setCloudStatus(setupNeeded ? 'Setup needed' : 'Offline', setupNeeded ? 'Your account works, but the tracker database still needs its one-time setup.' : 'Your browser copy is safe. Sync will retry when the connection returns.', setupNeeded ? 'setup-needed' : 'offline');
    }
  }

  function changed(reason) {
    localStorage.setItem(DIRTY_KEY, '1');
    setCloudStatus(session ? 'Saving…' : 'Device only', session ? 'Updating your account…' : 'Sign in to sync this change.', session ? 'saving' : 'device-only');
    syncQueue = syncQueue.then(() => upload(reason)).catch(error => {
      console.error(error);
      setCloudStatus('Pending sync', 'Saved safely in this browser. The account copy will update when sync is available.', 'pending');
    });
    return syncQueue;
  }

  function switchAuthMode(mode) {
    const create = mode === 'create';
    $('#auth-heading').textContent = create ? 'Create your optional account' : 'Save and sync across devices';
    $('#auth-submit').textContent = create ? 'Create account & sync' : 'Sign in & sync';
    $('#auth-mode').value = mode;
    $('#auth-password').autocomplete = create ? 'new-password' : 'current-password';
    $('#auth-toggle').textContent = create ? 'Already have an account? Sign in' : 'New here? Create an account';
    $('#auth-status').textContent = create ? 'Create one private account for your phone and computer.' : 'Sign in only if you want this browser copy saved to your email account.';
  }

  $('#auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    const email = $('#auth-email').value.trim().toLowerCase();
    const password = $('#auth-password').value;
    const mode = $('#auth-mode').value;
    $('#auth-submit').disabled = true;
    $('#auth-status').textContent = mode === 'create' ? 'Creating your account…' : 'Signing in…';
    try {
      const data = mode === 'create'
        ? await authRequest('/signup', { email, password })
        : await authRequest('/token?grant_type=password', { email, password });
      if (data?.access_token) {
        setSession(data);
        $('#auth-form').reset();
        await hydrate();
      } else {
        $('#auth-status').textContent = 'Check your email to confirm the account, then return here and sign in.';
      }
    } catch (error) {
      $('#auth-status').textContent = error.message;
    } finally {
      $('#auth-submit').disabled = false;
    }
  });

  $('#auth-toggle').addEventListener('click', () => switchAuthMode($('#auth-mode').value === 'create' ? 'signin' : 'create'));
  $('#auth-forgot').addEventListener('click', async () => {
    const email = $('#auth-email').value.trim().toLowerCase();
    if (!email) { $('#auth-status').textContent = 'Enter your email first, then choose Reset password.'; return; }
    try {
      await authRequest('/recover', { email, redirect_to: location.href.split('#')[0] });
      $('#auth-status').textContent = 'Password reset email sent.';
    } catch (error) { $('#auth-status').textContent = error.message; }
  });

  $('#account-signout').addEventListener('click', async () => {
    const current = await ensureSession();
    try {
      if (current) await responseData(await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: authHeaders(current.access_token) }));
    } catch {}
    setSession(null);
    clearLocalTracker();
    $('#cloud-last').textContent = 'Not signed in';
    showSignedOut('Signed out. This device is clear, and your account copy remains safely online.');
  });
  $('#cloud-sync-now').addEventListener('click', () => changed('Manual sync'));
  $('#cloud-download').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ format: 'keep-rich-tracker-backup', ...trackerPayload() }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `keep-rich-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  $('#cloud-restore').addEventListener('click', () => $('#cloud-import').click());
  $('#cloud-import').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.shifts) || !Array.isArray(data.paystubs)) throw new Error('That is not a Keep Rich backup file.');
      if (!confirm(`Restore ${data.shifts.length} shifts and ${data.paystubs.length} paystubs?`)) return;
      loadPayload(data); await changed('Restored backup');
    } catch (error) { setCloudStatus('Restore failed', error.message, 'offline'); }
    event.target.value = '';
  });
  window.addEventListener('online', () => { if (localStorage.getItem(DIRTY_KEY) === '1') changed('Pending changes'); });

  window.KeepRichCloud = { changed, hydrate, payload: trackerPayload };
  switchAuthMode('signin');
  if (LOCAL_PREVIEW) {
    showSignedOut('Local preview. Nothing here is synced unless you sign in.');
  } else {
    hydrate();
  }
})();
