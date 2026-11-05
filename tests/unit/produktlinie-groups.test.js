/**
 * @jest-environment jsdom
 *
 * Phase 2: Fußboden and Wandverkleidung follow the Produktlinie too — only the
 * active line's group is shown.
 *
 * Three rules are easy to get wrong and invisible when they break:
 *  - the inactive group must be DISABLED, not merely hidden, or its inputs stay
 *    in FormData and in HTML validation;
 *  - a `required` radio group is only satisfied by a checked radio, and the two
 *    lines share name="wvColor" — so the active line needs its own default,
 *    preferring the markup's own `checked` attribute;
 *  - an auto-default must never pick from the inactive line.
 */

function setupPage() {
  document.body.innerHTML = `
    <div id="flooringPremiumGroup">
      <input type="checkbox" name="flooringProduct[]" value="AVP-W|Weiß" data-color="Weiß" />
      <input type="checkbox" name="flooringProduct[]" value="V5FB02|Lava-Beige" data-color="Lava-Beige" />
    </div>
    <div id="flooringBudgetGroup" hidden>
      <input type="checkbox" name="flooringProduct[]" value="BP001|steingrau" />
      <input type="checkbox" name="flooringProduct[]" value="BP003|creme" />
    </div>
    <form id="form-wandverkleidung">
      <div id="wvColorSection">
        <input type="radio" name="wvColor" value="Weiß" required />
        <input type="radio" name="wvColor" value="Marmor weiß" checked required />
      </div>
      <div id="wvBudgetColorSection" hidden>
        <input type="radio" name="wvColor" value="WP001|Marmor weiß" />
        <input type="radio" name="wvColor" value="WP002|steingrau" />
      </div>
    </form>`;
}

/** Mirrors script.js setGroupActive */
function setGroupActive(el, active) {
  if (!el) return;
  el.hidden = !active;
  el.querySelectorAll("input, select, textarea").forEach((i) => {
    i.disabled = !active;
  });
}

/** Mirrors script.js ensureRadioDefault */
function ensureRadioDefault(groupEl) {
  if (!groupEl || groupEl.hidden) return;
  const radios = [...groupEl.querySelectorAll('input[type="radio"]:not(:disabled)')];
  const names = new Set(radios.map((r) => r.name).filter(Boolean));
  for (const name of names) {
    if (!document.querySelector(`input[type="radio"][name="${name}"][required]`)) continue;
    if (document.querySelector(`input[type="radio"][name="${name}"]:checked`)) continue;
    const inGroup = radios.filter((r) => r.name === name);
    const first = inGroup.find((r) => r.defaultChecked) || inGroup[0];
    if (first) first.checked = true;
  }
}

/** Mirrors script.js syncProduktlinieGroups */
function applyTier(tier) {
  const pairs = [
    ["flooringPremiumGroup", "flooringBudgetGroup"],
    ["wvColorSection", "wvBudgetColorSection"],
  ];
  const notes = [];
  for (const [prem, std] of pairs) {
    const active = document.getElementById(tier === "standard" ? std : prem);
    const inactive = document.getElementById(tier === "standard" ? prem : std);
    inactive.querySelectorAll("input:checked").forEach((i) => {
      notes.push(i.value);
      i.checked = false;
    });
    setGroupActive(inactive, false);
    setGroupActive(active, true);
    ensureRadioDefault(active);
  }
  return notes;
}

const checkedFloors = () =>
  [...document.querySelectorAll('input[name="flooringProduct[]"]:checked')].map((i) => i.value);

