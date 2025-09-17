/* ========== THEME ========== */
const root = document.documentElement;
const themeToggle = document.getElementById('themeToggle');
const themeLabel = document.getElementById('themeLabel');
function applyTheme(mode){
  root.setAttribute('data-theme', mode === 'dark' ? 'dark' : 'light');
  if (themeToggle) themeToggle.checked = (mode === 'dark');
  if (themeLabel) themeLabel.textContent = mode === 'dark' ? 'Dark' : 'Light';
  localStorage.setItem('nt-theme', mode);
}
(function initTheme(){
  const saved = localStorage.getItem('nt-theme');
  if (saved) return applyTheme(saved);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark ? 'dark' : 'light');
})();
themeToggle?.addEventListener('change',()=>applyTheme(themeToggle.checked?'dark':'light'));

/* ========== WIZARD NAV ========== */
const steps = ['bereich','duschwanne','wandverkleidung','optional','zusammenfassung'];
const nav = document.getElementById('stepsNav');
const pages = Object.fromEntries(steps.map(s => [s, document.getElementById('page-'+s)]));

function getCurrentStep(){
  const h = location.hash.replace('#','');
  return steps.includes(h) ? h : steps[0];
}
function setStep(step){
  steps.forEach((s) => {
    const link = nav?.querySelector(`[data-step="${s}"]`);
    if (link){
      link.classList.remove('active','done');
      if (s === step) link.classList.add('active');
      else if (steps.indexOf(s) < steps.indexOf(step)) link.classList.add('done');
    }
    const page = pages[s];
    if (page) page.hidden = s !== step;
  });
  location.hash = step;
  updateSummary();
}
nav?.addEventListener('click', (e) => {
  const a = e.target.closest('a.step'); if (!a) return;
  e.preventDefault();
  setStep(a.dataset.step);
});
setStep(getCurrentStep());
window.addEventListener('hashchange', () => setStep(getCurrentStep()));

/* ========== SUMMARY / PAYLOAD / STATUS ========== */
function formToObject(form){ return Object.fromEntries(new FormData(form).entries()); }
function buildPayload(){
  return {
    bereich: formToObject(document.getElementById('form-bereich')),
    duschwanne: formToObject(document.getElementById('form-duschwanne')),
    wandverkleidung: formToObject(document.getElementById('form-wandverkleidung')),
    optional: formToObject(document.getElementById('form-optional'))
  };
}
function updateSummary(){
  if (getCurrentStep() !== 'zusammenfassung') return;
  const el = document.getElementById('summaryText');
  if (el) el.textContent = 'Vorschau: ' + JSON.stringify(buildPayload());
}
const statusEl = document.getElementById('status');
function show(obj, ok=true){
  if (!statusEl) return;
  statusEl.className = 'status ' + (ok ? 'ok' : 'err');
  statusEl.textContent = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
}

/* Helpers */
function flashInvalid(el){
  if (!el) return;
  el.style.borderColor = 'var(--danger)';
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(()=> el.style.borderColor = '', 1200);
}

/* ========== VALIDATORS ========== */
function validateBereich(){
  const form = document.getElementById('form-bereich');
  if (!form) return true;
  const d = document.getElementById('date'); if (d && !d.value) d.valueAsDate = new Date();

  const requiredIds = ['date','firstName','lastName','customerNumber'];
  let firstBad = null;
  requiredIds.forEach(id => {
    const el = document.getElementById(id);
    const bad = !el || !el.value || (el.type === 'date' && isNaN(new Date(el.value).getTime()));
    if (bad && !firstBad) firstBad = el;
  });

  const needRadios = ['salutation','hasContactPerson','customerType','payer'];
  needRadios.forEach(name => {
    const chosen = form.querySelector(`input[name="${name}"]:checked`);
    if (!chosen && !firstBad) firstBad = form.querySelector(`input[name="${name}"]`)?.closest('label');
  });

  if (firstBad){
    flashInvalid(firstBad.tagName === 'INPUT' ? firstBad : firstBad.querySelector('input,select,textarea'));
    alert('Bitte füllen Sie alle Pflichtfelder aus.');
    return false;
  }
  return true;
}

