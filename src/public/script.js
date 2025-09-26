function wireDurationAutoFormat(id) {
  const el = document.getElementById(id);
  if (!el) return;

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  // Live formatting while typing
  el.addEventListener('input', () => {
    const digits = el.value.replace(/\D/g, ''); // keep only 0-9
    if (!digits) { el.value = ''; return; }

    if (digits.length <= 2) {
      // 1–2 digits: show hours and add ":" placeholder
      el.value = digits + ':';
    } else {
      // 3+ digits: last two are minutes, rest are hours
      const minsRaw = digits.slice(-2);
      const hrsRaw  = digits.slice(0, -2);
      const hrs = (hrsRaw.replace(/^0+(?=\d)/, '') || '0'); // strip leading zeros
      const mins = String(clamp(parseInt(minsRaw, 10) || 0, 0, 59)).padStart(2, '0');
      el.value = `${hrs}:${mins}`;
    }
  });

  // Normalize on blur (auto “:00”, clamp minutes, etc.)
  el.addEventListener('blur', () => {
    const v = (el.value || '').trim();
    if (!v) return;

    // "7" -> "7:00"
    if (/^\d+$/.test(v)) {
      el.value = `${String(parseInt(v, 10) || 0)}:00`;
      return;
    }
    // "7:" -> "7:00"
    if (/^\d+:$/.test(v)) {
      el.value = v + '00';
      return;
    }
    // "7:5" -> "7:05", clamp mins
    const m = v.match(/^(\d+):(\d{1,2})$/);
    if (m) {
      const hrs  = String(parseInt(m[1], 10) || 0);
      const mins = String(clamp(parseInt(m[2], 10) || 0, 0, 59)).padStart(2, '0');
      el.value = `${hrs}:${mins}`;
    }
  });
}
function hhmmToHours(v) {
  if (v == null) return 0;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!m) return 0;
  const h = Number(m[1]) || 0;
  const min = Number(m[2]) || 0;
  return h + min / 60;
}

