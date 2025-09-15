
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

/* ========== COMMON FIELD HIGHLIGHT ========== */
function flashInvalid(el){
  if (!el) return;
  el.style.borderColor = 'var(--danger)';
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(()=> el.style.borderColor = '', 1200);
}

/* ========== VALIDATORS (custom alert flow) ========== */
function validateBereich(){
  const form = document.getElementById('form-bereich');
  if (!form) return true;

  const d = document.getElementById('date');
  if (d && !d.value) d.valueAsDate = new Date();

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

  const desired = form.querySelector('#trayDesired');
  if (!desired?.value && !firstBad) firstBad = desired;

  const entry = form.querySelector('#entry');
  if (!entry?.value && !firstBad) firstBad = entry;

  const smallMat = form.querySelector('input[name="smallMaterial"]');
  if (smallMat?.checked){
    const varSel = form.querySelector('input[name="smallMaterialVariant"]:checked');
    if (!varSel && !firstBad) firstBad = form.querySelector('input[name="smallMaterialVariant"]')?.closest('label');
  }

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

/* Wandverkleidung strict validator (with Mengen per Panel) */
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

  const enforce = (kindVal === 'Fehlstellen' || kindVal === 'Deckenhoch');
  if (!enforce) return true;

  const panelChosen = !!form.querySelector('input[name="wvPanels[]"]:checked');
  const p997Chosen = form.querySelector('#wv997')?.checked;
  const p1497Chosen = form.querySelector('#wv1497')?.checked;
  const qty997El = form.querySelector('#wvQty997');
  const qty1497El = form.querySelector('#wvQty1497');

  const firstMissing =
    (!panelChosen && form.querySelector('#wvPanelsSection label.image-check')) ||
    (p997Chosen && !qty997El?.value && qty997El) ||
    (p1497Chosen && !qty1497El?.value && qty1497El) ||
    (!form.querySelector('input[name="wvSealing"]:checked') && form.querySelector('#wvSealingSection label.image-check')) ||
    (!form.querySelector('input[name="wvAdhesive"]:checked') && form.querySelector('#wvAdhesiveSection label.image-check')) ||
    (!form.querySelector('#wvAdhesiveQty')?.value && form.querySelector('#wvAdhesiveQty')) ||
    (!form.querySelector('input[name="wvEndProfile"]:checked') && form.querySelector('#wvEndProfileSection label.image-check')) ||
    (!form.querySelector('#wvEndProfileQty')?.value && form.querySelector('#wvEndProfileQty')) ||
    (!form.querySelector('input[name="wvProfileAdhesive"]:checked') && form.querySelector('#wvProfileAdhesiveSection label.image-check')) ||
    (!form.querySelector('#wvProfileAdhesiveQty')?.value && form.querySelector('#wvProfileAdhesiveQty'));

  if (firstMissing){
    const target = firstMissing.tagName ? firstMissing : firstMissing.querySelector('input,select');
    flashInvalid(target);
    alert('Bitte wählen Sie alle erforderlichen Komponenten für die Wandverkleidung und geben Sie die Mengen an.');
    return false;
  }
  return true;
}

/* Optional validator: Menge required per selected item, plus basin-required items */
function validateOptional(){
  const form = document.getElementById('form-optional');
  if (!form) return true;

  // 1) Mengen for each selected product
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

  // 2) If Waschtisch (CL60) selected, WTBF and RSL must be selected (with Mengen)
  const basinSelected = form.querySelector('#opt_CL60')?.checked;
  if (basinSelected){
    const reqWTBF = form.querySelector('#opt_WTBF');
    const reqRSL  = form.querySelector('#opt_RSL');
    const missingReq =
      (!reqWTBF?.checked && reqWTBF) ||
      (reqWTBF?.checked && !form.querySelector('#qty_WTBF')?.value && form.querySelector('#qty_WTBF')) ||
      (!reqRSL?.checked && reqRSL) ||
      (reqRSL?.checked && !form.querySelector('#qty_RSL')?.value && form.querySelector('#qty_RSL'));
    if (missingReq){
      const target = missingReq.tagName ? missingReq : missingReq.querySelector('input');
      flashInvalid(target);
      alert('Für den Waschtisch sind Befestigungssatz WTBF und Röhrensiphon RSL erforderlich. Bitte auswählen und Menge angeben.');
      return false;
    }
  }

  return true;
}

/* ========== NEXT/PREV using your alert flow ========== */
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

/* ========== Dynamic toggles ========== */
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

