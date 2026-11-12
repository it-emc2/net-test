// Per-offer changes that used to need a hand-edited DOCX: wording ("Gleittür" → "Flexibles
// Duschsystem") and price. Stored in payload.offerOverrides, so they are saved with the
// draft, carried into "Neue Version" and applied server-side — wording in
// routes/docx-template.js (sanitizeRenderData), price in logic/pricing-core.js
// (sumPriceAdjustments), so every total and the DOCX/PDF/mail/signing page agree.

const state = { textReplacements: [], priceAdjustments: [], extraHinweise: [], lineEdits: [] };
const TAX = 0.19; // display hint only; the server uses its own TAX_RATE
const TARGETS = [["services", "Arbeiten (Pos. 001)"], ["material", "Material (Pos. 002)"]];
// AH/HMS/WD are priced client-side, outside computePrices, and their templates have no
// "Wichtige Hinweise" block.
const NO_PRICE_OFFERS = ["ah", "hms", "wd"];

const cleanText = (rows) =>
  (Array.isArray(rows) ? rows : [])
    .map((r) => ({ from: String(r?.from ?? "").trim(), to: String(r?.to ?? "") }))
    .filter((r) => r.from);
const cleanPrice = (rows) =>
  (Array.isArray(rows) ? rows : [])
    .map((r) => ({ target: r?.target === "material" ? "material" : "services", amountNet: Number(r?.amountNet) }))
    .filter((r) => Number.isFinite(r.amountNet) && r.amountNet !== 0);

// Single positions changed on the Kosten page (v2 add-on kosten-edit.js): description and/or
// net unit price of one line. Kept as stored; rows that change nothing are dropped.
const numOrNull = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const cleanLines = (rows) =>
  (Array.isArray(rows) ? rows : [])
    .map((r) => ({
      block: r?.block === "services" ? "services" : "material",
      id: String(r?.id ?? "").trim(),
      source: r?.source == null ? "" : String(r.source),
      origLabel: String(r?.origLabel ?? ""),
      label: String(r?.label ?? "").trim(),
      unitPriceNet: numOrNull(r?.unitPriceNet),
      origUnitPriceNet: numOrNull(r?.origUnitPriceNet),
      reason: String(r?.reason ?? "").trim(),
    }))
    .filter((r) => r.id && (r.label || r.unitPriceNet !== null));

const cleanHinweise = (rows) => (Array.isArray(rows) ? rows : []).map((t) => String(t ?? "").trim()).filter(Boolean);

/** Payload fragment; undefined when nothing is edited (keeps old payloads/fingerprints unchanged). */
export function getOfferOverrides() {
  const textReplacements = cleanText(state.textReplacements);
  const priceAdjustments = cleanPrice(state.priceAdjustments);
  const extraHinweise = cleanHinweise(state.extraHinweise);
  const lineEdits = cleanLines(state.lineEdits);
  if (!textReplacements.length && !priceAdjustments.length && !extraHinweise.length && !lineEdits.length) return undefined;
  return {
    ...(textReplacements.length ? { textReplacements } : {}),
    ...(priceAdjustments.length ? { priceAdjustments } : {}),
    ...(extraHinweise.length ? { extraHinweise } : {}),
    ...(lineEdits.length ? { lineEdits } : {}),
  };
}

export function setOfferOverrides(o) {
  state.textReplacements = cleanText(o?.textReplacements).map((r) => ({ ...r }));
  state.priceAdjustments = cleanPrice(o?.priceAdjustments).map((r) => ({ ...r }));
  state.extraHinweise = cleanHinweise(o?.extraHinweise);
  state.lineEdits = cleanLines(o?.lineEdits);
  paint();
  requestPricing();
}

let priceTimer;
function requestPricing() {
  clearTimeout(priceTimer);
  priceTimer = setTimeout(() => window.requestPricingRefresh?.({ delay: 0, reason: "offer-price-override" }), 400);
}

const fmt = (n) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", signDisplay: "exceptZero" });
const locked = () => document.body.classList.contains("is-sent-offer");

