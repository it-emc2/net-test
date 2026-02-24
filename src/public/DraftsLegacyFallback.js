// DraftsLegacyFallback.js
// Extracted from legacy script.js bootDraftSearch IIFE.
// Transitional fallback only. Prefer DraftsManager when enabled.

export function bootDraftsLegacyFallback() {
  if (window.__FEATURES__?.draftsManager) {
    if (window.__DEBUG_MANAGERS__) console.log("[Drafts legacy] skipped (DraftsManager enabled)");
    return { skipped: true, reason: "DraftsManager enabled" };
  }

  function ready(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function renderDraftSearchResultsLocal(list){
    const container = document.getElementById('draftSearchResults');
    if (!container) return;
    container.innerHTML = '';
    if (!Array.isArray(list) || list.length === 0) {
      container.style.display = 'none';
      return;
    }
    const frag = document.createDocumentFragment();
    for (const d of list){
      const btn = document.createElement('button');
      btn.type='button';
      btn.className='draft-result-row';
      btn.dataset.id = d._id || d.id;
      btn.style.display='block';
      btn.style.width='100%';
      btn.style.textAlign='left';
      btn.style.padding='4px 10px';
      btn.style.border='none';
      btn.style.background='transparent';
      btn.style.cursor='pointer';
      btn.style.color='var(--text)';
      btn.onmouseenter=()=>btn.style.background='#eef2ff';
      btn.onmouseleave=()=>btn.style.background='transparent';
      const updated = d.updatedAt ? new Date(d.updatedAt).toLocaleString('de-DE') : '';
      btn.innerHTML = `<strong style="color:var(--accent-strong);">${d.name}</strong>` +
        (updated ? ` <span style="font-size:0.8em; color:#6b7280;">(${updated})</span>` : '');
      frag.appendChild(btn);
    }
    container.appendChild(frag);
    container.style.display='block';
  }

  async function searchDraftsLocal(query){
    const raw = (typeof window.getCurrentOfferType === 'function' && window.getCurrentOfferType()) || 'bu';
    const offerType = ['bu','bwt','hl'].includes(String(raw).trim().toLowerCase()) ? String(raw).trim().toLowerCase() : 'bu';
    const params = new URLSearchParams();
    params.set('offerType', offerType);
    if (query) params.set('q', query);
    const res = await fetch(`/api/drafts/search?${params.toString()}`);
    if (!res.ok) return renderDraftSearchResultsLocal([]);
    const data = await res.json().catch(()=>[]);
    renderDraftSearchResultsLocal(data);
  }

  async function loadDraftLocal(id){
    try{
      const res = await fetch(`/api/drafts/${encodeURIComponent(id)}`);
      if (!res.ok) return alert('Entwurf konnte nicht geladen werden.');
      const doc = await res.json();
      if (typeof window.restoreConfiguratorFromOffer === 'function') {
        window.restoreConfiguratorFromOffer(doc);
      } else if (typeof window.restoreConfiguratorFromSnapshot === 'function') {
        const payload = doc.payload || doc;
        window.restoreConfiguratorFromSnapshot({ payload });
      } else {
        return alert('Wiederherstellen ist noch nicht implementiert.');
      }
      window.updatePricing?.();
      window.showToast?.(`Entwurf "${doc.name}" geladen.`, 'info');
    }catch(e){
      console.error('loadDraftById error:', e);
      alert('Fehler beim Laden des Entwurfs.');
    }
  }

  function bind(){
    const input = document.getElementById('draftSearchInput');
    const results = document.getElementById('draftSearchResults');
    const btnLoad = document.getElementById('btnLoadSelectedDraft');
    if (!input || !results || !btnLoad) return;

    // avoid double-binding
    if (input.dataset.draftBound === '1') return;
    input.dataset.draftBound = '1';

    let selectedId = null;
    let debounceTimer = null;
    const debounce = (fn, ms)=>{ clearTimeout(debounceTimer); debounceTimer=setTimeout(fn, ms); };

    input.addEventListener('input', ()=>{
      const q = input.value.trim();
      selectedId = null;
      if (!q) {
        results.style.display='none';
        results.innerHTML='';
        return;
      }
      debounce(()=>searchDraftsLocal(q), 200);
    });

    results.addEventListener('click', (ev)=>{
      const btn = ev.target.closest('button.draft-result-row');
      if (!btn) return;
      selectedId = btn.dataset.id;
      Array.from(results.querySelectorAll('button.draft-result-row')).forEach((b)=>{
        b.style.background = b === btn ? '#e0e7ff' : 'transparent';
      });
      loadDraftLocal(selectedId);
      input.value = btn.textContent.trim();
      results.style.display='none';
    });

    btnLoad.addEventListener('click', ()=>{
      if (!selectedId) return alert('Bitte wählen Sie zuerst einen Entwurf aus der Liste.');
      loadDraftLocal(selectedId);
    });
  }

  ready(bind);
  window.addEventListener('hashchange', ()=>{
    // re-bind when navigating (safe no-op if already bound)
    bind();
  });

  return { ok: true };
}
