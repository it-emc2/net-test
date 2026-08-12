/* EMC² Admin Panel — vanilla JS, no external deps */

const TOKEN_KEY = 'emc2_admin_token';

const SECTIONS = [
  { id: 'shared',   label: 'Allgemein',           icon: 'fa-sliders' },
  { id: 'fahrt',    label: 'Arbeitszeit & Fahrt',  icon: 'fa-car' },
  { id: 'bu',       label: 'BU – Badumbau',        icon: 'fa-bath' },
  { id: 'bwt',      label: 'BWT – Badewannentür',  icon: 'fa-door-open' },
  { id: 'ah',       label: 'AH – Alltagshilfe',    icon: 'fa-hands-helping' },
  { id: 'zuschuss', label: 'Zuschüsse & Boni',     icon: 'fa-euro-sign' },
  { id: 'signing',  label: 'Signatur-Links',       icon: 'fa-file-signature', view: 'signing' },
  { id: 'bitrixlogs', label: 'Bitrix-Fehler',      icon: 'fa-triangle-exclamation', view: 'bitrixlogs' },
  { id: 'users',    label: 'Benutzer',             icon: 'fa-users', view: 'users' },
];

// ── Token helpers ─────────────────────────────────────────────────────────
function getToken() {
  const t = localStorage.getItem(TOKEN_KEY);
  if (!t) return null;
  const exp = Number(t.split('.')[0]);
  if (Date.now() > exp) { localStorage.removeItem(TOKEN_KEY); return null; }
  return t;
}
function saveToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

// ── API ───────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── State ─────────────────────────────────────────────────────────────────
let configItems = [];
let changes = new Map();
let currentSection = 'shared';

// ── DOM refs ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Utils ─────────────────────────────────────────────────────────────────
function show(el) { el && el.classList.remove('hidden'); }
function hide(el) { el && el.classList.add('hidden'); }

function formatNum(v, type) {
  if (v === null || v === undefined) return '';
  const n = Number(v);
  if (type === 'integer') return String(Math.round(n));
  // Show up to 4 decimal places, strip trailing zeros
  return String(parseFloat(n.toFixed(4)));
}

function stepFor(type) {
  if (type === 'integer') return '1';
  if (type === 'percent') return '0.001';
  return '0.01';
}

// ── Render sidebar nav ────────────────────────────────────────────────────
function renderNav() {
  const nav = $('sidebar-nav');
  if (!nav) return;
  nav.innerHTML = SECTIONS.map(s => {
    const cnt = configItems.filter(i => i.section === s.id && changes.has(i.key)).length;
    const active = s.id === currentSection ? ' active' : '';
    const badge = cnt > 0 ? `<span class="change-badge">${cnt}</span>` : '';
    return `<a href="#" class="nav-item${active}" data-section="${s.id}">
      <i class="fas ${s.icon} nav-icon"></i>
      <span>${s.label}</span>
      ${badge}
    </a>`;
  }).join('');

  nav.querySelectorAll('.nav-item').forEach(a =>
    a.addEventListener('click', e => { e.preventDefault(); switchSection(a.dataset.section); })
  );
}

// ── Switch section ────────────────────────────────────────────────────────
function switchSection(id) {
  currentSection = id;
  const sec = SECTIONS.find(s => s.id === id);
  $('section-title').textContent = sec ? sec.label : id;
  renderNav();

  // The signing/users views have no "save"; hide the config topbar controls.
  const view = sec && sec.view;
  const saveBtn = $('save-btn');
  if (saveBtn) saveBtn.classList.toggle('hidden', !!view);
  if (view) hide($('change-count'));
  if (view === 'signing') renderSigning();
  else if (view === 'bitrixlogs') renderBitrixLogs();
  else if (view === 'users') renderUsers();
  else renderSection();
}

// ── Render config cards ───────────────────────────────────────────────────
function renderSection() {
  const items = configItems
    .filter(i => i.section === currentSection)
    .sort((a, b) => a.order - b.order);

  const grid = $('config-grid');
  if (!items.length) {
    grid.innerHTML = '<div class="empty-state">Keine Einstellungen in diesem Bereich.</div>';
    return;
  }

  grid.innerHTML = items.map(buildCard).join('');

  items.forEach(item => {
    const input = $(`field-${item.key}`);
    if (input) {
      input.addEventListener('input', () => handleInput(item, input));
      input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
    }
    const resetBtn = $(`reset-${item.key}`);
    if (resetBtn) resetBtn.addEventListener('click', () => resetKey(item));
  });
}