function line(label, control) {
  const el = document.createElement("label");
  el.className = "oo-line";
  const name = document.createElement("span");
  name.textContent = label;
  el.append(name, control);
  return el;
}

// The preview listens for input/change on the page; removing a row fires neither.
const notifyPreview = () => document.getElementById("offerOverridesCard")?.dispatchEvent(new Event("change", { bubbles: true }));

function removeButton(onClick) {
  const del = document.createElement("button");
  del.type = "button";
  del.className = "oo-del";
  del.textContent = "✕";
  del.title = "Entfernen";
  del.disabled = locked();
  del.addEventListener("click", () => { onClick(); notifyPreview(); });
  return del;
}

function textInput(value, placeholder, onInput) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.placeholder = placeholder;
  input.disabled = locked();
  input.addEventListener("input", () => onInput(input.value));
  return input;
}

function paintText() {
  const list = document.getElementById("offerOverridesList");
  if (!list) return;
  list.innerHTML = "";
  state.textReplacements.forEach((r, i) => {
    const row = document.createElement("div");
    row.className = "oo-row";
    row.append(
      line("Statt", textInput(r.from, "Text im Angebot", (v) => { r.from = v; badge(); })),
      line("Neu", textInput(r.to, "ersetzen durch", (v) => { r.to = v; badge(); })),
      removeButton(() => { state.textReplacements.splice(i, 1); paint(); }),
    );
    list.append(row);
  });
}

function paintPrice() {
  const list = document.getElementById("offerPriceList");
  if (!list) return;
  const offer = String(window.getCurrentOfferType?.() || "").toLowerCase();
  // With per-position prices on the Kosten page the block adjustment is only shown for
  // offers that already carry one.
  const hidden = NO_PRICE_OFFERS.includes(offer) || (window.__ocKostenEdit === true && !state.priceAdjustments.length);
  for (const id of ["offerPriceTitle", "offerPriceList", "offerPriceAdd"]) {
    const el = document.getElementById(id);
    if (el) el.hidden = hidden;
  }
  list.innerHTML = "";
  state.priceAdjustments.forEach((r, i) => {
    const row = document.createElement("div");
    row.className = "oo-row";

    const select = document.createElement("select");
    select.disabled = locked();
    for (const [value, text] of TARGETS) select.add(new Option(text, value, false, value === r.target));
    select.addEventListener("change", () => { r.target = select.value; badge(); requestPricing(); });

    const gross = document.createElement("span");
    gross.className = "oo-gross";
    const showGross = () => { gross.textContent = Number.isFinite(Number(r.amountNet)) && Number(r.amountNet) ? `${fmt(Number(r.amountNet) * (1 + TAX))} brutto` : ""; };
    const amount = document.createElement("input");
    amount.type = "number";
    amount.step = "0.01";
    amount.placeholder = "± € netto";
    amount.value = Number.isFinite(Number(r.amountNet)) && r.amountNet !== "" ? r.amountNet : "";
    amount.disabled = locked();
    amount.addEventListener("input", () => { r.amountNet = amount.value === "" ? NaN : Number(amount.value); showGross(); badge(); requestPricing(); });
    showGross();
    const amountLine = line("Netto", amount);
    amountLine.append(gross);

    row.append(line("Position", select), amountLine, removeButton(() => { state.priceAdjustments.splice(i, 1); paint(); requestPricing(); }));
    list.append(row);
  });
}

function paintHinweise() {
  const list = document.getElementById("offerHinweiseList");
  if (!list) return;
  const hidden = NO_PRICE_OFFERS.includes(String(window.getCurrentOfferType?.() || "").toLowerCase());
  for (const id of ["offerHinweiseTitle", "offerHinweiseList", "offerHinweiseAdd"]) {
    const el = document.getElementById(id);
    if (el) el.hidden = hidden;
  }
  list.innerHTML = "";
  state.extraHinweise.forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "oo-row oo-single";
    const area = document.createElement("textarea");
    area.rows = 2;
    area.value = t;
    area.placeholder = "z. B. Die Montage erfolgt nach Absprache an einem Werktag.";
    area.disabled = locked();
    area.addEventListener("input", () => { state.extraHinweise[i] = area.value; badge(); });
    row.append(line("Hinweis", area), removeButton(() => { state.extraHinweise.splice(i, 1); paint(); }));
    list.append(row);
  });
}