function validateDuschwanne(){
  const form = document.getElementById('form-duschwanne');
  if (!form) return true;

  let firstBad = null;
  const traySize = form.querySelector('input[name="traySize"]:checked');
  if (!traySize && !firstBad) firstBad = form.querySelector('input[name="traySize"]')?.closest('label');

  const addFloor = form.querySelector('#addFlooring');
  if (addFloor && addFloor.checked) {
    const hasFlooring = !!form.querySelector('input[name="flooringProduct[]"]:checked');
    const hasAdhesive = !!form.querySelector('input[name="floorAdhesive[]"]:checked');
    const hasSealing  = !!form.querySelector('input[name="floorSealing[]"]:checked');
    const areaEl = form.querySelector('#floorArea');
    const areaOk = areaEl && areaEl.value.trim().length > 0;

    if (!hasFlooring && !firstBad) firstBad = form.querySelector('input[name="flooringProduct[]"]')?.closest('label');
    if (!areaOk && !firstBad) firstBad = areaEl;
    if (!hasAdhesive && !firstBad) firstBad = form.querySelector('input[name="floorAdhesive[]"]')?.closest('label');
    if (!hasSealing && !firstBad) firstBad = form.querySelector('input[name="floorSealing[]"]')?.closest('label');

    if (firstBad){
      const target = firstBad.tagName ? firstBad : firstBad.querySelector('input,select');
      flashInvalid(target);
      alert('Bitte füllen Sie alle Pflichtfelder im Abschnitt „Duschwanne“ aus.');
      return false;
    }
  }

  if (firstBad){
    flashInvalid(firstBad.tagName === 'INPUT' || firstBad.tagName === 'SELECT' ? firstBad : firstBad.querySelector('input,select'));
    alert('Bitte füllen Sie alle Pflichtfelder in „Duschwanne“ aus.');
    return false;
  }
  return true;
}

function validateWandverkleidung(){
  const form = document.getElementById('form-wandverkleidung');
  if (!form) return true;

  const kind = form.querySelector('input[name="wvKind"]:checked');
  if (!kind){
    const first = form.querySelector('input[name="wvKind"]')?.closest('label');
    const target = first?.querySelector('input');
    flashInvalid(target || first);
    alert('Bitte wählen Sie die Art der Wandverkleidung.');
    return false;
  }
  const kindVal = kind.value;
  if (kindVal === 'Keine') return true;
  return true;
}

function validateOptional(){
  const form = document.getElementById('form-optional');
  if (!form) return true;
  const selected = Array.from(form.querySelectorAll('label.image-check > input[type="checkbox"][id^="opt_"]:checked'));
  for (const cb of selected){
    const key = cb.id.replace('opt_','');
    const qty = form.querySelector(`#qty_${key}`);
    if (qty && !qty.value){
      flashInvalid(qty);
      alert('Bitte geben Sie die Menge für die ausgewählte Option ein.');
      return false;
    }
  }
  return true;
}

/* ========== NEXT/PREV ========== */
document.body.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-nav]'); if (!btn) return;
  const dir = btn.getAttribute('data-nav');
  const current = getCurrentStep();
  const idx = steps.indexOf(current);

  if (dir === 'prev'){
    setStep(steps[Math.max(idx-1, 0)]);
    return;
  }
  if (dir === 'next'){
    const ok =
      (current === 'bereich' ? validateBereich() :
       current === 'duschwanne' ? validateDuschwanne() :
       current === 'wandverkleidung' ? validateWandverkleidung() :
       current === 'optional' ? validateOptional() : true);
    if (!ok) return;
    setStep(steps[Math.min(idx+1, steps.length-1)]);
  }
});

/* ========== UI DYNAMICS ========== */
(function initContactPersonToggle(){
  const form = document.getElementById('form-bereich');
  const section = document.getElementById('contactPersonSection');
  const radioName = 'hasContactPerson';
  const requiredWhenYes = ['cp_name','cp_street','cp_city','cp_postalCode'].map(id => document.getElementById(''+id));
  function setRequired(el, on){ if (!el) return; if (on) el.setAttribute('required','required'); else el.removeAttribute('required'); }
  function toggleSection(show){
    if (!section) return;
    section.hidden = !show;
    section.setAttribute('aria-hidden', show ? 'false' : 'true');
    requiredWhenYes.forEach(el => setRequired(el, show));
    if (!show) requiredWhenYes.forEach(el => { if (el) el.value = ''; });
  }
  function currentYesSelected(){ const checked = form?.querySelector(`input[name="${radioName}"]:checked`); return checked && checked.value === 'Ja'; }
  toggleSection(currentYesSelected());
  form?.addEventListener('change', (e) => { if (e.target?.name === radioName) toggleSection(e.target.value === 'Ja'); });
})();