function hoursToHHMM(n) {
  const mins = Math.max(0, Math.round((Number(n) || 0) * 60));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

document.addEventListener('DOMContentLoaded', () => {
  wireDurationAutoFormat('laborHours');
  wireDurationAutoFormat('travelTime');
});
document.addEventListener('DOMContentLoaded', () => {
  const laborEl   = document.getElementById('laborHours');
  const travelEl  = document.getElementById('travelTime');
  const outEl     = document.getElementById('totalHoursHHMM');

  function updateTotalHours() {
    const laborH   = hhmmToHours(laborEl?.value || '0:00');      // Arbeitszeit
    const travelH1 = hhmmToHours(travelEl?.value || '0:00');     // Reisezeit (einfach)
    const totalNum = (travelH1 * 2) + laborH;                    // ← your formula

    // 👉 this is your “total_hours_HH-MM” (as a string)
    const totalHHMM = hoursToHHMM(totalNum);

    // show it under the hint
    if (outEl) {
      outEl.innerHTML = `Gesamtzeit (Arbeit + Fahrt): <strong>${totalHHMM}</strong>`;
    }

    // (optional) expose numeric if you want to reuse it elsewhere
    window.total_hours_numeric = Math.max(0, totalNum);
  }

  // Update on load + whenever user types
  laborEl?.addEventListener('input', updateTotalHours);
  laborEl?.addEventListener('blur',  updateTotalHours);
  travelEl?.addEventListener('input', updateTotalHours);
  travelEl?.addEventListener('blur',  updateTotalHours);
  updateTotalHours();
});


// --- Offer number (ANG-YYYY-MM-DD-HH-mm-ss) + auto-stamp on export clicks ---
function genOfferNumber() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `AN${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function stampOfferOnExport() {
  // Prefer #offerNumber, fall back to name selector if needed
  const offerInput = document.querySelector('#offerNumber') || document.querySelector('input[name="offerNumber"]');
  if (!offerInput) return;

  // All buttons that trigger a download/export
  const ids = [
    'makePdfFromTemplate',
    'downloadDocx',
    'downloadDocxAsPdf',
    'downloadMaterialOverview',
    'makePdf',
    'downloadPdf'
  ];

  const apply = () => { offerInput.value = genOfferNumber(); };

  // Use capture so the value is set before your existing click handlers run
  ids.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', apply, { capture: true });
  });
}

document.addEventListener('DOMContentLoaded', stampOfferOnExport);
// --- end offer number snippet ---

const laborEl   = document.getElementById('laborHours');
const laborHHMM = (laborEl?.value || '').trim();

// Prefer existing helper; fall back safely if it’s missing.
const laborNumeric = (typeof hhmmToHours === 'function')
  ? Math.max(0, hhmmToHours(laborHHMM))
  : (() => {
      const m = laborHHMM.match(/^(\d+):([0-5]\d)$/);
      return m ? (Number(m[1]) + Number(m[2]) / 60) : 0;
    })();

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

/* ========== NAVIGATION ========== */
const steps = ['bereich','duschwanne','wandverkleidung','duschabtrennung', 'optional','rabatt' ,'zusammenfassung', 'kosten'];
const pages = Object.fromEntries(steps.map(s => [s, document.getElementById('page-'+s)]));
const nav = document.getElementById('stepsNav');

function getCurrentStep(){ const h = location.hash.replace('#',''); return steps.includes(h) ? h : steps[0]; }
function setStep(step){
  steps.forEach((s,i)=>{
    const link = nav?.querySelector(`[data-step="${s}"]`);
    link?.classList.toggle('active', s===step);
    link?.classList.toggle('done', steps.indexOf(step) > i);
    if (pages[s]) pages[s].hidden = s !== step;
  });
  location.hash = step;
  updateSummary();
}
nav?.addEventListener('click', e => {
  const a = e.target.closest('a.step'); if (!a) return;
  e.preventDefault(); setStep(a.dataset.step);
});
setStep(getCurrentStep());
window.addEventListener('hashchange', ()=>setStep(getCurrentStep()));

/* ========== PAYLOAD / SUMMARY / STATUS ========== */
function formToObject(form){ return Object.fromEntries(new FormData(form).entries()); }
function buildPayload(){

  const payload = { 
    bereich: formToObject(document.getElementById('form-bereich')),
    duschwanne: { ...formToObject(document.getElementById('form-duschwanne')), computed: window.__DW_COMPUTED__ || {} },
    wandverkleidung: formToObject(document.getElementById('form-wandverkleidung')),
    duschabtrennung: formToObject(document.getElementById('form-duschabtrennung')),
    optional: formToObject(document.getElementById('form-optional')),
    rabatt: formToObject(document.getElementById('form-rabatt')) 
  };
    // Read budget option(s)
 // --- Budget-Option + Zuzahlung -> send to backend ---
const elMax   = document.querySelector('input[name="budgetMax"]');
const elCopay = document.querySelector('input[name="budgetCopay"]');
const elTwo   = document.querySelector('input[name="twoPersons"]');
const copayEl = document.getElementById('copayAmount');

// Wohnumfeld controls
const wohDoneRadios = document.querySelectorAll('input[name="wohnumfeldDone"]');
const wohAmountInput = document.getElementById('wohnumfeldAmount');
function readWohnumfeld() {
  const isJa = Array.from(wohDoneRadios).some(r => r.checked && r.value === 'Ja');
  let amount = 0;
  if (isJa && wohAmountInput) {
    const raw = (wohAmountInput.value || '').toString().replace(',', '.');
    const parsed = parseFloat(raw);
    amount = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return { done: isJa, amount };
}


function parseEuroToNumber(v) {
  const s = String(v ?? '')
    .trim()
    .replace(/[^\d.,-]/g, '')   // drop € and spaces
    .replace(/\./g, '')         // remove thousand separators
    .replace(',', '.');         // convert decimal comma to dot
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

let selected = '';
if (elMax?.checked)       selected = elMax.value;            // "4180 MAXIMAL"
else if (elCopay?.checked) selected = elCopay.value;         // "4180 mit Zuzahlung"
else if (elTwo?.checked)   selected = elTwo.value;           // "Zwei Personen mit Pflegegrad"

// Optional canonicalization (server also normalizes, but this is nice):
const canonical = selected
  ? selected.toUpperCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  : '';

payload.bereich = payload.bereich || {};
payload.bereich.budgetOptionsPanel = canonical || selected || '';
payload.bereich.copayAmount = copayEl ? parseEuroToNumber(copayEl.value) : 0;


  // ► add the fields the server needs to compute Rabatt & Bonus
  const pct = parseFloat(document.getElementById('rb-material-discount')?.value || '0'); // 0..9
  payload.rabatt = {
    ...payload.rabatt,
    materialDiscountPct: isFinite(pct) ? pct / 100 : 0,        // 0..0.09
    bonus300: !!document.getElementById('rb-bonus-300')?.checked,
    bonusGrab: !!document.getElementById('rb-bonus-grab')?.checked,
  };
payload.offerNumber = (document.getElementById('offerNumber')?.value || '').trim();
payload.bereich.totalHoursHHMM = document.getElementById('totalHoursHHMM')?.textContent?.match(/(\d+:\d{2})/)?.[1] || '';
payload.bereich.totalHoursNumeric = Number(window.total_hours_numeric || 0);


payload.bereich.laborHoursHHMM    = laborHHMM;
payload.bereich.laborHoursNumeric = laborNumeric;
const woh = readWohnumfeld();
const isKK =
  (payload.bereich?.payer ||
   document.querySelector('input[name="payer"]:checked')?.value) === 'Kassenkunde';

payload.bereich.wohnumfeld = isKK ? woh : { done: false, amount: 0 };
  return payload;
}

window.buildPayload = buildPayload; // expose for extensions
function updateSummary(){
  if (getCurrentStep() !== 'zusammenfassung') return;
  const el = document.getElementById('summaryText');
  const payload = buildPayload();
  el.textContent = 'Vorschau: ' + JSON.stringify(payload);
}
const statusEl = document.getElementById('status');
function show(obj, ok=true){
  if (!statusEl) return;
  statusEl.className = 'status ' + (ok ? 'ok' : 'err');
  statusEl.textContent = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
}

/* ========== HELPERS ========== */
function flashInvalid(el){
  if (!el) return;
  el.style.borderColor = 'var(--danger)'; el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(()=> el.style.borderColor = '', 1200);
}
function euro(n){ return new Intl.NumberFormat('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n||0)); }
function highlightTileForInput(input, on){ input?.closest('label.image-check')?.classList.toggle('is-checked', !!on); }

/* ========== VALIDATION ========== */
function validateBereich(){
  const form = document.getElementById('form-bereich'); if (!form) return true;
  const d = document.getElementById('date'); if (d && !d.value) d.valueAsDate = new Date();

  // Native constraints first (required toggled by initPflegegrad etc.)
  if (!form.checkValidity()) return false;

  // Extra minimal guards
  const req = ['date','firstName','lastName','customerNumber'];
  let bad = req.map(id=>document.getElementById(id)).find(el=>!el?.value);
  if (!bad){
    const radios = ['salutation','hasContactPerson','customerType','payer'];
    for (const n of radios){
      if (!form.querySelector(`input[name="${n}"]:checked`)){ bad = form.querySelector(`input[name="${n}"]`)?.closest('label'); break; }
    }
  }
  if (bad){ flashInvalid(bad.tagName==='INPUT'?bad:bad.querySelector('input')); return false; }
  return true;
}
function validateDuschwanne(){
  const f = document.getElementById('form-duschwanne'); if (!f) return true;
  let bad = f.querySelector('input[name="traySize"]:checked') ? null : f.querySelector('input[name="traySize"]')?.closest('label');
  const add = f.querySelector('#addFlooring');
  if (add?.checked){
    const area = f.querySelector('#floorArea'); if (!area?.value && !bad) bad = area;
    if (!f.querySelector('input[name="flooringProduct[]"]:checked') && !bad) bad = f.querySelector('input[name="flooringProduct[]"]')?.closest('label');
    if (!f.querySelector('input[name="floorAdhesive[]"]:checked') && !bad) bad = f.querySelector('input[name="floorAdhesive[]"]')?.closest('label');
    if (!f.querySelector('input[name="floorSealing[]"]:checked') && !bad) bad = f.querySelector('input[name="floorSealing[]"]')?.closest('label');
  }
  if (bad){ flashInvalid(bad.tagName==='INPUT'?bad:bad.querySelector('input')); alert('Bitte füllen Sie alle Pflichtfelder in „Duschwanne“ aus.'); return false; }
  return true;
}
function validateWandverkleidung(){
  const f = document.getElementById('form-wandverkleidung'); if (!f) return true;
  if (!f.querySelector('input[name="wvKind"]:checked')){
    const t = f.querySelector('input[name="wvKind"]')?.closest('label'); flashInvalid(t?.querySelector('input')||t); alert('Bitte wählen Sie die Art der Wandverkleidung.'); return false;
  }
  return true;
}
function validateOptional(){ return true; }

function validateRabatt(){
const f = document.getElementById('form-rabatt'); if (!f) return true;
return f.reportValidity();
}

function validateDuschabtrennung(){
const f = document.getElementById('form-duschabtrennung'); if (!f) return true;
return f.reportValidity();
}

/* Focus helper for Bereich conditional errors (defined in initBereichErrorHints) */
function focusFirstBereichConditionalError(){
  if (typeof window.__bereichFocusFirstError__ === 'function'){
    return window.__bereichFocusFirstError__();
  }
  return false;
}

// Use this wherever you need the Bereich page to be valid before proceeding
function requireBereichValid(){
  const form = document.getElementById('form-bereich');
  // Trigger native bubbles
  if (!form.reportValidity()){
    focusFirstBereichConditionalError();
    return false;
  }
  const ok = validateBereich();
  if (!ok) focusFirstBereichConditionalError();
  return ok;
}

/* ========== NAV BUTTONS ========== */
document.body.addEventListener('click', e=>{
  const btn = e.target.closest('[data-nav]'); if (!btn) return;
  const dir = btn.getAttribute('data-nav'); const step = getCurrentStep(); const idx = steps.indexOf(step);
  if (dir==='prev') return setStep(steps[Math.max(0, idx-1)]);
  if (dir==='next'){
    const ok =
      step==='bereich' ? requireBereichValid() :
      step==='duschwanne' ? validateDuschwanne() :
      step==='wandverkleidung' ? validateWandverkleidung() :
      step==='duschabtrennung' ? validateDuschabtrennung() :
      step==='optional' ? validateOptional() :
      step==='rabatt' ? validateRabatt() : true;
    if (!ok) return;
    setStep(steps[Math.min(steps.length-1, idx+1)]);
  }
});

/* ========== BERICH UI: CONTACT PERSON + AUFSCHLAG/PFLEGEGRAD ========== */
(function initContactPersonToggle(){
  const form = document.getElementById('form-bereich'); const section = document.getElementById('contactPersonSection');
  const req = ['cp_name','cp_street','cp_city','cp_postalCode'].map(id=>document.getElementById(id));
  function setReq(el,on){ if (!el) return; on?el.setAttribute('required','required'):el.removeAttribute('required'); }
  function show(on){
    section.hidden = !on; section.setAttribute('aria-hidden', on?'false':'true');
    req.forEach(r=>setReq(r,on)); if (!on) req.forEach(r=>r && (r.value=''));
  }
  function isYes(){ const c = form?.querySelector('input[name="hasContactPerson"]:checked'); return c && c.value==='Ja'; }
  show(isYes()); form?.addEventListener('change', e=>{ if (e.target?.name==='hasContactPerson') show(e.target.value==='Ja'); });
})();
(function initAufschlag(){
  const payerRadios = Array.from(document.querySelectorAll('input[name="payer"]'));
  const aufschlagRadios = Array.from(document.querySelectorAll('input[name="aufschlag"]'));

  const r35 = document.querySelector('input[name="aufschlag"][value="35%"]');
  const r40 = document.querySelector('input[name="aufschlag"][value="40%"]');
  const r45 = document.querySelector('input[name="aufschlag"][value="45%"]');
  const r50 = document.querySelector('input[name="aufschlag"][value="50%"]');

  function setDisabled(el, disabled){
    if (!el) return;
    el.disabled = disabled;
    const pill = el.closest('label.radio-pill');
    if (pill) {
      pill.style.opacity = disabled ? '0.6' : '';
      pill.style.pointerEvents = disabled ? 'none' : '';
      pill.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    }
  }

  function anySelected(){ return aufschlagRadios.some(r => r.checked); }
  function currentSelection(){
    return document.querySelector('input[name="aufschlag"]:checked')?.value || '';
  }

  function apply(){
    const payer = document.querySelector('input[name="payer"]:checked')?.value;

    if (payer === 'Selbstzahler'){
      // Force/select 35% and disable other options
      if (r35 && !r35.checked) r35.checked = true;
      setDisabled(r35, false);
      setDisabled(r40, true);
      setDisabled(r45, true);
      setDisabled(r50, true);
    } else if (payer === 'Kassenkunde') {
      // Re-enable all options
      [r35, r40, r45, r50].forEach(r => setDisabled(r, false));

      const sel = currentSelection();

      // If nothing selected, default to 50% for KK only
      if (!anySelected() && r50) {
        r50.checked = true;
      } else if (sel === '35%') {
        // If 35% was carried over from Selbstzahler, switch to 50% default for KK
        if (r50) r50.checked = true;
      }
      // If user had already chosen 40/45/50, keep it.
    } else {
      // No payer picked yet: enable all, but do not auto-pick
      [r35, r40, r45, r50].forEach(r => setDisabled(r, false));
    }
  }

  payerRadios.forEach(r => r.addEventListener('change', apply));
  apply();
})();

(function initPflegegrad(){
  const form = document.getElementById('form-bereich');
  const pgLevelRow = document.getElementById('pflegegradLevelRow');
  const pgRadios = Array.from(pgLevelRow?.querySelectorAll('input[name="pflegegrad"]') || []);
  const budgetPanel = document.getElementById('budgetOptionsPanel');
  const copayCheckbox = document.getElementById('budgetCopay');
  const copayField = document.getElementById('copayField'); const copayAmount = document.getElementById('copayAmount');
  const wePanel = document.getElementById('wohnumfeldPanel');
  const weDoneGroup = document.getElementById('wohnumfeldDoneGroup');
  const weAmountRow = document.getElementById('wohnumfeldAmountRow'); const weAmount = document.getElementById('wohnumfeldAmount');
  const weAppGroup = document.getElementById('wohnumfeldApplicationGroup');

  function show(el,on){ if (el){ el.hidden = !on; el.setAttribute('aria-hidden', on ? 'false' : 'true'); } }
  function setReq(els,on){ (Array.isArray(els)?els:[els]).forEach(el=> el ? (on?el.setAttribute('required','required'):el.removeAttribute('required')):null); }
  function clearRadios(radios){ radios.forEach(r=>r.checked=false); }
  function isKK(){ const p = form?.querySelector('input[name="payer"]:checked'); return p && p.value==='Kassenkunde'; }
  function hasPG(){ const r = form?.querySelector('input[name="hasPflegegrad"]:checked'); return r && r.value==='Ja'; }
  function pgVal(){ const r = form?.querySelector('input[name="pflegegrad"]:checked'); return r ? parseInt(r.value,10) : NaN; }

  function applyCopay(){
    const on = !!(copayCheckbox && copayCheckbox.checked && !copayCheckbox.closest('[hidden]'));
    show(copayField,on); setReq(copayAmount,on); if (!on && copayAmount) copayAmount.value='';
  }
  function apply(){
    const kk = isKK(); const has = hasPG(); const val = pgVal(); const valid2 = Number.isInteger(val) && val>=2;
    show(pgLevelRow,has); setReq(pgRadios,has); if (!has) clearRadios(pgRadios);
    const showBudget = kk && has && valid2; show(budgetPanel,showBudget); if (!showBudget && copayCheckbox){ copayCheckbox.checked=false; applyCopay(); }
    show(wePanel,kk);
    const weDoneRadios = Array.from(weDoneGroup?.querySelectorAll('input[name="wohnumfeldDone"]') || []);
    const weAppRadios = Array.from(weAppGroup?.querySelectorAll('input[name="wohnumfeldApplication"]') || []);
    setReq(weDoneRadios,kk); setReq(weAppRadios,kk);
    if (!kk){
      weDoneRadios.forEach(r=>r.checked=false); weAppRadios.forEach(r=>r.checked=false);
      show(weAmountRow,false); setReq(weAmount,false); if (weAmount) weAmount.value='';
    } else {
      const doneYes = form?.querySelector('input[name="wohnumfeldDone"][value="Ja"]:checked');
      const showAmt = !!doneYes; show(weAmountRow,showAmt); setReq(weAmount,showAmt); if (!showAmt && weAmount) weAmount.value='';
    }
  }
  apply(); applyCopay();
  form?.addEventListener('change', (e)=>{
    const t = e.target; if (!t) return;
    if (['payer','hasPflegegrad','pflegegrad','wohnumfeldDone'].includes(t.name)) apply();
    if (t.id==='budgetCopay') applyCopay();
  });
})();

/* ========== ACCESSIBLE ERROR HINTS FOR BEREICH CONDITIONALS ========== */
(function initBereichErrorHints(){
  const form = document.getElementById('form-bereich'); if (!form) return;

  function ensureHint(afterEl, id){
    if (!afterEl) return null;
    let hint = document.getElementById(id);
    if (!hint){
      hint = document.createElement('div');
      hint.id = id;
      hint.role = 'alert';
      hint.style.color = 'var(--danger)';
      hint.style.marginTop = '6px';
      hint.style.fontSize = '0.9rem';
      hint.style.display = 'none';
      afterEl.appendChild(hint);
    }
    return hint;
  }
  function showHint(hint, msg){
    if (!hint) return;
    hint.textContent = msg || '';
    hint.style.display = msg ? 'block' : 'none';
  }

  const pgLevelRow = document.getElementById('pflegegradLevelRow');
  const wePanel = document.getElementById('wohnumfeldPanel');
  const weDoneGroup = document.getElementById('wohnumfeldDoneGroup');
  const weAppGroup = document.getElementById('wohnumfeldApplicationGroup');
  const weAmountRow = document.getElementById('wohnumfeldAmountRow');

  const hintPG  = ensureHint(pgLevelRow, 'hint_pg_level');
  const hintWE  = ensureHint(weDoneGroup, 'hint_we_done');
  const hintApp = ensureHint(weAppGroup, 'hint_we_app');
  const hintAmt = ensureHint(weAmountRow, 'hint_we_amount');

  const isKK = () => form.querySelector('input[name="payer"]:checked')?.value === 'Kassenkunde';
  const hasPG = () => form.querySelector('input[name="hasPflegegrad"]:checked')?.value === 'Ja';
  const pgSelected = () => !!form.querySelector('input[name="pflegegrad"]:checked');
  const weDoneSelected = () => !!form.querySelector('input[name="wohnumfeldDone"]:checked');
  const weAppSelected = () => !!form.querySelector('input[name="wohnumfeldApplication"]:checked');
  const weDoneYes = () => !!form.querySelector('input[name="wohnumfeldDone"][value="Ja"]:checked');
  const amtVal = () => {
    const el = document.getElementById('wohnumfeldAmount');
    if (!el || el.closest('[hidden]')) return '';
    return el.value?.trim() || '';
  };

  function validateHints(){
    // Pflegegrad level
    if (!pgLevelRow?.hidden && hasPG() && !pgSelected()){
      showHint(hintPG, 'Bitte wählen Sie einen Pflegegrad.');
    } else {
      showHint(hintPG, '');
    }

    // Wohnumfeld: Done
    if (!wePanel?.hidden && isKK()){
      if (!weDoneSelected()){
        showHint(hintWE, 'Bitte wählen Sie Ja oder Nein.');
      } else {
        showHint(hintWE, '');
      }
    } else {
      showHint(hintWE, '');
    }

    // Wohnumfeld: Application
    if (!wePanel?.hidden && isKK()){
      if (!weAppSelected()){
        showHint(hintApp, 'Bitte wählen Sie, wer den Antrag stellt.');
      } else {
        showHint(hintApp, '');
      }
    } else {
      showHint(hintApp, '');
    }

    // Wohnumfeld: Amount when Ja
    if (!weAmountRow?.hidden && isKK() && weDoneYes()){
      const v = amtVal();
      if (!v){
        showHint(hintAmt, 'Bitte geben Sie den Betrag an.');
      } else {
        showHint(hintAmt, '');
      }
    } else {
      showHint(hintAmt, '');
    }
  }

  // Initial and on change
  validateHints();
  form.addEventListener('change', validateHints);
  form.addEventListener('input', validateHints);

  // Expose focus helper used by requireBereichValid
  window.__bereichFocusFirstError__ = function(){
    if (!pgLevelRow?.hidden && hasPG() && !pgSelected()){
      pgLevelRow.scrollIntoView({behavior:'smooth', block:'center'});
      const first = pgLevelRow.querySelector('input[type="radio"]');
      first?.focus();
      return true;
    }
    if (isKK() && !weDoneSelected()){
      weDoneGroup?.scrollIntoView({behavior:'smooth', block:'center'});
      const first = weDoneGroup?.querySelector('input[type="radio"]');
      first?.focus();
      return true;
    }
    if (isKK() && weDoneYes() && !amtVal()){
      const amt = document.getElementById('wohnumfeldAmount');
      amt?.scrollIntoView({behavior:'smooth', block:'center'});
      amt?.focus();
      return true;
    }
    if (isKK() && !weAppSelected()){
      weAppGroup?.scrollIntoView({behavior:'smooth', block:'center'});
      const first = weAppGroup?.querySelector('input[type="radio"]');
      first?.focus();
      return true;
    }
    return false;
  };
})();

/* ========== DUSCHWANNE DEFAULTS ========== */
(function initDuschwanneDefaults(){
  const f = document.getElementById('form-duschwanne'); if (!f) return;
  const deps = ['abdichtSet','drainSet','stelzlager','#smallMaterial'];
  f.querySelectorAll('input[name="traySize"]').forEach(r=>{
    r.addEventListener('change', ()=>{
      deps.forEach(sel=>{
        const i = sel.startsWith('#') ? f.querySelector(sel) : f.querySelector(`input[name="${sel}"]`);
        if (i){ i.checked = true; highlightTileForInput(i, true); }
      });
    });
  });
})();

(function initRoundTripPreview(){
  const input = document.getElementById('distanceKm');
  const out = document.getElementById('roundTripPreview');

  function parseKm(v){
    // allow commas or dots
    const n = Number(String(v || '').replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  function fmt(n){
    // show as integer if whole, otherwise one decimal
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }
  function update(){
    if (!input || !out) return;
    const oneWay = parseKm(input.value);
    const rt = oneWay * 2;
    out.textContent = `= ${fmt(rt)} km (Hin- & Rückfahrt)`;
  }

  input?.addEventListener('input', update);
  input?.addEventListener('change', update);
  update(); // initial
})();

(function initLaborSuggestion(){
  const kmInput = document.getElementById('distanceKm');
  const out = document.getElementById('laborSuggestion');
  const r8 = document.querySelector('input[name="laborHours"][value="8"]');
  const r10 = document.querySelector('input[name="laborHours"][value="10"]');

  function parseKm(v){
    const n = Number(String(v || '').replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  function update(){
    if (!out) return;
    const km = parseKm(kmInput?.value);
    // rough travel time in hours for one-way
    const avgSpeedKmH = 60; // configurable if needed
    const travelH = avgSpeedKmH > 0 ? (km / avgSpeedKmH) : 0;

    const suggested = travelH > 1 ? 10 : 8;
    out.textContent = km > 0
      ? `Hinweis: geschätzte Anfahrt ~ ${travelH.toFixed(1)} h → Empfehlung: ${suggested} Stunden.`
      : '';
    // Do NOT auto-select. User decides between 8h/10h.
  }

  kmInput?.addEventListener('input', update);
  kmInput?.addEventListener('change', update);
  update();
})();

/* ========== PRICE FETCH (single endpoint) ========== */
const productCache = new Map();
async function getProduct(id){
  if (!id) return null;
  if (productCache.has(id)) return productCache.get(id);
  try{
    const res = await fetch(`/api/products/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(res.status);
    const p = await res.json();
    productCache.set(id, p);
    return p;
  }catch(e){
    console.warn('Product fetch failed for', id, e);
    productCache.set(id, null);
    return null;
  }
}

