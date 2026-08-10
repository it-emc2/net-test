// session-recovery.js
// Keeps the work-in-progress offer recoverable if the browser throws the page
// away.
//
// Reported from the field: a technician saved the survey, switched to MagicPlan
// (LiDAR, memory-hungry), and iOS discarded the Safari tab. Coming back reloaded
// the app from scratch and most of the form was empty — the configurator holds
// its state in the DOM, and only a handful of widgets happened to keep their own
// localStorage key, which is why *some* fields survived and most did not.
//
// So: snapshot buildPayload() as the user works, and offer to put it back on the
// next load. Never applied automatically — a silent restore over a deliberate
// fresh start would be its own bug.
const DB_NAME = "nt-session-recovery";
const STORE = "snapshot";
const KEY = "current";
const DB_VERSION = 1;

// Long enough not to write on every keystroke, short enough that little is lost
// if the tab is killed without warning.
const DEBOUNCE_MS = 1200;

let dbPromise = null;
let pristine = null; // serialized empty-form baseline
let timer = null;
let started = false;

// initSessionRecovery() only runs after DOM-ready + drafts-ready, which can lag
// behind a fast typist on a slow connection. If the user already started
// filling the form before that resolves, the "pristine" baseline below would
// wrongly include their live input, making an unrelated old snapshot look
// mismatched and popping the banner mid-typing. Track real input up front so
// that race can't masquerade as a stale-snapshot prompt.
let userTypedEarly = false;
document.addEventListener("input", () => (userTypedEarly = true), { capture: true, once: true });
document.addEventListener("change", () => (userTypedEarly = true), { capture: true, once: true });

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, run) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const out = run(t.objectStore(STORE));
        t.oncomplete = () => resolve(out?.result ?? out);
        t.onerror = () => reject(t.error);
      }),
  );
}

const put = (record) => tx("readwrite", (s) => s.put(record, KEY));
const clear = () => tx("readwrite", (s) => s.delete(KEY));
const load = () => tx("readonly", (s) => s.get(KEY));

function currentSnapshot() {
  const payload = window.buildPayload?.();
  if (!payload) return null;
  return {
    payload, // buildPayload() already carries offerNumber (script.js:4397)
    offerType: String(window.getCurrentOfferType?.() || "bu").toLowerCase(),
    step: window.getCurrentStep?.() || "",
    savedAt: new Date().toISOString(),
  };
}

// Compare payloads only: savedAt changes every call and would defeat this.
const fingerprint = (snap) => JSON.stringify(snap?.payload ?? null);

async function save() {
  try {
    const snap = currentSnapshot();
    if (!snap) return;
    // An untouched form must never produce a "restore?" prompt on next load.
    if (fingerprint(snap) === pristine) {
      await clear();
      return;
    }
    await put(snap);
  } catch (err) {
    console.warn("[session-recovery] save failed:", err);
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(save, DEBOUNCE_MS);
}

function flush() {
  clearTimeout(timer);
  // Fire and forget: the page may be gone before this resolves, which is
  // exactly why the debounced writes above carry most of the weight.
  save();
}

function attachListeners() {
  // Capture phase so this sees events from every form without wiring each one.
  document.addEventListener("input", schedule, true);
  document.addEventListener("change", schedule, true);

  // The one that matters on iOS: switching apps fires visibilitychange, while
  // beforeunload frequently never runs when a tab is discarded.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}

function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return today ? `heute ${time}` : `${d.toLocaleDateString("de-DE")} ${time}`;
}

function showBanner(snap, { onRestore, onDiscard }) {
  const bar = document.createElement("div");
  bar.id = "sessionRecoveryBar";
  bar.setAttribute("role", "alertdialog");
  bar.style.cssText =
    "position:fixed;left:0;right:0;top:0;z-index:10050;display:flex;gap:12px;" +
    "align-items:center;justify-content:center;flex-wrap:wrap;padding:12px 16px;" +
    "background:#fef3c7;color:#78350f;border-bottom:1px solid #f59e0b;" +
    "font-size:.95rem;box-shadow:0 2px 8px rgba(0,0,0,.12);";

  const text = document.createElement("span");
  text.textContent =
    `Nicht gespeicherter Stand von ${formatWhen(snap.savedAt)} gefunden ` +
    `(${String(snap.offerType || "").toUpperCase()}).`;

  const btn = (label, primary) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText =
      "padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:600;" +
      (primary
        ? "background:#b45309;color:#fff;border:1px solid #b45309;"
        : "background:transparent;color:#78350f;border:1px solid #b45309;");
    return b;
  };

  const restoreBtn = btn("Wiederherstellen", true);
  restoreBtn.id = "sessionRecoveryRestore";
  const discardBtn = btn("Verwerfen", false);
  discardBtn.id = "sessionRecoveryDiscard";

  restoreBtn.addEventListener("click", () => onRestore(bar, restoreBtn));
  discardBtn.addEventListener("click", () => onDiscard(bar));

  bar.append(text, restoreBtn, discardBtn);
  document.body.appendChild(bar);
  return bar;
}