function paint() {
  paintText();
  paintPrice();
  paintHinweise();
  for (const id of ["offerOverridesAdd", "offerPriceAdd", "offerHinweiseAdd"]) {
    const el = document.getElementById(id);
    if (el) el.disabled = locked();
  }
  badge();
}

// A draft that still carries the number of a sent offer gets that offer's frozen price
// (server flag _locked), so price edits would silently do nothing.
let lockedNumber = "";
const currentNumber = () => String(document.getElementById("offerNumber")?.value || "").trim();

function paintLocked(ev) {
  const el = document.getElementById("offerLockedNote");
  // Remember which number the server froze; a stale price response must not re-show the
  // note once "Neue Version" has given the offer a fresh number.
  if (ev?.detail) lockedNumber = ev.detail._locked ? currentNumber() : "";
  const show = !locked() && !!lockedNumber && lockedNumber === currentNumber();
  if (el) el.hidden = !show;
  // card is closed by default — keep the frozen price visible in its header
  const mark = document.getElementById("offerLockedMark");
  if (mark) mark.hidden = !show;
}

function badge() {
  const el = document.getElementById("offerOverridesBadge");
  if (!el) return;
  const t = cleanText(state.textReplacements).length;
  const p = cleanPrice(state.priceAdjustments).length;
  const h = cleanHinweise(state.extraHinweise).length;
  const l = cleanLines(state.lineEdits).length;
  const parts = [t && `${t} Text`, p && `${p} Preis`, h && `${h} Hinweis${h > 1 ? "e" : ""}`, l && `${l} Position${l > 1 ? "en" : ""}`].filter(Boolean);
  el.hidden = !parts.length;
  el.textContent = parts.length ? `${parts.join(" · ")} angepasst` : "";
}

if (typeof document !== "undefined") {
  window.getOfferOverrides = getOfferOverrides;
  window.setOfferOverrides = setOfferOverrides;
  // Kosten page: replace the per-position changes, keep everything else, re-price.
  window.getOfferLineEdits = () => cleanLines(state.lineEdits);
  window.setOfferLineEdits = (rows) => {
    state.lineEdits = cleanLines(rows);
    badge();
    notifyPreview();
    window.dispatchEvent(new CustomEvent("offer-line-edits:changed"));
    clearTimeout(priceTimer);
    window.requestPricingRefresh?.({ delay: 0, reason: "offer-line-edit" });
  };
  document.addEventListener("DOMContentLoaded", () => {
    const add = (id, key, row, selector) =>
      document.getElementById(id)?.addEventListener("click", () => {
        state[key].push({ ...row });
        paint();
        document.querySelector(`${selector} .oo-row:last-child input`)?.focus();
      });
    add("offerOverridesAdd", "textReplacements", { from: "", to: "" }, "#offerOverridesList");
    add("offerPriceAdd", "priceAdjustments", { target: "services", amountNet: NaN }, "#offerPriceList");
    document.getElementById("offerHinweiseAdd")?.addEventListener("click", () => {
      state.extraHinweise.push("");
      paint();
      document.querySelector("#offerHinweiseList .oo-row:last-child textarea")?.focus();
    });
    paint();
  });
  // Sent offers are read-only; the offer type decides whether price edits apply.
  new MutationObserver(paint).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  window.addEventListener("offerflow:changed", () => { paint(); paintLocked(); });
  window.addEventListener("pricing:updated", paintLocked);
  document.getElementById("offerLockedNew")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try { await window.startNewOfferVersion?.(); } finally { e.target.disabled = false; paintLocked(); }
  });
}