/* ========== FLOORING: LIVE PREVIEW + DB PRICES + COMPUTED PAYLOAD ========== */
(function initFlooringSection(){
  const f = document.getElementById('form-duschwanne'); if (!f) return;
  const toggle = document.getElementById('addFlooring');
  const panel  = document.getElementById('flooringPanel');
  const area   = document.getElementById('floorArea');

  const tileAdh = document.getElementById('tile_V4FK600');
  const tileSeal= document.getElementById('tile_TRBDSET7');

  const adhesivePriceEl = document.getElementById('floorAdhesivePrice');
  const sealingPriceEl  = document.getElementById('floorSealingPrice');
  const panelsPriceEl   = document.getElementById('flooringPanelsPrice');

  const liveAdh = document.getElementById('adhesiveLivePreview');
  const liveSeal= document.getElementById('sealingLivePreview');

  function show(el,on){ if (el){ el.hidden=!on; el.setAttribute('aria-hidden', on?'false':'true'); } }
  function setReq(el,on){ if (!el) return; on?el.setAttribute('required','required'):el.removeAttribute('required'); }
  function parseArea(){ const v=(area?.value||'').replace(',','.'); const n=Number(v); return Number.isFinite(n)&&n>0?n:0; }
  const packsForAdhesive = (m2)=> Math.ceil(m2/0.6 - 1e-12);
  const setsForSealing   = (m2)=> m2>0 ? 1 : 0;

  const computed = { areaM2:0, adhesive:{productId:'V4FK600',packs:0,unit:0,total:0}, sealing:{productId:'TRBDSET7',sets:0,unit:0,total:0} };
  window.__DW_COMPUTED__ = computed;

  let unitAdh = 0, unitSeal = 0;

  async function ensureUnits(){
    if (!unitAdh){
      const p = await getProduct('V4FK600'); unitAdh = Number(p?.price||0);
    }
    if (!unitSeal){
      const p = await getProduct('TRBDSET7'); unitSeal = Number(p?.price||0);
    }
  }

  function updateUI(){
    const m2 = parseArea(); computed.areaM2 = m2;

    // Adhesive
    const packs = m2 ? packsForAdhesive(m2) : 0;
    const totalA = packs * unitAdh;
    if (liveAdh) liveAdh.textContent = packs ? `= ${packs} Pkg bei ${area.value.trim()} m²` : '';
    if (adhesivePriceEl) adhesivePriceEl.textContent = packs ? euro(totalA) : '0';
    computed.adhesive = { productId:'V4FK600', packs, unit:unitAdh, total:+(totalA.toFixed(2)) };

    // Sealing
    const sets = m2 ? setsForSealing(m2) : 0;
    const totalS = sets * unitSeal;
    if (liveSeal) liveSeal.textContent = sets ? `= ${sets} Set bei ${area.value.trim()} m²` : '';
    if (sealingPriceEl) sealingPriceEl.textContent = sets ? euro(totalS) : '0';
    computed.sealing = { productId:'TRBDSET7', sets, unit:unitSeal, total:+(totalS.toFixed(2)) };

    // Panels price (optional)
    panelsPriceEl.textContent = '0';
  }

  async function init(){
    await ensureUnits(); // fetch DB prices once
    updateUI();
  }

  function apply(){
    const on = !!toggle?.checked;
    show(panel,on); setReq(area,on);
    // auto-check tiles when enabled
    if (on){
      f.querySelectorAll('input[name="flooringProduct[]"],input[name="floorAdhesive[]"],input[name="floorSealing[]"]').forEach(i=>{ i.checked = true; highlightTileForInput(i,true); });
      init();
    } else {
      if (area) area.value='';
      f.querySelectorAll('input[name="flooringProduct[]"],input[name="floorAdhesive[]"],input[name="floorSealing[]"]').forEach(i=>{ i.checked = false; highlightTileForInput(i,false); });
      if (liveAdh) liveAdh.textContent=''; if (liveSeal) liveSeal.textContent='';
      if (adhesivePriceEl) adhesivePriceEl.textContent='0'; 
      if (sealingPriceEl) sealingPriceEl.textContent='0'; 
      if (panelsPriceEl) panelsPriceEl.textContent='0';
      unitAdh = unitSeal = 0;
      computed.areaM2 = 0; computed.adhesive = {productId:'V4FK600',packs:0,unit:0,total:0}; computed.sealing = {productId:'TRBDSET7',sets:0,unit:0,total:0};
    }
  }

  toggle?.addEventListener('change', apply);
  area?.addEventListener('input', ()=>{ ensureUnits().then(updateUI); });

  // initial tile highlight
  f.querySelectorAll('label.image-check > input[type="checkbox"]').forEach(cb=>{
    cb.addEventListener('change', ()=>highlightTileForInput(cb, cb.checked));
    highlightTileForInput(cb, cb.checked);
  });
})();

