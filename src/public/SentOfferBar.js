// src/public/SentOfferBar.js
//
// State bar for an offer that has already been sent. A sent offer's price is
// pinned server-side (Offer.locked — see logic/pricing-core.js), which is not
// obvious from the form alone: edits are possible but the total will not move
// until the offer is saved as a new version, which becomes an Entwurf under
// its own offer number and prices against current values again
// (routes/drafts.js freshNumberIfSent).
//
// The form stays fully interactive on purpose: accordions, dialogs and pickers
// have to open so the user can review what was actually sent. Only the price
// is fixed, and the bar is what says so.

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

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("de-DE");
}

export function isSentMode() {
  return document.body.classList.contains(BODY_CLASS);
}

export function exitSentMode() {
  document.body.classList.remove(BODY_CLASS);
  document.getElementById(BAR_ID)?.remove();
  clearOffsets();
  window.removeEventListener("resize", syncOffsets);
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
    <p class="sob-hint">Der Preis bleibt auf dem versendeten Stand. Änderungen wirken sich erst in einer neuen Version aus.</p>
  `;
  // Not via innerHTML: the number comes from the server and is rendered as text.
  bar.querySelector(".sob-number").textContent = offerNumber || "";

  document.querySelector("body > header")?.after(bar);
  document.body.classList.add(BODY_CLASS);
  syncOffsets();
  window.addEventListener("resize", syncOffsets, { passive: true });

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
