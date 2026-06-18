/* EMC² Admin Panel — vanilla JS, no external deps */

const TOKEN_KEY = 'emc2_admin_token';

const SECTIONS = [
  { id: 'shared',   label: 'Allgemein',           icon: 'fa-sliders' },
  { id: 'fahrt',    label: 'Arbeitszeit & Fahrt',  icon: 'fa-car' },
  { id: 'bu',       label: 'BU – Badumbau',        icon: 'fa-bath' },
  { id: 'bwt',      label: 'BWT – Badewannentür',  icon: 'fa-door-open' },
  { id: 'zuschuss', label: 'Zuschüsse & Boni',     icon: 'fa-euro-sign' },
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
  renderSection();
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

// ── Login ─────────────────────────────────────────────────────────────────
async function doLogin(password) {
  const data = await api('POST', '/admin/api/login', { password });
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
    const pw = $('password').value;
    hide(loginError);
    $('login-btn').disabled = true;
    try {
      await doLogin(pw);
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