/* Aufschlag: default 50% for Kassenkunde */
(function initAufschlag(){
  const payerRadios = document.querySelectorAll('input[name="payer"]');
  const r35 = document.querySelector('input[name="aufschlag"][value="35%"]');
  const r40 = document.querySelector('input[name="aufschlag"][value="40%"]');
  const r45 = document.querySelector('input[name="aufschlag"][value="45%"]');
  const r50 = document.querySelector('input[name="aufschlag"][value="50%"]');
  function applyDefault(){
    const payer = document.querySelector('input[name="payer"]:checked')?.value || '';
    if (payer === 'Kassenkunde' && r50) {
      r50.checked = true;
      [r35,r40,r45].forEach(r => r && (r.required = false));
      r50.required = true;
    }
  }
  payerRadios.forEach(r => r.addEventListener('change', applyDefault));
  applyDefault();
})();

/* Pflegegrad minimal visibility (kept) */
(function initPflegegrad(){
  const form = document.getElementById('form-bereich');
  const pgLevelRow = document.getElementById('pflegegradLevelRow');
  const budgetPanel = document.getElementById('budgetOptionsPanel');
  const wePanel = document.getElementById('wohnumfeldPanel');

  function show(el,on){ if (el){ el.hidden = !on; el.setAttribute('aria-hidden', on ? 'false' : 'true'); } }
  function isKK(){ const p = form?.querySelector('input[name="payer"]:checked'); return p && p.value==='Kassenkunde'; }
  function hasPG(){ const r = form?.querySelector('input[name="hasPflegegrad"]:checked'); return r && r.value==='Ja'; }
  function apply(){
    const kk = isKK(); const has = hasPG();
    show(pgLevelRow,has);
    show(budgetPanel,kk && has);
    show(wePanel,kk);
  }
  apply();
  form?.addEventListener('change', (e)=>{
    const t = e.target; if (!t) return;
    if (['payer','hasPflegegrad'].includes(t.name)) apply();
  });
})();

/* Duschwanne: auto-select related defaults on tray selection */
(function initDuschwanneDefaults(){
  const form = document.getElementById('form-duschwanne');
  if (!form) return;
  const trayRadios = form.querySelectorAll('input[name="traySize"]');
  const abdicht = form.querySelector('input[name="abdichtSet"]');
  const drain = form.querySelector('input[name="drainSet"]');
  const stelz = form.querySelector('input[name="stelzlager"]');
  const smallMat = form.querySelector('#smallMaterial');

  function apply(){
    if (abdicht) abdicht.checked = true;
    if (drain) drain.checked = true;
    if (stelz) stelz.checked = true;
    if (smallMat) smallMat.checked = true; // Backend enforces KM02 pricing
  }
  trayRadios.forEach(r => r.addEventListener('change', apply));
})();