/* ========== WANDVERKLEIDUNG SMALL UX ========== */
(function initWVSynch(){
  const cb997 = document.getElementById('wv997');
  const cb1497 = document.getElementById('wv1497');
  const seal = document.querySelector('input[name="wvSealing"]');
  const qty997Wrap = document.getElementById('wvQty997Wrap');
  const qty1497Wrap = document.getElementById('wvQty1497Wrap');
  function show(el,on){ if (el){ el.hidden=!on; el.setAttribute('aria-hidden', on?'false':'true'); } }
  function apply(){
    const any = !!cb997?.checked || !!cb1497?.checked;
    if (any && seal){ seal.checked = true; highlightTileForInput(seal,true); }
    show(qty997Wrap, !!cb997?.checked); show(qty1497Wrap, !!cb1497?.checked);
  }
  cb997?.addEventListener('change', apply); cb1497?.addEventListener('change', apply);
})();

(function initWVAutoQty(){
  const f = document.getElementById('form-wandverkleidung'); if (!f) return;

  const cb997 = document.getElementById('wv997');
  const cb1497 = document.getElementById('wv1497');
  const qty997 = document.getElementById('wvQty997');
  const qty1497 = document.getElementById('wvQty1497');

  const wvAdhCB = f.querySelector('input[name="wvAdhesive"]');
  const wvAdhQty = document.getElementById('wvAdhesiveQty');

  const endProfCB = f.querySelector('input[name="wvEndProfile"]');
  const endProfQty = document.getElementById('wvEndProfileQty');

  const profGlueCB = f.querySelector('input[name="wvProfileAdhesive"]');
  const profGlueQty = document.getElementById('wvProfileAdhesiveQty');

  // NEW: suggestion element
  const adhSuggest = document.getElementById('wvAdhesiveSuggestion');

  function n(v){ const x = Number(v); return Number.isFinite(x) ? x : 0; }
  function counts(){
    const s = cb997?.checked ? n(qty997?.value) : 0;
    const l = cb1497?.checked ? n(qty1497?.value) : 0;
    return { s, l, total: s + l };
  }
  function empty(el){ return !el || String(el.value || '').trim() === ''; }
  function setIfEmpty(el, val){ if (el && empty(el)) el.value = String(val); }

  function updateAdhesiveSuggestion(s, l){
    if (!adhSuggest) return;
    const calc = 3*s + 4*l;
    if ((s + l) > 0) {
      adhSuggest.textContent = `Vorschlag: ${calc} Stk (3 je 997×2550, 4 je 1497×2550)`;
    } else {
      adhSuggest.textContent = '';
    }
  }

  function recalc(){
    const { s, l } = counts();

    // Update live suggestion always when quantities change
    updateAdhesiveSuggestion(s, l);

    // Keep defaults only if fields are empty (manual override respected)
    if (wvAdhCB?.checked){
      const defAdh = 3*s + 4*l;
      setIfEmpty(wvAdhQty, defAdh);
    }

    if (endProfCB?.checked){
      setIfEmpty(endProfQty, 3);
    }

    if (profGlueCB?.checked){
      const ep = n(endProfQty?.value || (endProfCB?.checked ? 3 : 0));
      setIfEmpty(profGlueQty, ep);
    }
  }

  // React to relevant changes
  f.addEventListener('change', (e)=>{
    const t = e.target;
    if (!t) return;
    if (t === cb997 || t === cb1497 || t === qty997 || t === qty1497 ||
        t === wvAdhCB || t === endProfCB || t === profGlueCB || t === endProfQty) {
      recalc();
    }
  });

  qty997?.addEventListener('input', recalc);
  qty1497?.addEventListener('input', recalc);

  // Initial pass
  recalc();
})();