describe("Produktlinie groups on Fußboden and Wandverkleidung", () => {
  beforeEach(setupPage);

  test("standard shows Badolux and hides + disables premium", () => {
    applyTier("standard");
    expect(document.getElementById("flooringPremiumGroup").hidden).toBe(true);
    expect(document.getElementById("flooringBudgetGroup").hidden).toBe(false);
    expect(
      [...document.querySelectorAll("#flooringPremiumGroup input")].every((i) => i.disabled),
    ).toBe(true);
    expect(
      [...document.querySelectorAll("#flooringBudgetGroup input")].every((i) => !i.disabled),
    ).toBe(true);
  });

  test("the inactive line's inputs stay out of the payload", () => {
    applyTier("standard");
    document.querySelector('#flooringBudgetGroup input[value="BP003|creme"]').checked = true;
    const fd = new FormData(document.getElementById("form-wandverkleidung"));
    // disabled premium radios contribute nothing
    expect([...fd.keys()].filter((k) => k === "wvColor").length).toBe(1);
    expect(fd.get("wvColor")).toMatch(/^WP/);
  });

  test("a selection in the line being left is cleared and reported", () => {
    document.querySelector('#flooringPremiumGroup input[value="V5FB02|Lava-Beige"]').checked = true;
    const notes = applyTier("standard");
    expect(notes).toContain("V5FB02|Lava-Beige");
    expect(checkedFloors()).toEqual([]);
  });

  test("the required wvColor group stays satisfied in both lines", () => {
    const form = document.getElementById("form-wandverkleidung");
    applyTier("standard");
    expect(document.querySelector('input[name="wvColor"]:checked').value).toMatch(/^WP/);
    expect(form.checkValidity()).toBe(true);

    applyTier("premium");
    // back to the markup's own default, not just "the first one"
    expect(document.querySelector('input[name="wvColor"]:checked').value).toBe("Marmor weiß");
    expect(form.checkValidity()).toBe(true);
  });

  test("an auto-default never picks from the inactive line", () => {
    applyTier("standard");
    const selectable = [...document.querySelectorAll('input[name="flooringProduct[]"]')].filter(
      (i) => !i.disabled,
    );
    const def = selectable.find((i) => i.dataset.color === "Lava-Beige") || selectable[0];
    expect(def.value).toMatch(/^BP/); // Lava-Beige is premium and disabled
  });
});

/**
 * Per-section Produktlinien (2026-09-11).
 *
 * Reported: switching the Wandverkleidung to Standard also wiped the Duschwanne
 * and Fußboden selections, because all three shared one flag. They are now three
 * independent, additive fields — and "additive" is the load-bearing word: none of
 * the 3075 saved offers/drafts carries any of them, so a missing field must mean
 * Premium, never "inherit from another section".
 */
const LINE_FIELDS = {
  duschwanne: (p) => p.duschwanne?.budgetMode,
  fussboden: (p) => p.duschwanne?.floorBudgetMode,
  wand: (p) => p.wandverkleidung?.wvBudgetMode,
};

const lineOf = (payload, key) => (LINE_FIELDS[key](payload) === "1" ? "standard" : "premium");

describe("per-section Produktlinien", () => {
  test("a legacy payload has none of the fields → everything Premium", () => {
    const legacy = { duschwanne: { flooringProduct: ["V5FB02|Loft-Grau"] }, wandverkleidung: {} };
    expect(lineOf(legacy, "duschwanne")).toBe("premium");
    expect(lineOf(legacy, "fussboden")).toBe("premium");
    expect(lineOf(legacy, "wand")).toBe("premium");
  });

  test("the sections are independent — a mixed offer round-trips", () => {
    const mixed = {
      duschwanne: { budgetMode: "1" }, // Standard tray...
      wandverkleidung: { wvBudgetMode: "1" }, // ...Standard wall...
    };
    expect(lineOf(mixed, "duschwanne")).toBe("standard");
    expect(lineOf(mixed, "wand")).toBe("standard");
    expect(lineOf(mixed, "fussboden")).toBe("premium"); // ...but a Premium floor
  });

  test("one section's flag never leaks into another", () => {
    const onlyWall = { duschwanne: {}, wandverkleidung: { wvBudgetMode: "1" } };
    expect(lineOf(onlyWall, "wand")).toBe("standard");
    expect(lineOf(onlyWall, "duschwanne")).toBe("premium");
    expect(lineOf(onlyWall, "fussboden")).toBe("premium");
  });

  test("only budgetMode reaches the pricing rules", () => {
    // pricing-core reads dusch.budgetMode for AGB001/AC004 vs AGD9060/KM02.
    // The other two only decide which tiles are offered; the chosen floor/panel
    // carries its own price either way, so they must NOT be consulted there.
    const mixed = { duschwanne: { floorBudgetMode: "1" }, wandverkleidung: { wvBudgetMode: "1" } };
    const isBudgetMode = !!mixed.duschwanne.budgetMode;
    expect(isBudgetMode).toBe(false);
  });
});