function buildCard(item) {
  const pending = changes.has(item.key);
  const displayVal = pending ? changes.get(item.key) : item.value;
  const isModified = item.value !== item.defaultValue;

  return `<div class="config-card${pending ? ' card-changed' : ''}" id="card-${item.key}">
    <div class="card-header">
      <div class="card-label">${item.label}</div>
      ${item.unit ? `<span class="unit-badge">${item.unit}</span>` : ''}
    </div>
    <input
      type="number"
      id="field-${item.key}"
      class="config-input${pending ? ' input-changed' : ''}"
      value="${formatNum(displayVal, item.type)}"
      step="${stepFor(item.type)}"
    >
    <div class="card-footer">
      ${item.description ? `<p class="card-desc">${item.description}</p>` : ''}
      ${item.note ? `<p class="card-note"><i class="fas fa-info-circle"></i> ${item.note}</p>` : ''}
      <div class="card-meta">
        <span class="default-hint">Standard: ${formatNum(item.defaultValue, item.type)}${item.unit ? ' ' + item.unit : ''}</span>
        <button class="btn-ghost" id="reset-${item.key}" title="Auf Standardwert zurücksetzen">
          <i class="fas fa-undo"></i> Reset
        </button>
      </div>
    </div>
  </div>`;
}

// ── Input handler ─────────────────────────────────────────────────────────
function handleInput(item, input) {
  const raw = input.value.trim();
  const parsed = item.type === 'integer' ? parseInt(raw, 10) : parseFloat(raw);

  if (!isNaN(parsed)) {
    if (parsed !== item.value) {
      changes.set(item.key, parsed);
    } else {
      changes.delete(item.key);
    }
  } else {
    changes.delete(item.key);
  }

  const card = $(`card-${item.key}`);
  const isChanged = changes.has(item.key);
  card && card.classList.toggle('card-changed', isChanged);
  input.classList.toggle('input-changed', isChanged);

  updateTopbar();
  renderNav();
}

// ── Topbar state ──────────────────────────────────────────────────────────
function updateTopbar() {
  const cnt = changes.size;
  const saveBtn = $('save-btn');
  const saveLabel = $('save-label');
  const changeCount = $('change-count');

  if (saveBtn) saveBtn.disabled = cnt === 0;
  if (saveLabel) saveLabel.textContent = cnt > 0 ? `Speichern (${cnt})` : 'Speichern';
  if (changeCount) {
    changeCount.textContent = cnt > 0 ? `${cnt} Änderung${cnt > 1 ? 'en' : ''}` : '';
    cnt > 0 ? show(changeCount) : hide(changeCount);
  }
}

// ── Save ──────────────────────────────────────────────────────────────────
async function saveChanges() {
  if (!changes.size) return;
  const saveBtn = $('save-btn');
  const saveLabel = $('save-label');

  saveBtn.disabled = true;
  saveLabel.textContent = 'Wird gespeichert…';

  try {
    const payload = Object.fromEntries(changes);
    await api('PUT', '/admin/api/config', payload);

    changes.forEach((val, key) => {
      const item = configItems.find(i => i.key === key);
      if (item) item.value = val;
    });
    changes.clear();

    showStatus('Gespeichert!', 'success');
    renderSection();
    renderNav();
  } catch (err) {
    showStatus(`Fehler: ${err.message}`, 'error');
    saveBtn.disabled = false;
  }
  updateTopbar();
}

// ── Reset single key ──────────────────────────────────────────────────────
async function resetKey(item) {
  try {
    const data = await api('POST', '/admin/api/config/reset', { key: item.key });
    changes.delete(item.key);
    item.value = data.value;
    renderSection();
    renderNav();
    updateTopbar();
    showStatus(`"${item.label}" zurückgesetzt`, 'success');
  } catch (err) {
    showStatus(`Fehler: ${err.message}`, 'error');
  }
}

// ── Status toast ──────────────────────────────────────────────────────────
let statusTimer;
function showStatus(msg, type) {
  const el = $('save-status');
  if (!el) return;
  el.textContent = msg;
  el.className = `save-status status-${type}`;
  show(el);
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => hide(el), 3500);
}