(function initV3VHint(){
  const f = document.getElementById('form-wandverkleidung'); if (!f) return;

  const cb997 = document.getElementById('wv997');
  const cb1497 = document.getElementById('wv1497');
  const qty997 = document.getElementById('wvQty997');
  const qty1497 = document.getElementById('wvQty1497');

  const endProfSection = document.getElementById('wvEndProfileSection');
  if (!endProfSection) return;

  // Create or reuse hint element
  let hint = document.getElementById('v3vHint');
  if (!hint){
    hint = document.createElement('div');
    hint.id = 'v3vHint';
    hint.className = 'muted';
    hint.style.marginTop = '6px';
    hint.style.color = 'var(--muted)';
    hint.style.fontSize = '0.95rem';
    endProfSection.appendChild(hint);
  }

  function n(v){ const x = Number(v); return Number.isFinite(x) ? x : 0; }
  function calc(){
    const s = cb997?.checked ? n(qty997?.value) : 0;
    const l = cb1497?.checked ? n(qty1497?.value) : 0;
    const total = s + l;
    if (total >= 2){
      const qV3V = total - 1;
      hint.textContent = `Hinweis: Verbindungsprofile (V3V) werden automatisch berücksichtigt: bei ${total} Platten = ${qV3V} Verbindungsprofil(e) (Anzahl Platten − 1).`;
      hint.style.display = '';
    } else {
      hint.textContent = '';
      hint.style.display = 'none';
    }
  }

  // Wire up changes
  [cb997, cb1497, qty997, qty1497].forEach(el => {
    el?.addEventListener('change', calc);
    el?.addEventListener('input', calc);
  });

  // Initial
  calc();
})();

(function initWVKindaToggle(){
  const form = document.getElementById('form-wandverkleidung'); if (!form) return;

  const secPanels   = document.getElementById('wvPanelsSection');
  const secSealing  = document.getElementById('wvSealingSection');
  const secAdh      = document.getElementById('wvAdhesiveSection');
  const secEndProf  = document.getElementById('wvEndProfileSection');
  const secProfAdh  = document.getElementById('wvProfileAdhesiveSection');

  const cb997 = document.getElementById('wv997');
  const cb1497 = document.getElementById('wv1497');
  const qty997 = document.getElementById('wvQty997');
  const qty1497 = document.getElementById('wvQty1497');

  const wvSealCB = form.querySelector('input[name="wvSealing"]');
  const wvAdhCB  = form.querySelector('input[name="wvAdhesive"]');
  const wvAdhQty = document.getElementById('wvAdhesiveQty');

  const endProfCB  = form.querySelector('input[name="wvEndProfile"]');
  const endProfQty = document.getElementById('wvEndProfileQty');

  const profGlueCB  = form.querySelector('input[name="wvProfileAdhesive"]');
  const profGlueQty = document.getElementById('wvProfileAdhesiveQty');

  function show(el, on){
    if (!el) return;
    el.hidden = !on;
    el.setAttribute('aria-hidden', on ? 'false' : 'true');
  }
  function clearCheckbox(el){ if (el){ el.checked = false; el.dispatchEvent(new Event('change')); } }
  function clearInput(el){ if (el){ el.value=''; el.removeAttribute('required'); } }
  function clearQtyWrap(id){
    const wrap = document.getElementById(id);
    if (wrap){ wrap.hidden = true; wrap.setAttribute('aria-hidden','true'); }
  }

  function apply(){
    const kind = form.querySelector('input[name="wvKind"]:checked')?.value || '';
    const none = kind === 'Keine';

    // Toggle visibility
    show(secPanels,   !none);
    show(secSealing,  !none);
    show(secAdh,      !none);
    show(secEndProf,  !none);
    show(secProfAdh,  !none);

    if (none){
      // Clear panel selections and quantities
      clearCheckbox(cb997);
      clearCheckbox(cb1497);
      clearInput(qty997);
      clearInput(qty1497);
      clearQtyWrap('wvQty997Wrap');
      clearQtyWrap('wvQty1497Wrap');

      // Clear sealing
      clearCheckbox(wvSealCB);

      // Clear adhesive + qty
      clearCheckbox(wvAdhCB);
      clearInput(wvAdhQty);

      // Clear end profiles + qty
      clearCheckbox(endProfCB);
      clearInput(endProfQty);

      // Clear profile glue + qty
      clearCheckbox(profGlueCB);
      clearInput(profGlueQty);
    }
  }

  // Initial apply and on change
  apply();
  form.addEventListener('change', (e)=>{
    if (e.target?.name === 'wvKind') apply();
  });
})();

/* Wandverkleidung: Farbauswahl (radio-like image tiles) */
(function initWVColors(){
  const wrap = document.getElementById('wvColors'); if (!wrap) return;

  function syncAll(){
    const all = wrap.querySelectorAll('label.image-check > input[name="wvColor"]');
    all.forEach(inp => inp.closest('label.image-check')?.classList.toggle('is-checked', inp.checked));
  }

  wrap.addEventListener('change', (e)=>{
    if (e.target?.name === 'wvColor') syncAll();
  });

  const anyChecked = wrap.querySelector('input[name="wvColor"]:checked');
  if (!anyChecked){
    const first = wrap.querySelector('input[name="wvColor"]');
    if (first) first.checked = true;
  }

  syncAll();
})();

(function initV3V(){
  const form = document.getElementById('form-wandverkleidung'); if (!form) return;
  const cb997 = document.getElementById('wv997');
  const cb1497 = document.getElementById('wv1497');
  const qty997 = document.getElementById('wvQty997');
  const qty1497 = document.getElementById('wvQty1497');

  const v3vDiv = document.getElementById('wvV3VDiv');
  const v3vSelected = document.getElementById('wvV3VSelected');
  const qtyV3V = document.getElementById('wvV3VQty');
  const ruleText = document.getElementById('wvV3VRuleText');
  const cbCorners = document.getElementById('wvCornersCB');
  const cornersWrap = document.getElementById('wvCornersWrap');
  const cornersInput = document.getElementById('wvCorners');
  const wvKindGroup = document.getElementById('wvKindGroup');

  const n = v => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0;
  };
  const totalPanels = () => {
    const s = cb997?.checked ? n(qty997?.value) : 0;
    const l = cb1497?.checked ? n(qty1497?.value) : 0;
    return s + l;
  };

  function calc({fromUser} = {}){
    const total = totalPanels();
    const base = total >= 2 ? (total - 1) : 0;
    const ecken = cbCorners?.checked ? n(cornersInput?.value) : 0;
    const finalQty = Math.max(0, base - ecken);

    if (!fromUser) qtyV3V.value = String(finalQty);

    ruleText.textContent =
      `Regel: ab 2 Platten 1 Profil. Bei ${total} Platte(n): Basis ${base}` +
      (ecken ? ` − ${ecken} Ecke(n) = ${finalQty}` : ` = ${finalQty}`) +
      ` Verbindungsprofil(e).`;

    // Auto-select off if no panels
    v3vSelected.checked = total > 0;
  }

  function toggleCorners(){
    const on = cbCorners.checked;
    cornersWrap.hidden = !on;
    cornersWrap.setAttribute('aria-hidden', on ? 'false' : 'true');
    if (!on) cornersInput.value = '0';
    calc();
  }

  function applyKindVisibility(){
    const kind = form.querySelector('input[name="wvKind"]:checked')?.value || '';
    const hide = kind === 'Keine';
    v3vDiv.hidden = hide;
    v3vDiv.setAttribute('aria-hidden', hide ? 'true' : 'false');
    if (hide){
      v3vSelected.checked = false;
      qtyV3V.value = '0';
      cbCorners.checked = false;
      cornersInput.value = '0';
      cornersWrap.hidden = true;
    } else {
      calc();
    }
  }

  [cb997, cb1497, qty997, qty1497].forEach(el=>{
    el?.addEventListener('change', calc);
    el?.addEventListener('input', calc);
  });
  cbCorners?.addEventListener('change', toggleCorners);
  cornersInput?.addEventListener('input', ()=>calc());
  qtyV3V?.addEventListener('input', ()=>calc({fromUser:true}));
  wvKindGroup?.addEventListener('change', applyKindVisibility);

  // Init
  toggleCorners();
  applyKindVisibility();
  calc();
})();

