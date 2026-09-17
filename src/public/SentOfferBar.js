// src/public/SentOfferBar.js
//
// State bar for an offer that has already been sent. A sent offer's price is
// pinned server-side (Offer.locked — see logic/pricing-core.js), so the form
// must not pretend to be editable: editing it would change nothing the user
// can save, and the total would silently stay on the sent figure. Instead the
// document is shown read-only with one way forward — create a new version,
// which becomes an Entwurf under its own offer number and prices against
// current values again (routes/drafts.js freshNumberIfSent).
//
// Read-only is done with the native `inert` attribute, never with `disabled`:
// buildPayload() reads the form via FormData, which silently drops disabled
// controls, so disabling the form would empty the very payload the new version
// is built from. `inert` takes the fields out of pointer, keyboard and screen
// reader reach while leaving their values intact.

const BAR_ID = "sentOfferBar";
const STYLE_ID = "sent-offer-bar-styles";
const BODY_CLASS = "is-sent-offer";

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${BAR_ID} {
      position: sticky;
      top: var(--sent-bar-top, 56px);
      z-index: 45;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px 16px;
      padding: 10px 22px;
      background: var(--panel);
      border-bottom: 1px solid var(--border);
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
    }
    #${BAR_ID} .sob-info {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      font-size: 14px;
      color: var(--card-foreground, inherit);
    }
    #${BAR_ID} .sob-badge {
      flex: none;
      padding: 2px 9px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--card-hover, transparent);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: .02em;
    }
    #${BAR_ID} .sob-number { font-variant-numeric: tabular-nums; }
    #${BAR_ID} .sob-hint {
      flex-basis: 100%;
      margin: 0;
      font-size: 13px;
      color: var(--muted-foreground, #6b7280);
    }
    #${BAR_ID} .sob-actions { display: flex; align-items: center; gap: 8px; }
    #${BAR_ID} button {
      font: inherit;
      padding: 7px 14px;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid var(--accent, #7C3AED);
      background: var(--accent, #7C3AED);
      color: #fff;
      font-weight: 600;
    }
    #${BAR_ID} button[disabled] { opacity: .6; cursor: progress; }
    #${BAR_ID}.is-flashing { animation: sob-flash .5s ease-out 2; }
    @keyframes sob-flash {
      0%, 100% { background: var(--panel); }
      50% { background: var(--accent-weak, #ede9fe); }
    }
    body.${BODY_CLASS} form[id^="form-"][inert] {
      opacity: .72;
      filter: saturate(.85);
    }
    @media (prefers-reduced-motion: reduce) {
      #${BAR_ID}.is-flashing { animation: none; }
    }
  `;
  document.head.appendChild(style);
}

// The header is sticky at top:0, so the bar has to start below it — and the
// sticky sidebar hangs off --header-h, so that has to grow by the bar's height
// too or the bar covers the first menu entries.
function syncOffsets() {
  const root = document.documentElement;
  const headerH = document.querySelector("body > header")?.offsetHeight;
  if (!headerH) return;
  root.style.setProperty("--sent-bar-top", `${headerH}px`);
  const barH = document.getElementById(BAR_ID)?.offsetHeight || 0;
  root.style.setProperty("--header-h", `${headerH + barH}px`);
}

function clearOffsets() {
  document.documentElement.style.removeProperty("--sent-bar-top");
  document.documentElement.style.removeProperty("--header-h");
}

const setFormsInert = (inert) => {
  document
    .querySelectorAll('form[id^="form-"]')
    .forEach((f) => { f.inert = inert; });
};

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("de-DE");
}

let clickCatcher = null;

export function isSentMode() {
  return document.body.classList.contains(BODY_CLASS);
}

export function exitSentMode() {
  document.body.classList.remove(BODY_CLASS);
  document.getElementById(BAR_ID)?.remove();
  setFormsInert(false);
  clearOffsets();
  window.removeEventListener("resize", syncOffsets);
  if (clickCatcher) {
    document.removeEventListener("click", clickCatcher, true);
    clickCatcher = null;
  }
}

/**
 * Show the read-only state for an already-sent offer.
 *
 * @param {object}   opts
 * @param {string}   opts.offerNumber
 * @param {string|Date} [opts.sentAt]
 * @param {() => Promise<any>} opts.onNewVersion  resolves once the new
 *        version exists; the bar closes itself when it does.
 */
export function enterSentMode({ offerNumber, sentAt, onNewVersion } = {}) {
  ensureStyles();
  exitSentMode();

  const bar = document.createElement("div");
  bar.id = BAR_ID;
  bar.setAttribute("role", "status");

  const date = formatDate(sentAt);
  bar.innerHTML = `
    <div class="sob-info">
      <span class="sob-badge">📨 Versendet</span>
      <span>${date ? `am ${date} · ` : ""}<strong class="sob-number"></strong></span>
    </div>
    <div class="sob-actions">
      <button type="button" data-action="new-version">Neue Version erstellen</button>
    </div>
    <p class="sob-hint">Versendete Angebote sind schreibgeschützt — für Änderungen eine neue Version erstellen.</p>
  `;
  // Not via innerHTML: the number comes from the server and is rendered as text.
  bar.querySelector(".sob-number").textContent = offerNumber || "";

  document.querySelector("body > header")?.after(bar);
  document.body.classList.add(BODY_CLASS);
  setFormsInert(true);
  syncOffsets();
  window.addEventListener("resize", syncOffsets, { passive: true });

  // An inert form receives no events, so a click inside one is delivered to
  // the page section around it: the user tried to edit, and the bar flashes
  // to say why nothing happened.
  clickCatcher = (ev) => {
    if (ev.target.closest?.(`#${BAR_ID}`)) return;
    if (!ev.target.closest?.('section[id^="page-"]')) return;
    bar.classList.remove("is-flashing");
    void bar.offsetWidth; // restart the animation
    bar.classList.add("is-flashing");
  };
  document.addEventListener("click", clickCatcher, true);

  const btn = bar.querySelector('[data-action="new-version"]');
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Wird erstellt …";
    try {
      await onNewVersion?.();
      exitSentMode();
    } catch (err) {
      console.error("[sent-offer] new version failed:", err);
      btn.disabled = false;
      btn.textContent = "Neue Version erstellen";
      window.toast?.error?.(
        "Neue Version fehlgeschlagen",
        err?.message || String(err),
      );
    }
  });

  return bar;
}