// ── Signatur-Links view ────────────────────────────────────────────────────
const SIGN_STATUS = {
  sent: 'Gesendet', opened: 'Geöffnet', partially_signed: 'Teilw. unterschrieben',
  completed: 'Vollständig', expired: 'Abgelaufen',
};
const SIGN_STAT_ORDER = ['sent', 'opened', 'partially_signed', 'completed', 'expired'];
let signFilter = { q: '', status: '' };

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function fmtTs(d) {
  if (!d) return '<span class="ts none">–</span>';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '<span class="ts none">–</span>';
  return '<span class="ts">' + dt.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  }) + '</span>';
}

function renderSigning() {
  const grid = $('config-grid');
  grid.innerHTML = `<div class="signing-view">
    <div class="counts" id="sign-counts"></div>
    <div class="toolbar">
      <div class="search"><i class="fas fa-search"></i>
        <input type="text" id="sign-q" placeholder="Suche: Angebot, Name, E-Mail" value="${esc(signFilter.q)}"></div>
      <select id="sign-status">
        <option value="">Alle Status</option>
        ${SIGN_STAT_ORDER.map(s => `<option value="${s}"${signFilter.status === s ? ' selected' : ''}>${SIGN_STATUS[s]}</option>`).join('')}
      </select>
      <button class="btn-ghost" id="sign-refresh"><i class="fas fa-rotate"></i> Aktualisieren</button>
    </div>
    <div id="sign-err" class="sign-err hidden"></div>
    <div class="table-wrap">
      <table class="sign-table">
        <thead><tr>
          <th>Angebot</th><th>Kunde</th><th>Typ</th><th>Status</th><th>Dok.</th>
          <th>Gesendet</th><th>Geöffnet</th><th>Unterschrieben</th><th>Gültig bis</th><th></th>
        </tr></thead>
        <tbody id="sign-rows"><tr><td colspan="10"><div class="empty-state"><i class="fas fa-circle-notch fa-spin"></i> Lade…</div></td></tr></tbody>
      </table>
    </div>
  </div>`;

  const q = $('sign-q');
  q.addEventListener('input', () => { clearTimeout(window.__signq); window.__signq = setTimeout(() => { signFilter.q = q.value.trim(); loadSigning(); }, 300); });
  $('sign-status').addEventListener('change', e => { signFilter.status = e.target.value; loadSigning(); });
  $('sign-refresh').addEventListener('click', loadSigning);

  loadSigning();
}

function renderBitrixLogs() {
  const grid = $('config-grid');
  grid.innerHTML = `<div class="signing-view">
    <div class="toolbar">
      <button class="btn-ghost" id="bxlog-refresh"><i class="fas fa-rotate"></i> Aktualisieren</button>
    </div>
    <div id="bxlog-err" class="sign-err hidden"></div>
    <div class="table-wrap">
      <table class="sign-table">
        <thead><tr><th>Zeit</th><th>Bitrix-Methode</th><th>Fehler</th><th>Parameter</th><th>Status</th><th></th></tr></thead>
        <tbody id="bxlog-rows"><tr><td colspan="6"><div class="empty-state"><i class="fas fa-circle-notch fa-spin"></i> Lade…</div></td></tr></tbody>
      </table>
    </div>
  </div>`;

  $('bxlog-refresh').addEventListener('click', loadBitrixLogs);
  loadBitrixLogs();
}

async function loadBitrixLogs() {
  const err = $('bxlog-err');
  if (err) hide(err);
  try {
    const data = await api('GET', '/admin/api/bitrix-logs');
    const rows = $('bxlog-rows');
    if (!rows) return;
    if (!(data.items || []).length) {
      rows.innerHTML = '<tr><td colspan="6"><div class="empty-state">Keine Fehler in den letzten 30 Tagen.</div></td></tr>';
      return;
    }
    rows.innerHTML = data.items.map(it => `<tr>
      <td>${fmtTs(it.createdAt)}</td>
      <td>${esc(it.method)}</td>
      <td>${esc(it.message)}</td>
      <td><pre class="bxlog-params">${esc(JSON.stringify(it.params || {}, null, 2))}</pre></td>
      <td>${it.resolved ? '<span class="badge b-completed">Erledigt</span>' : '<span class="badge b-sent">Offen</span>'}</td>
      <td>${it.resolved ? '' : `<button class="btn-ghost" data-retry="${it._id}"><i class="fas fa-rotate-right"></i> Erneut senden</button>`}</td>
    </tr>`).join('');

    rows.querySelectorAll('button[data-retry]').forEach(b => {
      b.addEventListener('click', async () => {
        const id = b.getAttribute('data-retry');
        b.disabled = true;
        b.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
        try {
          await api('POST', `/admin/api/bitrix-logs/${id}/retry`);
          loadBitrixLogs();
        } catch (e) {
          b.disabled = false;
          b.innerHTML = '<i class="fas fa-rotate-right"></i> Erneut senden';
          window.alert('Erneut senden fehlgeschlagen: ' + (e.message || e));
        }
      });
    });
  } catch (e) {
    if (err) { err.textContent = e.message || 'Fehler beim Laden.'; show(err); }
  }
}