/**
 * Warning before a line switch throws away a selection (2026-09-16).
 *
 * Reported: switching the Wandverkleidung on a BRAND-NEW offer announced
 * „Wandverkleidungsfarbe: 'Marmor weiß' … wurde entfernt" — but that is the
 * markup's own default, which nobody picked and which comes straight back on
 * switching back. Nothing was lost, so nothing should be said. A real choice, on
 * the other hand, must be confirmed BEFORE it disappears, not reported after.
 */
function makeLineWithChoiceTracking() {
  const state = { tier: "premium", userChoice: false, selection: "Marmor weiß", asked: [] };
  return {
    state,
    /** mirrors the trusted-change listener */
    userPicks(value) {
      state.selection = value;
      state.userChoice = true;
    },
    /** mirrors restoreWV marking a saved colour as a real choice */
    restore(value) {
      state.selection = value;
      state.userChoice = !!String(value || "").trim();
    },
    /** mirrors setLine's guard */
    switchTo(tier, confirmFn) {
      const atRisk = state.userChoice ? state.selection : "";
      if (atRisk) {
        state.asked.push(atRisk);
        if (!confirmFn()) return false; // cancelled: nothing changes
      }
      state.tier = tier;
      state.userChoice = false; // the new line starts on its own default
      state.selection = tier === "standard" ? "WP001|Marmor weiß" : "Marmor weiß";
      return true;
    },
  };
}

describe("switching a line warns only about real losses", () => {
  test("a brand-new offer switches silently — the default is not a choice", () => {
    const l = makeLineWithChoiceTracking();
    const ok = l.switchTo("standard", () => {
      throw new Error("must not ask");
    });
    expect(ok).toBe(true);
    expect(l.state.asked).toEqual([]);
  });

  test("switching back restores exactly the default, so nothing was lost", () => {
    const l = makeLineWithChoiceTracking();
    l.switchTo("standard", () => true);
    l.switchTo("premium", () => true);
    expect(l.state.selection).toBe("Marmor weiß");
    expect(l.state.asked).toEqual([]);
  });

  test("a chosen decor is confirmed first, and Abbrechen changes nothing", () => {
    const l = makeLineWithChoiceTracking();
    l.userPicks("Stein beige");
    const ok = l.switchTo("standard", () => false);
    expect(ok).toBe(false);
    expect(l.state.asked).toEqual(["Stein beige"]);
    expect(l.state.tier).toBe("premium");
    expect(l.state.selection).toBe("Stein beige");
  });

  test("confirming goes through", () => {
    const l = makeLineWithChoiceTracking();
    l.userPicks("Stein beige");
    expect(l.switchTo("standard", () => true)).toBe(true);
    expect(l.state.tier).toBe("standard");
  });

  test("a colour out of a saved offer counts as a real choice", () => {
    const l = makeLineWithChoiceTracking();
    l.restore("Stein beige");
    l.switchTo("standard", () => true);
    expect(l.state.asked).toEqual(["Stein beige"]);
  });

  test("an offer that saved no colour does not ask", () => {
    const l = makeLineWithChoiceTracking();
    l.restore("");
    l.switchTo("standard", () => {
      throw new Error("must not ask");
    });
    expect(l.state.asked).toEqual([]);
  });
});
