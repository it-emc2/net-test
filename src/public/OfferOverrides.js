// Per-offer wording changes ("Gleittür" → "Flexibles Duschsystem") that used to need a
// hand-edited DOCX. Stored in payload.offerOverrides, so they are saved with the draft,
// carried into "Neue Version" and applied server-side to DOCX, PDF, mail and signing
// (routes/docx-template.js sanitizeRenderData).

const state = { textReplacements: [] };

const clean = (rows) =>
  (Array.isArray(rows) ? rows : [])
    .map((r) => ({ from: String(r?.from ?? "").trim(), to: String(r?.to ?? "") }))
    .filter((r) => r.from);

/** Payload fragment; undefined when nothing is edited (keeps old payloads/fingerprints unchanged). */
export function getOfferOverrides() {
  const textReplacements = clean(state.textReplacements);
  return textReplacements.length ? { textReplacements } : undefined;
}

export function setOfferOverrides(o) {
  state.textReplacements = clean(o?.textReplacements).map((r) => ({ ...r }));
  paint();
}

function paint() {
  const list = document.getElementById("offerOverridesList");
  if (!list) return;
  const locked = document.body.classList.contains("is-sent-offer");
  list.innerHTML = "";
  state.textReplacements.forEach((r, i) => {
    const row = document.createElement("div");
    row.className = "oo-row";
    for (const [key, label] of [["from", "Statt"], ["to", "Neu"]]) {
      const line = document.createElement("label");
      line.className = "oo-line";
      const name = document.createElement("span");
      name.textContent = label;
      const input = document.createElement("input");
      input.type = "text";
      input.value = r[key];
      input.placeholder = key === "from" ? "Text im Angebot" : "ersetzen durch";
      input.disabled = locked;
      input.addEventListener("input", () => {
        state.textReplacements[i][key] = input.value;
        badge();
      });
      line.append(name, input);
      row.append(line);
    }
    const del = document.createElement("button");
    del.type = "button";
    del.className = "oo-del";
    del.textContent = "✕";
    del.title = "Entfernen";
    del.disabled = locked;
    del.addEventListener("click", () => {
      state.textReplacements.splice(i, 1);
      paint();
    });
    row.append(del);
    list.append(row);
  });
  const add = document.getElementById("offerOverridesAdd");
  if (add) add.disabled = locked;
  badge();
}

function badge() {
  const el = document.getElementById("offerOverridesBadge");
  if (!el) return;
  const n = clean(state.textReplacements).length;
  el.hidden = !n;
  el.textContent = n ? `${n} Textänderung${n > 1 ? "en" : ""} aktiv` : "";
}

if (typeof document !== "undefined") {
  window.getOfferOverrides = getOfferOverrides;
  window.setOfferOverrides = setOfferOverrides;
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("offerOverridesAdd")?.addEventListener("click", () => {
      state.textReplacements.push({ from: "", to: "" });
      paint();
      document.querySelector("#offerOverridesList .oo-row:last-child input")?.focus();
    });
    paint();
  });
  // Sent offers are read-only; repaint when entering/leaving that mode.
  new MutationObserver(paint).observe(document.body, { attributes: true, attributeFilter: ["class"] });
}