async function applySnapshot(snap) {
  const offerType = String(snap.offerType || "bu").toLowerCase();
  // Same order DraftsManager uses when loading a draft: pick the view first,
  // then fill it.
  window.applyWizardState?.({ offerType, step: snap.step || undefined });

  if (typeof window.restoreConfiguratorFromSnapshot === "function") {
    await window.restoreConfiguratorFromSnapshot({ payload: snap.payload });
  } else if (typeof window.restoreConfiguratorFromOffer === "function") {
    await window.restoreConfiguratorFromOffer({ payload: snap.payload });
  } else {
    throw new Error("Keine Restore-Funktion verfügbar");
  }

  // Write the offer number back last. Boot mints a fresh one, and restoring
  // through the offer path does not reliably win against it — this is the field
  // that went out as "1234", so it does not get to depend on ordering.
  const savedNumber = String(snap.payload?.offerNumber || "").trim();
  if (savedNumber) {
    const el = document.querySelector("#offerNumber");
    if (el && el.value !== savedNumber) el.value = savedNumber;
  }
}

export async function initSessionRecovery() {
  if (started) return;
  started = true;

  // Baseline first, before any restore, so it really is the empty form.
  pristine = fingerprint(currentSnapshot());

  let existing = null;
  try {
    existing = await load();
  } catch (err) {
    console.warn("[session-recovery] load failed:", err);
  }

  attachListeners();

  if (!existing?.payload) return null;

  // The user was already typing before this async check resolved: showing a
  // "restore old state?" banner now would interrupt live work over a
  // baseline that never was actually empty. Keep the snapshot for next boot
  // instead of interrupting this one.
  if (userTypedEarly) return null;

  showBanner(existing, {
    onRestore: async (bar, button) => {
      button.disabled = true;
      try {
        await applySnapshot(existing);
        bar.remove();
        // Persist again straight away: the snapshot was consumed, and the tab
        // could be discarded before the user touches anything.
        await save();
        window.toast?.success?.("Wiederhergestellt", "Der letzte Stand wurde geladen.");
      } catch (err) {
        console.error("[session-recovery] restore failed:", err);
        button.disabled = false;
        window.toast?.error?.(
          "Wiederherstellen fehlgeschlagen",
          String(err?.message || err),
        );
      }
    },
    onDiscard: async (bar) => {
      // Clear before removing the bar, not after: the bar vanishing is the
      // user's cue that it is done, and if they navigate on that cue while the
      // delete is still in flight the snapshot comes back on the next load.
      await clear().catch(() => {});
      bar.remove();
    },
  });

  return existing;
}

// Exposed for tests and for a manual "clear" if one is ever needed.
export const __internals = { save, flush, load, clear };