/* Optional: categories -> menus, highlight, Mengen, Basin-required logic */
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
    cat_BASIN_ACC: 'menu_BASIN_ACC' // still available as separate tile if you add it later
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
    const menuId = map[cb.id] || cb.id.replace(/^cat_/, 'menu_');
    cb.addEventListener('change', () => {
      syncLabelChecked(cb);
      setShown(menuId, cb.checked);
    });
    syncLabelChecked(cb);
    setShown(menuId, cb.checked);
  });

  // Product tiles highlight + Mengen toggle
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
      if (cb.id === 'opt_CL60'){ applyBasinRequired(); }
    });
    cb.closest('label.image-check')?.classList.toggle('is-checked', cb.checked);
    applyQtyFor(cb);
  });

  // Basin required logic: when CL60 selected, ensure WTBF and RSL are shown and auto-checked; if unselected, clear them
  const basinSection = document.getElementById('basinRequiredWrap');
  const basinCheckbox = document.getElementById('opt_CL60');
  const wtbfCB = document.getElementById('opt_WTBF');
  const wtbfQty = document.getElementById('qty_WTBF');
  const rslCB = document.getElementById('opt_RSL');
  const rslQty = document.getElementById('qty_RSL');

  function show(el,on){ if (!el) return; el.hidden=!on; el.setAttribute('aria-hidden', on?'false':'true'); }
  function req(el,on){ if (!el) return; if (on) el.setAttribute('required','required'); else el.removeAttribute('required'); }

  function applyBasinRequired(){
    const on = !!(basinCheckbox && basinCheckbox.checked);
    show(basinSection, on);
    if (!wtbfCB || !rslCB) return;

    if (on){
      // auto-check required items if not already
      if (!wtbfCB.checked){ wtbfCB.checked = true; wtbfCB.dispatchEvent(new Event('change')); }
      if (!rslCB.checked){ rslCB.checked = true; rslCB.dispatchEvent(new Event('change')); }
      req(wtbfCB, true); req(rslCB, true);
      req(wtbfQty, true); req(rslQty, true);
    } else {
      // clear and make optional again
      [wtbfCB, rslCB].forEach(cb => { cb.checked = false; cb.dispatchEvent(new Event('change')); cb.removeAttribute('required'); });
      [wtbfQty, rslQty].forEach(q => { if (q){ q.value=''; q.removeAttribute('required'); } });
    }
  }

  basinCheckbox?.addEventListener('change', applyBasinRequired);
  applyBasinRequired();

  // Loose accessories menu: wire Mengen there too
  ['WTBF__loose','RSL__loose','EV__loose'].forEach(key=>{
    const cb = form.querySelector(`#opt_${key}`);
    const qty = form.querySelector(`#qty_${key}`);
    const wrap = form.querySelector(`#qty_${key}_wrap`);
    if (!cb || !qty || !wrap) return;
    cb.addEventListener('change', ()=>{
      const on = cb.checked; wrap.hidden = !on; wrap.setAttribute('aria-hidden', on?'false':'true');
      if (on) qty.setAttribute('required','required'); else { qty.removeAttribute('required'); qty.value=''; }
      cb.closest('label.image-check')?.classList.toggle('is-checked', on);
    });
  });
})();


// ===== Global pricing service =====
(() => {
  async function fetchPrice(payload) {
    const r = await fetch('/api/price', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  // latest computed pricing (for any page to reuse)
  window.__pricing = null;

  // Build -> fetch -> broadcast -> feed Rabatt page
  window.updatePricing = async function updatePricing(payload) {
    const pl = payload ?? (typeof window.buildPayload === 'function' ? window.buildPayload() : null);
    if (!pl) { console.warn('[pricing] No payload available'); return null; }

    const data = await fetchPrice(pl);
    window.__pricing = data;

    // Update the Rabatt panel immediately
    window.setPricingData?.(data);

    // Let any listeners (e.g., Kosten renderer) react
    window.dispatchEvent(new CustomEvent('pricing:updated', { detail: data }));

    return data;
  };

  // Compute once on load so Rabatt has values even if Kosten is never opened
  document.addEventListener('DOMContentLoaded', () => {
    window.updatePricing?.().catch(err => console.warn('[pricing] initial update failed:', err));
  });

  // Optional: if user jumps straight to Rabatt and we still have no pricing, compute then.
  window.addEventListener('hashchange', () => {
    if (typeof window.getCurrentStep === 'function' &&
        window.getCurrentStep() === 'rabatt' &&
        !window.__pricing) {
      window.updatePricing?.();
    }
  });
})();
// ========== tiny trigger so markupPct refreshes when you return to Rabatt==========
document
  .querySelectorAll('input[name="payer"], input[name="aufschlag"]')
  .forEach(el => el.addEventListener('change', () => window.updatePricing?.()));

// ========== Kosten-Details ==========

(function initKostenDetails(){
  const container = document.getElementById('costsSummary');
  if (!container) return;

  function euro(n){ return new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(n||0)); }

  function card(title, bodyHTML, footerHTML=''){
    return `
      <div class="card" style="padding:12px;">
        <div style="font-weight:700; margin-bottom:8px;">${title}</div>
        <div>${bodyHTML}</div>
        ${footerHTML ? `<div style="border-top:1px solid var(--border); margin-top:8px; padding-top:8px;">${footerHTML}</div>` : ''}
      </div>
    `;
  }

  function listLines(lines){
    if (!Array.isArray(lines) || !lines.length) return '<div class="muted">Keine Positionen</div>';
    return `
      <div style="display:grid; grid-template-columns: 1fr auto auto auto; gap:6px 10px; align-items:center;">
        <div style="font-size:12px;color:var(--muted)">Bezeichnung</div>
        <div style="font-size:12px;color:var(--muted);text-align:right">Menge</div>
        <div style="font-size:12px;color:var(--muted);text-align:right">Einzelpreis</div>
        <div style="font-size:12px;color:var(--muted);text-align:right">Gesamt</div>
        ${lines.map(l => `
          <div>${l.label ? l.label : (l.name || l.productId || '-')}</div>
          <div style="text-align:right">${l.qty ?? 1}</div>
          <div style="text-align:right">${euro(l.unitPrice ?? 0)}</div>
          <div style="text-align:right; font-weight:600">${euro(l.lineTotal ?? 0)}</div>
        `).join('')}
      </div>
    `;
  }

  // Render purely from data (NO fetching here)
  function renderFromData(data){
    if (!data) { container.innerHTML = '<div class="muted">Keine Daten</div>'; return; }

    const optBody = listLines((data.items || []).map(i => ({
      productId: i.productId,
      name: i.productId,
      qty: i.qty,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal
    })));
    const optCard = card('Optional gewählte Produkte', optBody, `<div style="text-align:right"><b>Summe:</b> ${euro((data.items||[]).reduce((a,x)=>a+(x.lineTotal||0),0))}</div>`);

    const matLines = (data.materials?.lines || []).map(l => ({
      productId: l.productId || l.id,
      name: l.name,
      qty: l.qty,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
      label: l.label
    }));
    const matBody = listLines(matLines);
    const matCard = card(data.materials?.title || 'Material', matBody, `<div style="text-align:right"><b>Summe Material:</b> ${euro(data.materials?.sum || 0)}</div>`);

    const svcLines = (data.services?.lines || []).map(s => ({
      productId: s.key,
      name: s.label,
      qty: 1,
      unitPrice: s.amount,
      lineTotal: s.amount
    }));
    const svcBody = listLines(svcLines);
    const svcCard = card(data.services?.title || 'Leistungen', svcBody, `<div style="text-align:right"><b>Summe Leistungen:</b> ${euro(data.services?.sum || 0)}</div>`);

    const sums = `
      <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
        <div>Produkte + Material: <b>${euro(data.productsSubtotal || 0)}</b></div>
        <div>Leistungen: <b>${euro(data.services?.sum || 0)}</b></div>
        <div>Aufschlag (${Math.round((data.markupPct||0)*100)}%): <b>${euro(data.markup || 0)}</b></div>
        <div style="font-size:1.05rem;">Zwischensumme: <b>${euro(data.Nettobetrag || 0)}</b></div>
        <div style="font-size:1.2rem;">Gesamt: <b>${euro(data.total || 0)}</b></div>
      </div>
    `;
    const totalsCard = card('Summen', sums);

    container.innerHTML = [matCard, optCard, svcCard, totalsCard].join('');
  }

  // Open Kosten: use cache if present, otherwise trigger one fetch
  async function openKosten(){
    container.innerHTML = '<div class="muted">Berechne …</div>';
    if (window.__pricing) {
      renderFromData(window.__pricing);
    } else {
      // One fetch; setPricingData + event will happen inside updatePricing
      await window.updatePricing?.();
      // Render from the cache now that it exists
      renderFromData(window.__pricing);
    }
  }

  // Show Kosten when the step becomes active
  window.addEventListener('hashchange', ()=>{
    if (getCurrentStep() === 'kosten') openKosten();
  });
  if (getCurrentStep() === 'kosten') openKosten();

  // React to pricing updates WITHOUT fetching again (no loop)
  window.addEventListener('pricing:updated', (ev) => {
    if (getCurrentStep() === 'kosten') {
      renderFromData(ev.detail || window.__pricing);
    }
  });
})();

/* ========== PDF/DOCX + API TEST BUTTONS ========== */

async function requestPdfAndDownload(payload, filename='Anfrage.pdf'){
  const resp = await fetch('/pdf', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
  if (!resp.ok){ const txt = await resp.text().catch(()=> ''); throw new Error(`PDF Fehler (${resp.status}): ${txt}`); }
  const blob = await resp.blob(); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

document.getElementById('makePdf')?.addEventListener('click', async ()=>{
  // Require Bereich to be valid before generating preview document
  if (!requireBereichValid()) { location.hash='bereich'; return; }
  try{ await requestPdfAndDownload(buildPayload()); document.getElementById('pdfActions')?.style.setProperty('display','flex'); }
  catch(e){ show({error:String(e)}, false); }
});
document.getElementById('downloadPdf')?.addEventListener('click', async ()=>{
  try{ await requestPdfAndDownload(buildPayload()); } catch(e){ show({error:String(e)}, false); }
});
document.getElementById('makePdfFromTemplate')?.addEventListener('click', async ()=>{
  if (!requireBereichValid()) { location.hash='bereich'; return; }
  try{
    const resp = await fetch('/pdf-template', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(buildPayload()) });
    if (!resp.ok) throw new Error(await resp.text());
    const blob = await resp.blob(); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='Angebot_aus_Vorlage.pdf'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    document.getElementById('pdfActions')?.style.setProperty('display','flex');
  }catch(e){ show({error:String(e)}, false); }
});
document.getElementById('downloadDocx')?.addEventListener('click', async ()=>{
  if (!requireBereichValid()) { location.hash='bereich'; return; }
  try{
    const resp = await fetch('/docx-template', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(buildPayload()) });
    if (!resp.ok) throw new Error(await resp.text());
    const blob = await resp.blob(); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`Angebot_${Date.now()}.docx`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }catch(e){ show({error:String(e)}, false); }
});
document.getElementById('sendForm')?.addEventListener('click', async ()=>{
  if (!requireBereichValid()) { location.hash='bereich'; return; }
  try{
    const r = await fetch('/api/price', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(buildPayload()) });
    const data = await r.json(); if (!r.ok) throw new Error(data.error || r.status);
    show({ pricePreview: data }, true);
  }catch(e){ show({error:String(e)}, false); }
});
document.getElementById('sendJson')?.addEventListener('click', async ()=>{
  if (!requireBereichValid()) { location.hash='bereich'; return; }
  try{
    const r = await fetch('/api/submissions', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(buildPayload()) });
    const data = await r.json(); if (!r.ok) throw new Error(data.error || r.status);
    show({ message:'Submission gespeichert', ...data }, true);
  }catch(e){ show({error:String(e)}, false); }
});


