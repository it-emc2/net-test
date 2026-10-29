// Ticks the BU work tasks ("Arbeiten") from the Umbauart and the chosen products.
//
// - Umbauart decides Rückbau + Einbau (Wanne/Dusche → Dusche/Wanne).
// - Products decide the installs — reuses the task↔product couplings of the
//   Angebotscheck (WORK_RULES), so both always agree.
// - A task the user ticked/unticked by hand is never touched again
//   (persisted in duschwanne.manualTasks — not "workTasks…": pricing-core
//   reads every duschwanne key matching /worktasks/i as printed tasks).
// - Inactive without an Umbauart (older offers), while restoring, and for
//   sent offers — a sent offer's tasks/times stay frozen.
import { WORK_RULES, readSelection } from "./angebotscheck.js";
import { isSentMode } from "./SentOfferBar.js";

const TASK_SEL = 'input[name="duschwanne[workTasks][]"]';
const UMBAU_SEL = 'input[name="duschwanne[umbauart]"]';

// Rückbau of what is there today + Einbau of the target. The Angebotscheck
// flags the Einbau until the matching product is chosen.
const BY_UMBAUART = {
  wanne_dusche: ["remove_tub", "install_tray"],
  wanne_wanne: ["remove_tub", "install_bathtub"],
  dusche_dusche: ["remove_showertub", "install_tray"],
  dusche_wanne: ["remove_showertub", "install_bathtub"],
  ohne_rueckbau: [],
};

// Soft couplings (noReverse) are plausible without the task — not auto.
const PRODUCT_RULES = WORK_RULES.filter((r) => !r.noReverse);

// One product group, two tasks (sharesWith) — which one the selection means.
// Duschsystem: "direkt" products have the thermostat built in; "versetzt"
// needs a separate Aufputz-Armatur (its own Thermostat task). No answer yet →
// neither, the Angebotscheck flags it.
const VARIANT = {
  install_toilet: (sel) => !sel.priced("DEDWWC"),
  install_shower_wc: (sel) => sel.priced("DEDWWC"),
  replace_shower_with_thermo: (sel) => sel.checkedValue("showerMount") === "direkt",
  replace_shower_no_thermo: (sel) => sel.checkedValue("showerMount") === "versetzt",
};

const CONTROLLED = new Set([
  ...Object.values(BY_UMBAUART).flat(),
  ...PRODUCT_RULES.map((r) => r.task),
]);

const manualInput = () => document.getElementById("workTasksManual");
const manualSet = () =>
  new Set((manualInput()?.value || "").split(",").filter(Boolean));

function umbauart() {
  return document.querySelector(`${UMBAU_SEL}:checked`)?.value || "";
}

export function syncWorkTasks() {
  const art = umbauart();
  if (!art || window.__restoring || isSentMode()) return;

  const boxes = [...document.querySelectorAll(TASK_SEL)];
  const checked = new Set(boxes.filter((b) => b.checked).map((b) => b.value));
  const sel = readSelection(window.__pricing);
  const manual = manualSet();

  const want = new Set(BY_UMBAUART[art] || []);
  for (const rule of PRODUCT_RULES) {
    // The user already picked the sibling by hand — that covers the product.
    if ((rule.sharesWith || []).some((t) => manual.has(t) && checked.has(t))) continue;
    if (rule.has(sel) && (VARIANT[rule.task]?.(sel) ?? true)) want.add(rule.task);
  }

  let changed = false;
  for (const box of boxes) {
    if (!CONTROLLED.has(box.value) || manual.has(box.value)) continue;
    const on = want.has(box.value);
    if (box.checked === on) continue;
    box.checked = on;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    changed = true;
  }
  // Synthetic events are ignored by the live-pricing watcher.
  if (changed) {
    window.requestPricingRefresh?.({ delay: 80, reason: "arbeiten-auto" });
  }
}

// Only re-sync after a real user edit — pricing:updated also fires after
// restores and programmatic refreshes.
let userEdited = false;
const markEdit = (e) => {
  if (e.isTrusted && !window.__restoring) userEdited = true;
};
document.addEventListener("change", markEdit, true);
document.addEventListener("click", markEdit, true);

document.addEventListener("change", (e) => {
  if (!e.isTrusted) return;
  const t = e.target;
  if (t?.matches?.(TASK_SEL)) {
    const m = manualSet();
    m.add(t.value);
    manualInput().value = [...m].join(",");
  } else if (t?.matches?.(UMBAU_SEL)) {
    syncWorkTasks();
  }
});

window.addEventListener("pricing:updated", () => {
  if (!userEdited) return;
  userEdited = false;
  syncWorkTasks();
});