(function initAufschlagToggle(){
  const form = document.getElementById('form-bereich');
  const payerGroup = form?.querySelector('#payerType');
  const aufschlagSection = document.getElementById('aufschlagSection');
  const aufschlagRadios = Array.from(aufschlagSection?.querySelectorAll('input[name="aufschlag"]') || []);
  function setReq(on){ aufschlagRadios.forEach(r => on ? r.setAttribute('required','required') : r.removeAttribute('required')); }
  function showPanel(show){
    if (!aufschlagSection) return;
    aufschlagSection.hidden = !show;
    aufschlagSection.setAttribute('aria-hidden', show ? 'false' : 'true');
    setReq(show);
    if (!show) aufschlagRadios.forEach(r => r.checked = false);
  }
  function isKK(){ const c = payerGroup?.querySelector('input[name="payer"]:checked'); return c && c.value === 'Kassenkunde'; }
  showPanel(isKK());
  payerGroup?.addEventListener('change', (e) => { if (e.target?.name === 'payer') showPanel(e.target.value === 'Kassenkunde'); });
})();

(function initTravelZones(){
  const form = document.getElementById('form-bereich');
  const zonesKK = document.getElementById('zonesKK');
  const zonesSZ = document.getElementById('zonesSZ');
  const radiosKK = Array.from(zonesKK?.querySelectorAll('input[name="zoneKK"]') || []);
  const radiosSZ = Array.from(zonesSZ?.querySelectorAll('input[name="zoneSZ"]') || []);
  function setRequired(list,on){ list.forEach(r => on ? r.setAttribute('required','required') : r.removeAttribute('required')); }
  function clear(list){ list.forEach(r => r.checked = false); }
  function show(el,on){ if (!el) return; el.hidden = !on; el.setAttribute('aria-hidden', on ? 'false' : 'true'); }
  function payer(){ const p = form?.querySelector('input[name="payer"]:checked'); return p ? p.value : ''; }
  function apply(){
    const val = payer(); const isKK = val==='Kassenkunde'; const isSZ = val==='Selbstzahler';
    show(zonesKK,isKK); show(zonesSZ,isSZ);
    setRequired(radiosKK,isKK); setRequired(radiosSZ,isSZ);
    if (!isKK) clear(radiosKK); if (!isSZ) clear(radiosSZ);
  }
  apply();
  form?.addEventListener('change', (e)=>{ if (e.target?.name==='payer') apply(); });
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

(function initUmbau(){
  const floorChk = document.getElementById('floorKnown');
  const wrap = document.getElementById('floorInputWrap');
  const input = document.getElementById('floor');
  if (!floorChk || !wrap || !input) return;
  function showField(on){
    wrap.hidden = !on; wrap.setAttribute('aria-hidden', on ? 'false' : 'true');
    if (on) input.setAttribute('required','required'); else { input.removeAttribute('required'); input.value=''; }
  }
  showField(floorChk.checked);
  floorChk.addEventListener('change', ()=>showField(floorChk.checked));
})();

(function initDuschwanneSmallMat(){
  const form = document.getElementById('form-duschwanne');
  if (!form) return;
  const smallMat = form.querySelector('input[name="smallMaterial"]');
  const smallMatChoice = document.getElementById('smallMatChoice');
  const variantRadios = Array.from(form.querySelectorAll('input[name="smallMaterialVariant"]'));
  function show(el,on){ if (!el) return; el.hidden=!on; el.setAttribute('aria-hidden', on?'false':'true'); }
  function setReq(list,on){ list.forEach(r=> on ? r.setAttribute('required','required') : r.removeAttribute('required')); }
  function clearSel(list){ list.forEach(r=> r.checked=false); }
  function apply(){
    const on = !!(smallMat && smallMat.checked);
    show(smallMatChoice,on); setReq(variantRadios,on);
    if (!on) clearSel(variantRadios);
  }
  form.addEventListener('change',(e)=>{ if (e.target?.name==='smallMaterial') apply(); });
  apply();
})();

(function initDuschwanneFlooringCheckboxes(){
  const form = document.getElementById('form-duschwanne');
  if (!form) return;

  const toggle = document.getElementById('addFlooring');
  const panel = document.getElementById('flooringPanel');
  const area  = document.getElementById('floorArea');

  const grpFlooring = Array.from(form.querySelectorAll('input[name="flooringProduct[]"]'));
  const grpAdhesive = Array.from(form.querySelectorAll('input[name="floorAdhesive[]"]'));
  const grpSealing  = Array.from(form.querySelectorAll('input[name="floorSealing[]"]'));

  function syncLabelChecked(input){
    const label = input.closest('label.image-check');
    if (!label) return;
    label.classList.toggle('is-checked', input.checked);
  }
  [...grpFlooring, ...grpAdhesive, ...grpSealing].forEach(inp => {
    inp.addEventListener('change', () => syncLabelChecked(inp));
    syncLabelChecked(inp);
  });

  function show(el,on){ el.hidden = !on; el.setAttribute('aria-hidden', on ? 'false' : 'true'); }
  function setReq(el,on){ if (!el) return; if (on) el.setAttribute('required','required'); else el.removeAttribute('required'); }
  function clearChecks(list){ list.forEach(i => { i.checked = false; syncLabelChecked(i); }); }

  function apply(){
    const on = !!(toggle && toggle.checked);
    show(panel, on);
    setReq(area, on);
    if (!on){
      area.value = '';
      clearChecks(grpFlooring); clearChecks(grpAdhesive); clearChecks(grpSealing);
    }
  }
  toggle?.addEventListener('change', apply);
  apply();
})();

/* Wandverkleidung UI */
(function initWandverkleidungUI(){
  const form = document.getElementById('form-wandverkleidung');
  if (!form) return;

  const checkTiles = form.querySelectorAll('label.image-check > input[type="checkbox"]');
  function syncLabelChecked(input){
    const label = input.closest('label.image-check');
    if (label) label.classList.toggle('is-checked', input.checked);
  }
  checkTiles.forEach(i => { i.addEventListener('change', () => syncLabelChecked(i)); syncLabelChecked(i); });

  const kindRadios = form.querySelectorAll('input[name="wvKind"]');
  const sections = {
    panels: document.getElementById('wvPanelsSection'),
    sealing: document.getElementById('wvSealingSection'),
    adhesive: document.getElementById('wvAdhesiveSection'),
    endProfile: document.getElementById('wvEndProfileSection'),
    profileAdhesive: document.getElementById('wvProfileAdhesiveSection'),
  };

  function clearSectionInputs(sectionEl){
    if (!sectionEl) return;
    sectionEl.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; syncLabelChecked(cb); });
    sectionEl.querySelectorAll('input[type="number"], input[type="text"]').forEach(t => t.value = '');
  }
  function show(el,on){ if (!el) return; el.hidden = !on; el.setAttribute('aria-hidden', on ? 'false' : 'true'); }

  function applyVisibility(){
    const selected = form.querySelector('input[name="wvKind"]:checked')?.value || '';

    if (selected === 'Keine'){
      Object.values(sections).forEach(el => { show(el, false); clearSectionInputs(el); });
      return;
    }
    Object.values(sections).forEach(el => show(el, true));
  }
  kindRadios.forEach(r => r.addEventListener('change', applyVisibility));
  applyVisibility();

  const cb997 = form.querySelector('#wv997');
  const qty997Wrap = form.querySelector('#wvQty997Wrap');
  const qty997 = form.querySelector('#wvQty997');
  const cb1497 = form.querySelector('#wv1497');
  const qty1497Wrap = form.querySelector('#wvQty1497Wrap');
  const qty1497 = form.querySelector('#wvQty1497');

  function setReq(el,on){ if (!el) return; if (on) el.setAttribute('required','required'); else el.removeAttribute('required'); }
  function clear(el){ if (el) el.value = ''; }
  function toggleQty(cb, wrap, input){
    const on = !!(cb && cb.checked);
    show(wrap, on);
    setReq(input, on);
    if (!on) clear(input);
  }
  function applyQty(){ toggleQty(cb997, qty997Wrap, qty997); toggleQty(cb1497, qty1497Wrap, qty1497); }
  cb997?.addEventListener('change', applyQty);
  cb1497?.addEventListener('change', applyQty);
  applyQty();

  form.addEventListener('change', (e) => {
    if (e.target?.name === 'wvKind' && e.target.value === 'Keine'){
      [cb997, cb1497].forEach(cb => { if (cb) cb.checked = false; });
      applyQty();
    }
  });
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
    cb.addEventListener('change', () => { syncLabelChecked(cb); if (map[cb.id]) setShown(map[cb.id], cb.checked); });
    syncLabelChecked(cb);
    if (map[cb.id]) setShown(map[cb.id], cb.checked);
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

// Preview price (no save)
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

// Save submission (with computed totals)
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