// =======================
// RABATT SECTION 
// =======================
// ===== ONE global store for all Rabatt code =====
// ---- Rabatt UI, driven by server data ----

const elDiscount    = document.getElementById('rb-material-discount');
const elDiscountVal = document.getElementById('rb-material-discount-val');
const rowRabatt     = document.getElementById('rb-rabatt-row');
const rowTotalAfter = document.getElementById('rb-total-after-row');
const outRabatt     = document.getElementById('rb-rabatt');
const outTotalAfter = document.getElementById('rb-total-after');
const rowBonusTotal = document.getElementById('rb-bonus-total-row');
const outBonusTotal = document.getElementById('rb-bonus-total');

const euroFmt = (n) => (Number(n)||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'}).replace(/\u00A0/g,' ');
const setRowVisible = (row, on) => { if (row){ row.style.display = on?'contents':'none'; row.hidden=!on; row.setAttribute('aria-hidden', String(!on)); } };

// debounce helper so we don’t spam /api/price while sliding
const debounce = (fn, ms=200) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };
const refreshPricing = debounce(()=> window.updatePricing?.(), 200);

// Update live % label and ask server to recompute
elDiscount?.addEventListener('input', () => {
  const v = parseFloat(elDiscount.value||'0') || 0;
  if (elDiscountVal) elDiscountVal.textContent = v.toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}) + '%';
  refreshPricing();
});

// Recompute on bonus toggles (server will return new totals)
document.getElementById('rb-bonus-300')?.addEventListener('change', ()=>window.updatePricing?.());
document.getElementById('rb-bonus-grab')?.addEventListener('change', ()=>window.updatePricing?.());

// Fill top labels (Material/Arbeit/Netto/MwSt/Gesamt) + Rabatt rows from SERVER
window.setPricingData = function setPricingData(data) {
  try {
    const byId = (id) => document.getElementById(id);
    const fmt = (n) => (Number(n) || 0)
      .toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
      .replace(/\u00A0/g, ' ');

    // --- Top labels
    const mat   = Number(data?.productsSubtotal ?? 0);
    const arbe  = Number(data?.services?.sum   ?? 0);
    const net   = Number(data?.Nettobetrag ?? 0);
    const vat   = Number(data?.vatOnNet   ?? (net * 0.19));
    const total = Number(data?.total      ?? (net + vat));
    const auf   = Number(data?.markup     ?? 0);

    byId('rb-material')?.replaceChildren(document.createTextNode(fmt(mat)));
    byId('rb-arbeit')  ?.replaceChildren(document.createTextNode(fmt(arbe)));
    byId('rb-net')     ?.replaceChildren(document.createTextNode(fmt(net)));
    byId('rb-vat')     ?.replaceChildren(document.createTextNode(fmt(vat)));
    byId('rb-total')   ?.replaceChildren(document.createTextNode(fmt(total)));
    byId('rb-auf-value')?.replaceChildren(document.createTextNode(fmt(auf)));

    // --- Dynamic title (SZ/KK supported)
    const payerRaw =
      data?.services?.payer ??
      data?.payer ??
      document.querySelector('input[name="payer"]:checked')?.value ?? '';
    const key = String(payerRaw).trim().toLowerCase();
    const norm = (key === 'sz' || key === 'selbstzahler') ? 'selbstzahler'
               : (key === 'kk' || key === 'kassenkunde')  ? 'kassenkunde'
               : '';
    const h2 = document.querySelector('#page-rabatt h2');
    if (h2) {
      h2.textContent =
        norm === 'selbstzahler' ? 'Rabatt für Selbstzahler'
      : norm === 'kassenkunde'  ? 'Rabatt für Kassenkunde'
      : 'Rabatt';
    }

    // --- Aufschlag label shows chosen %
    let mp = data?.markupPct;
    if (!Number.isFinite(mp)) {
      const raw = document.querySelector('input[name="aufschlag"]:checked')?.value || '';
      const m = String(raw).match(/[\d.]+/);
      mp = m ? (raw.includes('%') ? parseFloat(m[0]) / 100 : parseFloat(m[0])) : 0;
    }
    const pctInt = Math.round((mp <= 1 ? mp * 100 : mp));
    byId('rb-auf-label')?.replaceChildren(document.createTextNode(`Aufschlag ${pctInt}%`));

    // --- Rabatt & Bonus UI (visibility driven by current UI, values from server)
    const elDiscount    = byId('rb-material-discount');
    const elDiscountVal = byId('rb-material-discount-val');
    const rowRabatt     = byId('rb-rabatt-row');
    const rowTotalAfter = byId('rb-total-after-row');
    const outRabatt     = byId('rb-rabatt');
    const outTotalAfter = byId('rb-total-after');

    const cb300 = byId('rb-bonus-300');
    const cbGrab= byId('rb-bonus-grab');
    const rowBonusTotal = byId('rb-bonus-total-row');
    const outBonusTotal = byId('rb-bonus-total');

    // Slider percent from UI (fallback to server)
    let sliderPct = parseFloat(elDiscount?.value || '0');
    if (!Number.isFinite(sliderPct)) {
      sliderPct = Number(data?.materialDiscountPct || 0) * 100;
    }
    if (elDiscountVal) {
      elDiscountVal.textContent = sliderPct.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
    }
    if (elDiscount && Number.isFinite(sliderPct)) {
      elDiscount.value = String(sliderPct);
    }

    // Visibility decisions (from UI state so it reacts immediately)
    const hasRabatt = (sliderPct > 0);
    const anyBonus  = !!(cb300?.checked || cbGrab?.checked || Number(data?.bonusGross || 0) > 0);

    const showRow = (row, on) => {
      if (!row) return;
      row.hidden = !on;
      row.setAttribute('aria-hidden', String(!on));
      // keep grid layout intact
      row.style.display = on ? 'contents' : 'none';
    };

    showRow(rowRabatt, hasRabatt);
    showRow(rowTotalAfter, hasRabatt);
    showRow(rowBonusTotal, anyBonus);

    // Values (from server)
    const rabattAmt = Number(data?.rabattAmount || 0);
    const afterRab  = Number(data?.totalAfterRabatt || 0);
    if (outRabatt)     outRabatt.textContent     = fmt(hasRabatt ? rabattAmt : 0);
    if (outTotalAfter) outTotalAfter.textContent = fmt(hasRabatt ? afterRab  : 0);

    const totalAfterBonus = Number(data?.totalAfterBonus || 0);
    if (outBonusTotal) outBonusTotal.textContent = fmt(anyBonus ? totalAfterBonus : 0);
  } catch (err) {
    console.error('[rabatt] setPricingData failed:', err);
  }
};


