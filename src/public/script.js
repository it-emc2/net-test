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
const steps = ['bereich','duschwanne','wandverkleidung','duschabtrennung', 'optional','rabatt' ,'zusammenfassung'];
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
  return {
    bereich: formToObject(document.getElementById('form-bereich')),
    duschwanne: { ...formToObject(document.getElementById('form-duschwanne')), computed: window.__DW_COMPUTED__ || {} },
    wandverkleidung: formToObject(document.getElementById('form-wandverkleidung')),
    duschabtrennung: formToObject(document.getElementById('form-duschabtrennung')),
    optional: formToObject(document.getElementById('form-optional')),
    rabatt: formToObject(document.getElementById('form-rabatt')) 
  };
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
    const ok = step==='bereich' ? requireBereichValid() :
               step==='duschwanne' ? validateDuschwanne() :
               step==='wandverkleidung' ? validateWandverkleidung() :
                step==='duschabtrennung' ? validateDuschabtrennung() :
               step==='optional' ? validateOptional() : true;
              step==='rabatt' ? validateRabatt() : true;
    if (!ok) return; setStep(steps[Math.min(steps.length-1, idx+1)]);
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
  const radios = document.querySelectorAll('input[name="payer"]'); const r50 = document.querySelector('input[name="aufschlag"][value="50%"]');
  function apply(){ const v = document.querySelector('input[name="payer"]:checked')?.value; if (v==='Kassenkunde' && r50){ r50.checked=true; r50.required=true; } }
  radios.forEach(r=>r.addEventListener('change', apply)); apply();
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
      if (adhesivePriceEl) adhesivePriceEl.textContent='0'; if (sealingPriceEl) sealingPriceEl.textContent='0'; if (panelsPriceEl) panelsPriceEl.textContent='0';
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

  function n(v){ const x = Number(v); return Number.isFinite(x) ? x : 0; }
  function anyCheckedPanels(){ return !!cb997?.checked || !!cb1497?.checked; }
  function counts(){
    const s = cb997?.checked ? n(qty997?.value) : 0;
    const l = cb1497?.checked ? n(qty1497?.value) : 0;
    return { s, l, total: s + l };
  }
  function empty(el){ return !el || String(el.value || '').trim() === ''; }
  function setIfEmpty(el, val){ if (el && empty(el)) el.value = String(val); }

  function recalc(){
    const { s, l } = counts();

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

  // On input of panel quantities, keep proposals updated if still empty
  qty997?.addEventListener('input', recalc);
  qty1497?.addEventListener('input', recalc);

  // Initial pass
  recalc();
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