async function loadSigning() {
  const err = $('sign-err');
  if (err) hide(err);
  try {
    const params = new URLSearchParams();
    if (signFilter.q) params.set('q', signFilter.q);
    if (signFilter.status) params.set('status', signFilter.status);
    const data = await api('GET', '/admin/api/signing?' + params.toString());
    renderSigningData(data);
  } catch (e) {
    if (err) { err.textContent = e.message || 'Fehler beim Laden.'; show(err); }
  }
}

function renderSigningData(data) {
  const counts = data.counts || {};
  const cEl = $('sign-counts');
  if (cEl) cEl.innerHTML = SIGN_STAT_ORDER.map(s =>
    `<div class="stat"><div class="n">${counts[s] || 0}</div><div class="l">${SIGN_STATUS[s]}</div></div>`).join('');

  const origin = window.location.origin;
  const rows = $('sign-rows');
  if (!rows) return;
  if (!(data.items || []).length) {
    rows.innerHTML = '<tr><td colspan="10"><div class="empty-state">Keine Signatur-Links gefunden.</div></td></tr>';
    return;
  }
  rows.innerHTML = data.items.map(it => {
    const link = origin + '/sign/' + it.token;
    return `<tr>
      <td><strong>${esc(it.offerNumber || '–')}</strong></td>
      <td><div class="cust-name">${esc(it.customerName || '–')}</div><div class="cust-mail">${esc(it.customerEmail || '')}</div></td>
      <td><span class="type-badge">${it.customerType === 'KASSE' ? 'Kasse' : 'SZ'}</span></td>
      <td><span class="badge b-${it.status}">${SIGN_STATUS[it.status] || it.status}</span></td>
      <td class="prog">${it.signedCount}/${it.docCount}</td>
      <td>${fmtTs(it.createdAt)}</td>
      <td>${fmtTs(it.openedAt)}</td>
      <td>${fmtTs(it.completedAt)}</td>
      <td>${fmtTs(it.expiresAt)}</td>
      <td><button class="btn-ghost" data-link="${esc(link)}"><i class="fas fa-copy"></i> Kopieren</button></td>
    </tr>`;
  }).join('');

  rows.querySelectorAll('button[data-link]').forEach(b => {
    b.addEventListener('click', () => {
      const l = b.getAttribute('data-link');
      (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject())
        .then(() => { b.innerHTML = '<i class="fas fa-check"></i> Kopiert'; setTimeout(() => { b.innerHTML = '<i class="fas fa-copy"></i> Kopieren'; }, 1500); })
        .catch(() => window.prompt('Link kopieren:', l));
    });
  });
}

// ── Benutzer view ───────────────────────────────────────────────────────────
function renderUsers() {
  const grid = $('config-grid');
  grid.innerHTML = `<div class="signing-view">
    <div class="user-add">
      <h3>Benutzer hinzufügen / bearbeiten</h3>
      <div class="user-add-row">
        <input type="text" id="u-first" placeholder="Vorname">
        <input type="text" id="u-last" placeholder="Nachname">
        <input type="email" id="u-email" placeholder="E-Mail">
        <input type="password" id="u-pass" placeholder="Passwort (neu/ändern)">
        <select id="u-role"><option value="user">Benutzer</option><option value="admin">Admin</option></select>
        <button class="btn-primary" id="u-save"><i class="fas fa-plus"></i> Speichern</button>
      </div>
      <div id="u-msg" class="sign-err hidden"></div>
    </div>
    <div class="table-wrap">
      <table class="sign-table">
        <thead><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th>Aktiv</th><th>Unterschrift</th></tr></thead>
        <tbody id="u-rows"><tr><td colspan="5"><div class="empty-state"><i class="fas fa-circle-notch fa-spin"></i> Lade…</div></td></tr></tbody>
      </table>
    </div>
  </div>`;

  $('u-save').addEventListener('click', saveUser);
  loadUsers();
}