// =======================
// --- Show Rabatt auf Materialkosten only for Kassenkunde ---
// =======================
// --- Show/hide only the "Rabatt auf Materialkosten" slider for KK ---
(function initMaterialDiscountVisibility(){
  const sec = document.getElementById('rb-material-discount-section')
          // fallback: try to find a reasonable wrapper around the slider if no explicit id
          || elDiscount?.closest('.field') 
          || elDiscount?.closest('.row') 
          || elDiscount?.parentElement;

  if (!sec || !elDiscount) return; // nothing to do if we can't find the slider or its wrapper

 function isSZ(){
  const val = document.querySelector('input[name="payer"]:checked')?.value || '';
  return /^(sz|selbstzahler)$/i.test(val.trim());
}

  function show(el, on){
    el.hidden = !on;
    el.setAttribute('aria-hidden', String(!on));
    // keep your grid layout intact if needed
    if (el.style) el.style.display = on ? '' : 'none';
  }

  function apply(){
  if (isSZ()){
    show(sec, false);
    const current = parseFloat(elDiscount.value || '0') || 0;
    if (current !== 0){
      elDiscount.value = '0';
      elDiscountVal && (elDiscountVal.textContent = '0.0%');
      window.updatePricing?.();
    }
  } else {
    show(sec, true);
  }
}


  // run now and whenever payer changes
  apply();
  document.querySelectorAll('input[name="payer"]').forEach(r => {
    r.addEventListener('change', apply);
  });

  // also re-apply when returning to the Rabatt step
  window.addEventListener('hashchange', () => {
    if (typeof getCurrentStep === 'function' && getCurrentStep() === 'rabatt') {
      apply();
    }
  });
})();




/* ========== NEW: Materialübersicht (DOCX) DOWNLOAD ========== */

// small reusable docx download helper
async function downloadDocx(url, body, filename) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Download failed: ${resp.status} ${txt}`);
  }
  const blob = await resp.blob();
  const urlObj = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = urlObj;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(urlObj);
}

// wire the new button (make sure you added it in HTML with id="downloadMaterialOverview")
document.getElementById('downloadMaterialOverview')?.addEventListener('click', async () => {
  if (!requireBereichValid()) { location.hash = 'bereich'; return; }
  try {
    const payload = buildPayload();
    await downloadDocx('/docx-template/material-overview', payload, `Materialuebersicht_${Date.now()}.docx`);
  } catch (e) {
    console.error(e);
    show({ error: String(e) }, false);
    alert('Materialübersicht konnte nicht erstellt werden.');
  }
});

document.getElementById('downloadDocxAsPdf')?.addEventListener('click', async () => {
  if (!requireBereichValid()) { location.hash='bereich'; return; }
  try {
    const payload = buildPayload();
    await downloadDocx('/docx-template/pdf', payload, `Angebot_${Date.now()}.pdf`);
  } catch (e) {
    console.error(e);
    show({ error: String(e) }, false);
    alert('PDF konnte nicht erstellt werden.');
  }
});


document.addEventListener('DOMContentLoaded', () => {
  const elMax   = document.querySelector('input[name="budgetMax"]');
  const elCopay = document.querySelector('input[name="budgetCopay"]');
  const elTwo   = document.querySelector('input[name="twoPersons"]');
  const copayField  = document.getElementById('copayField');
  const copayAmount = document.getElementById('copayAmount');

  const all = [elMax, elCopay, elTwo].filter(Boolean);

  function updateUI() {
    // single-select behavior
    const selected = all.filter(el => el.checked);
    if (selected.length > 1) {
      // keep the one just checked; uncheck others
      const last = selected[selected.length - 1];
      all.forEach(el => { if (el !== last) el.checked = false; });
    }
    // copay field only when "mit Zuzahlung" checked
    const copayOn = !!(elCopay && elCopay.checked);
    copayField.hidden = !copayOn;
    copayField.setAttribute('aria-hidden', String(!copayOn));
    if (!copayOn && copayAmount) copayAmount.value = '';
  }

  all.forEach(el => el.addEventListener('change', updateUI));
  updateUI();
});

(function initSmartTraySearch(){
  const TRAY_KEY = 'dw_tray_selection';
function saveTraySelection(value, productId){
  try { localStorage.setItem(TRAY_KEY, JSON.stringify({ value, productId })); } catch {}
}
function loadTraySelection(){
  try { return JSON.parse(localStorage.getItem(TRAY_KEY) || '{}'); } catch { return {}; }
}
  const wrap = document.getElementById('traySmartSearch');
  if (!wrap) return;

  const form = document.getElementById('form-duschwanne');
  const wEl  = wrap.querySelector('input[name="tray_w_cm"]');   // Breite
  const lEl  = wrap.querySelector('input[name="tray_l_cm"]');   // Länge
  const hEl  = wrap.querySelector('input[name="tray_h_cm"]');   // Höhe
  const out  = wrap.querySelector('#traySuggestions');           // container for radios

  const parseNum = (v) => {
    const s = String(v ?? '').trim().replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  };

  // ensure hidden productId (optional)
  function ensureHiddenPid(){
    let pid = document.getElementById('chosenTrayProductId');
    if (!pid) {
      pid = document.createElement('input');
      pid.type = 'hidden';
      pid.id = 'chosenTrayProductId';
      pid.name = 'chosenTrayProductId';
      form?.appendChild(pid);
    }
    return pid;
  }

  function renderRadioSuggestions(list){
    if (!list.length){
      out.innerHTML = '<div class="muted">Keine Treffer</div>';
      return;
    }

    // if any traySize is already checked (legacy radios or previous pick), don’t force required
    const alreadyChecked = !!form?.querySelector('input[name="traySize"]:checked');

    const radiosHtml = list.slice(0,3).map((p, idx) => {
      const value = `${p.widthCm} x ${p.lengthCm} x ${p.heightCm} cm`;
      // match your old HTML EXACTLY: label.radio-pill > input + span.circle + span(text)
      const requiredAttr = (!alreadyChecked && idx === 0) ? 'required' : '';
      return `
        <label class="radio-pill">
          <input type="radio" name="traySize" value="${value}" ${requiredAttr} data-product-id="${p.productId}">
          <span class="circle"></span>
          <span>${value}</span>
        </label>
      `;
    }).join('');

    out.innerHTML = `
      <div class="field">
        <label class="req">Größe, grundsätzlich größer wählen, als gewünschtes Maß</label>
        <div class="radio-list" id="traySuggestionRadioList">
          ${radiosHtml}
        </div>
      </div>
    `;

    const pidHidden = ensureHiddenPid();

    // keep productId in sync and toggle the visual "is-checked" class just like the old UI
    out.querySelectorAll('input[name="traySize"]').forEach(radio => {
      radio.addEventListener('change', () => {
        pidHidden.value = radio.dataset.productId || '';
        // mirror old highlighting behaviour
        const listEl = document.getElementById('traySuggestionRadioList');
        if (!listEl) return;
        listEl.querySelectorAll('label.radio-pill').forEach(l => l.classList.remove('is-checked'));
        radio.closest('label.radio-pill')?.classList.add('is-checked');
        // persist for when we leave/come back
    saveTraySelection(radio.value, pidHidden.value);
      });
    });
    // >>> NEW: after rendering, re-apply previously saved choice (if it exists in this list)
const saved = loadTraySelection();
if (saved?.value) {
  const esc = (css) => css.replace(/([.*+?^${}()|[\]\\])/g, '\\$1'); // tiny CSS.escape
  const match = out.querySelector(`#traySuggestionRadioList input[name="traySize"][value="${esc(saved.value)}"]`);
  if (match) {
    match.checked = true;
    pidHidden.value = saved.productId || match.dataset.productId || '';
    match.closest('label.radio-pill')?.classList.add('is-checked');
    // notify any existing listeners (deps/autochecks/validation)
    match.dispatchEvent(new Event('change', { bubbles: true }));
  }}}

  async function fetchAndRender(){
    const w = parseNum(wEl.value);
    const l = parseNum(lEl.value);
    const h = parseNum(hEl.value);
    if (![w,l,h].every(Number.isFinite)) { out.innerHTML = ''; return; }

    const url = `/api/trays/suggest?w=${w}&l=${l}&h=${h}`;
    try {
      const res  = await fetch(url, { credentials: 'include' });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
      const data = JSON.parse(text);
      renderRadioSuggestions(data.results || []);
    } catch (e) {
      console.error('Smart search error:', e);
      out.innerHTML = '<div class="err">Fehler bei der Suche.</div>';
    }
  }

  const debounce = (fn, ms=250)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
  const onChange = debounce(fetchAndRender, 300);

  [wEl,lEl,hEl].forEach(el=>{
    el?.addEventListener('input', onChange);
    el?.addEventListener('change', onChange);
  });

  // >>> NEW: show suggestions immediately if fields already have values (page refresh / step enter)
  function maybeAutoFetch(){
    const hasValues = [wEl,lEl,hEl].every(el => (String(el?.value || '').trim() !== ''));
    if (hasValues) fetchAndRender();
  }
  // run now…
  maybeAutoFetch();
  // …and when you navigate back into the Duschwanne step
  window.addEventListener('hashchange', () => {
    if (typeof getCurrentStep === 'function' && getCurrentStep() === 'duschwanne') {
      maybeAutoFetch();
    }
  });
})();

