/**
 * @jest-environment jsdom
 *
 * Low-Budget/Badolux mode (#budgetToggle, name=budgetMode) across a save→restore
 * round trip.
 *
 * Bug reported: restoreDuschwanne() restored every Duschwanne field EXCEPT
 * budgetMode. A draft saved in budget mode reopened as premium — Badolux floor and
 * wall selections silently replaced by premium defaults, and re-pricing swapped
 * AGB001/AC004 back to AGD9060/KM02, i.e. a different offer than the one saved.
 *
 * Two things have to hold, and both are exercised here:
 *  1. the flag survives the round trip, and an ABSENT flag restores as OFF even when
 *     sessionStorage still holds "1" from an offer opened earlier in the same tab;
 *  2. a saved Badolux selection still lands once its tiles are rendered, since those
 *     are fetched asynchronously and don't exist while restore runs.
 */

/** Mirrors script.js formToObject (checkboxes serialize only when checked) */
function formToObject(form) {
  if (!form) return {};
  const fd = new FormData(form);
  const obj = {};
  for (const [key, value] of fd.entries()) {
    if (key in obj) {
      if (!Array.isArray(obj[key])) obj[key] = [obj[key]];
      obj[key].push(value);
    } else {
      obj[key] = value;
    }
  }
  return obj;
}

/** Mirrors the flag reading added to script.js restoreDuschwanne */
function budgetModeOf(dw) {
  return dw.budgetMode === "1" || dw.budgetMode === 1 || dw.budgetMode === true;
}

/** Mirrors script.js registerBudgetReapply / notifyBudgetTilesRendered */
function makeReapplyRegistry(isBudgetOn) {
  const entries = {};
  return {
    register: (key, fn) => {
      entries[key] = fn;
    },
    notify: () => {
      if (!isBudgetOn()) return;
      for (const fn of Object.values(entries)) fn();
    },
  };
}

/** Mirrors index.html: the checkbox lives OUTSIDE the form and is associated with
 *  it via form=, which is what gets budgetMode into the payload at all. */
function setupForm() {
  document.body.innerHTML = `
    <div class="tier-switch">
      <button class="tier-seg__btn" data-tier="standard" aria-pressed="false"></button>
      <button class="tier-seg__btn" data-tier="premium" aria-pressed="true"></button>
      <input id="budgetToggle" type="checkbox" name="budgetMode" value="1"
             form="form-duschwanne" hidden />
    </div>
    <form id="form-duschwanne"></form>
    <form id="form-fussboden">
      <input type="checkbox" name="flooringProduct[]" value="V5FB02|Lava-Beige" />
      <input type="checkbox" name="flooringProduct[]" value="V5FB02|Loft-Grau" />
      <div id="flooringBudgetOptions"></div>
    </form>`;
  return document.getElementById("budgetToggle");
}

/** Stands in for BadoluxManager building the Budget-Fußboden tiles from the API */
function renderBudgetFloorTiles(productIds) {
  const wrap = document.getElementById("flooringBudgetOptions");
  wrap.innerHTML = "";
  for (const pid of productIds) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "flooringProduct[]";
    input.value = `${pid}|Hydroträgerplatte`;
    wrap.appendChild(input);
  }
}

const checkedFloors = () =>
  [...document.querySelectorAll('input[name="flooringProduct[]"]:checked')].map(
    (i) => i.value,
  );

describe("budgetMode save → restore", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('serializes as "1" only when the toggle is on', () => {
    const toggle = setupForm();
    const form = document.getElementById("form-duschwanne");

    expect(formToObject(form).budgetMode).toBeUndefined();

    toggle.checked = true;
    expect(formToObject(form).budgetMode).toBe("1");
  });

  test("restores ON from a budget offer", () => {
    const toggle = setupForm();
    toggle.checked = budgetModeOf({ budgetMode: "1" });
    expect(toggle.checked).toBe(true);
  });

  test.each([
    ["absent (legacy or premium offer)", {}],
    ["explicit false", { budgetMode: false }],
    ["empty string", { budgetMode: "" }],
  ])("restores OFF for %s even with a poisoned session", (_label, dw) => {
    const toggle = setupForm();
    // an offer opened earlier in this tab left budget mode on
    sessionStorage.setItem("dw_budget_mode", "1");
    toggle.checked = true;

    toggle.checked = budgetModeOf(dw);

    expect(toggle.checked).toBe(false);
  });

  test("a saved Badolux floor still lands once its tiles are rendered", () => {
    const toggle = setupForm();
    toggle.checked = budgetModeOf({ budgetMode: "1" });

    const registry = makeReapplyRegistry(() => toggle.checked);
    const dw = { flooringProduct: ["BP003|Hydroträgerplatte"] };
    const applyFloor = () => {
      const target = dw.flooringProduct[0];
      document
        .querySelectorAll('input[name="flooringProduct[]"]')
        .forEach((cb) => {
          cb.checked = cb.value === target;
        });
    };

    applyFloor(); // synchronous restore: the BP tile does not exist yet
    expect(checkedFloors()).toEqual([]);

    registry.register("floors", applyFloor);
    renderBudgetFloorTiles(["BP001", "BP003"]);
    registry.notify();

    expect(checkedFloors()).toEqual(["BP003|Hydroträgerplatte"]);
  });

  test("a premium offer's re-apply does not run against budget tiles", () => {
    const toggle = setupForm();
    toggle.checked = budgetModeOf({}); // premium

    const registry = makeReapplyRegistry(() => toggle.checked);
    let calls = 0;
    registry.register("floors", () => calls++);
    registry.notify();

    expect(calls).toBe(0);
  });
});

/** Mirrors script.js getTrayTier / rowFor: which line's products are shown */
function getTrayTier() {
  return document.getElementById("budgetToggle")?.checked ? "standard" : "premium";
}

function rowFor(tier, lists) {
  return tier === "standard"
    ? { list: lists.badolux, name: "Standard" }
    : { list: lists.hassmann, name: "Premium" };
}

describe("Produktlinie Standard / Premium", () => {
  const LISTS = {
    hassmann: [{ productId: "SLA100100" }, { productId: "SLA110100" }],
    badolux: [{ productId: "DW020" }],
  };

  test("premium is the default, so offers without the flag are unchanged", () => {
    setupForm();
    expect(getTrayTier()).toBe("premium");
    expect(rowFor(getTrayTier(), LISTS).list).toBe(LISTS.hassmann);
  });

  test("standard shows the Badolux line only", () => {
    const toggle = setupForm();
    toggle.checked = true;
    expect(getTrayTier()).toBe("standard");
    expect(rowFor(getTrayTier(), LISTS).list).toBe(LISTS.badolux);
  });

  test("a saved tray from the other line is pinned, not auto-switched", () => {
    const toggle = setupForm(); // premium
    const savedPid = "DW020"; // Badolux tray saved on a premium offer
    const active = rowFor(getTrayTier(), LISTS);
    const other = rowFor("standard", LISTS);

    const pinned =
      savedPid && !active.list.some((p) => p.productId === savedPid)
        ? other.list.find((p) => p.productId === savedPid) || null
        : null;

    expect(pinned).toEqual({ productId: "DW020" });
    // the line — and therefore the accessory articles and the price — must not move
    expect(toggle.checked).toBe(false);
    expect(getTrayTier()).toBe("premium");
  });

  test("a tray from the active line is not pinned", () => {
    setupForm(); // premium
    const savedPid = "SLA100100";
    const active = rowFor(getTrayTier(), LISTS);
    const pinned = !active.list.some((p) => p.productId === savedPid);
    expect(pinned).toBe(false);
  });
});