/* Duschwanne: Flooring dependencies + live adhesive preview */
(function initDuschwanneFlooringCheckboxes(){
  const form = document.getElementById('form-duschwanne');
  if (!form) return;

  const toggle = document.getElementById('addFlooring');
  const panel = document.getElementById('flooringPanel');
  const area  = document.getElementById('floorArea');

  const grpFlooring = Array.from(form.querySelectorAll('input[name="flooringProduct[]"]'));
  const grpAdhesive = Array.from(form.querySelectorAll('input[name="floorAdhesive[]"]'));
  const grpSealing  = Array.from(form.querySelectorAll('input[name="floorSealing[]"]'));

  // Create or find live preview span in the adhesive hint paragraph
  let hintPara = panel?.querySelector('.field .req');
  if (hintPara && hintPara.textContent.includes('Flächenkleber')) {
    // inject a span at the end for live packs text
    const live = document.createElement('span');
    live.id = 'adhesiveLivePreview';
    live.style.marginLeft = '6px';
    hintPara.appendChild(live);
  }
  const livePreview = () => document.getElementById('adhesiveLivePreview');

  function syncLabelChecked(input){
    input.closest('label.image-check')?.classList.toggle('is-checked', input.checked);
  }
  [...grpFlooring, ...grpAdhesive, ...grpSealing].forEach(inp => {
    inp.addEventListener('change', () => syncLabelChecked(inp));
    syncLabelChecked(inp);
  });

  function show(el,on){ if (el){ el.hidden = !on; el.setAttribute('aria-hidden', on ? 'false' : 'true'); } }
  function setReq(el,on){ if (!el) return; if (on) el.setAttribute('required','required'); else el.removeAttribute('required'); }

  function parseAreaVal(raw){
    if (!raw) return 0;
    const norm = String(raw).replace(',', '.').trim();
    const n = Number(norm);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function computePacks(areaVal){
    // 1 pack per 0.60 m²
    return Math.ceil(areaVal / 0.6 - 1e-12);
  }
  function updateLivePreview(){
    const el = livePreview(); if (!el) return;
    const val = parseAreaVal(area?.value);
    if (val <= 0) { el.textContent = ''; return; }
    const packs = computePacks(val);
    const valStr = String(area.value).trim(); // keep user’s comma/decimal style for display
    el.textContent = `= ${packs} Pkg bei ${valStr} m²`;
  }

  function apply(){
    const on = !!(toggle && toggle.checked);
    show(panel, on);
    setReq(area, on);
    if (on){
      grpFlooring.forEach(i => { i.checked = true; syncLabelChecked(i); });
      grpAdhesive.forEach(i => { i.checked = true; syncLabelChecked(i); });
      grpSealing.forEach(i => { i.checked = true; syncLabelChecked(i); });
      updateLivePreview();
    } else {
      if (area) area.value = '';
      grpFlooring.forEach(i => { i.checked = false; syncLabelChecked(i); });
      grpAdhesive.forEach(i => { i.checked = false; syncLabelChecked(i); });
      grpSealing.forEach(i => { i.checked = false; syncLabelChecked(i); });
      const el = livePreview(); if (el) el.textContent = '';
    }
  }

  toggle?.addEventListener('change', apply);
  area?.addEventListener('input', updateLivePreview);
})();

/* Wandverkleidung: auto sealing + qty toggles */
(function initWVSynch(){
  const cb997 = document.getElementById('wv997');
  const cb1497 = document.getElementById('wv1497');
  const seal = document.querySelector('input[name="wvSealing"]');
  const qty997Wrap = document.getElementById('wvQty997Wrap');
  const qty1497Wrap = document.getElementById('wvQty1497Wrap');
  function show(el,on){ if (el){ el.hidden=!on; el.setAttribute('aria-hidden', on?'false':'true'); } }
  function apply(){
    const any = !!cb997?.checked || !!cb1497?.checked;
    if (any && seal) seal.checked = true;
    show(qty997Wrap, !!cb997?.checked);
    show(qty1497Wrap, !!cb1497?.checked);
  }
  cb997?.addEventListener('change', apply);
  cb1497?.addEventListener('change', apply);
})();

/* Optional section logic (kept minimal; add your previous extended logic if needed) */
(function initOptionalCategories(){
  const form = document.getElementById('form-optional');
  if (!form) return;

  const map = {
    cat_SHOWER: 'menu_SHOWER',
    cat_GRAB: 'menu_GRAB',
    cat_FOLD: 'menu_FOLD',
    cat_BASIN: 'menu_BASIN',
    cat_BASIN_TAP: 'menu_BASIN_TAP',
    cat_THERMO: 'menu_THERMO',
    cat_SEAT: 'menu_SEAT',
    cat_BASIN_ACC: 'menu_BASIN_ACC'
  };

  function syncLabelChecked(input){
    input.closest('label.image-check')?.classList.toggle('is-checked', input.checked);
  }
  function setShown(menuId, on){
    const el = document.getElementById(menuId);
    if (!el) return;
    el.hidden = !on; el.setAttribute('aria-hidden', on ? 'false' : 'true');
    if (!on){
      el.querySelectorAll('label.image-check > input[type="checkbox"]').forEach(cb => { cb.checked=false; cb.dispatchEvent(new Event('change')); });
      el.querySelectorAll('input[type="number"],input[type="text"]').forEach(i => { i.value=''; i.removeAttribute('required'); });
      el.querySelectorAll('label.image-check').forEach(l => l.classList.remove('is-checked'));
    }
  }

  const catChecks = Array.from(document.querySelectorAll('#optCategories input[type="checkbox"]'));
  catChecks.forEach(cb => {
    cb.addEventListener('change', () => { syncLabelChecked(cb); if (map[cb.id]) setShown(map[cb.id], cb.checked); });
    syncLabelChecked(cb);
    if (map[cb.id]) setShown(map[cb.id], cb.checked);
  });

  // Quantities toggling for product tiles
  const allProductChecks = form.querySelectorAll('label.image-check > input[type="checkbox"][id^="opt_"]');
  function applyQtyFor(cb){
    const key = cb.id.replace('opt_','');
    const wrap = form.querySelector(`#qty_${key}_wrap`);
    const qty  = form.querySelector(`#qty_${key}`);
    if (!wrap || !qty) return;
    const on = cb.checked;
    wrap.hidden = !on; wrap.setAttribute('aria-hidden', on ? 'false' : 'true');
    if (on) qty.setAttribute('required','required'); else { qty.removeAttribute('required'); qty.value=''; }
  }
  allProductChecks.forEach(cb => {
    cb.addEventListener('change', () => {
      cb.closest('label.image-check')?.classList.toggle('is-checked', cb.checked);
      applyQtyFor(cb);
    });
    cb.closest('label.image-check')?.classList.toggle('is-checked', cb.checked);
    applyQtyFor(cb);
  });
})();

/* PDF/DOCX actions */
async function requestPdfAndDownload(payload, filename = 'Anfrage.pdf') {
  const resp = await fetch('/pdf', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
  if (!resp.ok){ const txt = await resp.text().catch(()=> ''); throw new Error(`PDF Fehler (${resp.status}): ${txt}`); }
  const blob = await resp.blob(); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
async function downloadPdfFromTemplate() {
  const resp = await fetch('/pdf-template', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(buildPayload()) });
  if (!resp.ok){ const txt = await resp.text().catch(()=> ''); throw new Error('PDF failed: ' + (txt || resp.status)); }
  const blob = await resp.blob(); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='Angebot_aus_Vorlage.pdf'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
async function downloadDocxFromTemplate() {
  const resp = await fetch('/docx-template', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(buildPayload()) });
  if (!resp.ok){ let msg='DOCX Fehler: '+resp.status; try{ const j=await resp.json(); if (j?.detail) msg=j.detail; }catch{} throw new Error(msg); }
  const blob = await resp.blob(); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='Angebot_'+Date.now() + '.docx'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
document.getElementById('makePdf')?.addEventListener('click', async () => {
  if (!validateBereich()) { location.hash = 'bereich'; return; }
  try { await requestPdfAndDownload(buildPayload()); document.getElementById('pdfActions')?.style.setProperty('display','flex'); }
  catch (err){ show({ error: String(err) }, false); }
});
document.getElementById('downloadPdf')?.addEventListener('click', async () => {
  try { await requestPdfAndDownload(buildPayload()); } catch (err){ show({ error: String(err) }, false); }
});
document.getElementById('makePdfFromTemplate')?.addEventListener('click', async () => {
  try { await downloadPdfFromTemplate(); document.getElementById('pdfActions')?.style.setProperty('display','flex'); }
  catch (err){ show({ error: String(err) }, false); }
});
document.getElementById('downloadDocx')?.addEventListener('click', async () => {
  if (!validateBereich()) { location.hash = 'bereich'; return; }
  try { await downloadDocxFromTemplate(); } catch (err){ show({ error: String(err) }, false); }
});

/* Preview and Save */
document.getElementById('sendForm')?.addEventListener('click', async () => {
  try {
    const payload = buildPayload();
    const r = await fetch('/api/price', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.status);
    show({ pricePreview: data }, true);
  } catch (err) {
    show({ error:String(err) }, false);
  }
});
document.getElementById('sendJson')?.addEventListener('click', async () => {
  try {
    const payload = buildPayload();
    const r = await fetch('/api/submissions', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.status);
    show({ message:'Submission gespeichert', ...data }, true);
  } catch (err) {
    show({ error:String(err) }, false);
  }
});