async function loadUsers() {
  try {
    const users = await api('GET', '/admin/api/users');
    const rows = $('u-rows');
    if (!users.length) { rows.innerHTML = '<tr><td colspan="5"><div class="empty-state">Keine Benutzer.</div></td></tr>'; return; }
    rows.innerHTML = users.map(u => `<tr>
      <td><strong>${u.name || '–'}</strong></td>
      <td>${u.email}</td>
      <td><span class="type-badge">${u.role === 'admin' ? 'Admin' : 'Benutzer'}</span></td>
      <td>${u.active ? 'Ja' : 'Nein'}</td>
      <td>
        <span class="badge ${u.hasSignature ? 'b-completed' : 'b-expired'}">${u.hasSignature ? 'vorhanden' : 'keine'}</span>
        <label class="btn-ghost" style="cursor:pointer;margin-left:8px;">
          <i class="fas fa-upload"></i> Hochladen
          <input type="file" accept="image/png,image/jpeg" data-email="${u.email}" style="display:none;">
        </label>
      </td>
    </tr>`).join('');
    rows.querySelectorAll('input[type="file"][data-email]').forEach(inp => {
      inp.addEventListener('change', () => uploadSignature(inp.dataset.email, inp.files[0]));
    });
  } catch (e) {
    $('u-rows').innerHTML = `<tr><td colspan="5"><div class="empty-state">${e.message}</div></td></tr>`;
  }
}

async function saveUser() {
  const msg = $('u-msg');
  hide(msg);
  const body = {
    firstName: $('u-first').value.trim(),
    lastName: $('u-last').value.trim(),
    email: $('u-email').value.trim(),
    password: $('u-pass').value,
    role: $('u-role').value,
  };
  if (!body.email) { msg.textContent = 'E-Mail erforderlich'; show(msg); return; }
  try {
    await api('POST', '/admin/api/users', body);
    $('u-first').value = ''; $('u-last').value = ''; $('u-email').value = ''; $('u-pass').value = '';
    loadUsers();
  } catch (e) { msg.textContent = e.message; show(msg); }
}

function uploadSignature(email, file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      await api('POST', `/admin/api/users/${encodeURIComponent(email)}/signature`, { dataUrl: reader.result });
      loadUsers();
    } catch (e) { alert('Upload fehlgeschlagen: ' + e.message); }
  };
  reader.readAsDataURL(file);
}

// ── Login ─────────────────────────────────────────────────────────────────
async function doLogin(email, password) {
  const data = await api('POST', '/admin/api/login', { email, password });
  saveToken(data.token);
}

// ── Load config ───────────────────────────────────────────────────────────
async function loadConfig() {
  configItems = await api('GET', '/admin/api/config');
  renderNav();
  renderSection();
  updateTopbar();
}

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const loginOverlay = $('login-overlay');
  const app = $('app');
  const loginForm = $('login-form');
  const loginError = $('login-error');
  const saveBtn = $('save-btn');
  const logoutBtn = $('logout-btn');

  function showApp()   { hide(loginOverlay); show(app); }
  function showLogin() { show(loginOverlay); hide(app); }

  async function init() {
    if (!getToken()) { showLogin(); return; }
    showApp();
    try {
      await loadConfig();
    } catch (err) {
      clearToken();
      showLogin();
    }
  }

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('email') ? $('email').value : '';
    const pw = $('password').value;
    hide(loginError);
    $('login-btn').disabled = true;
    try {
      await doLogin(email, pw);
      showApp();
      await loadConfig();
    } catch (err) {
      loginError.textContent = err.message || 'Login fehlgeschlagen';
      show(loginError);
    } finally {
      $('login-btn').disabled = false;
    }
  });

  saveBtn.addEventListener('click', saveChanges);

  logoutBtn.addEventListener('click', () => {
    clearToken();
    changes.clear();
    configItems = [];
    showLogin();
  });

  // Set initial section title
  $('section-title').textContent = SECTIONS[0].label;

  init();
});
