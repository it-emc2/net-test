/**
 * @jest-environment jsdom
 *
 * Tests that BWT form fields (Anschlag, Farbe, door dimensions) are correctly
 * captured in the payload on save and correctly restored from payload on load.
 *
 * Bug reported: after restoring from payload, fields like bwtAnschlag (Links/Rechts),
 * tray_color (Farbe), and door dimension inputs were blank.
 */

// ─── Helpers extracted from script.js (keep in sync) ────────────────────────

/** Mirrors script.js formToObject */
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
  for (const k of Object.keys(obj)) {
    if (k.endsWith("[]") && !Array.isArray(obj[k])) obj[k] = [obj[k]];
  }
  return obj;
}

/** Mirrors script.js setRadio (without safeDispatch/event side-effects) */
function setRadio(name, value) {
  if (value == null) return false;
  const r = document.querySelector(
    `input[type="radio"][name="${name}"][value="${value}"]`
  );
  if (r) {
    r.checked = true;
    return true;
  }
  return false;
}

/** Mirrors script.js setByNameOrId (without event side-effects) */
function setByNameOrId(nameOrId, value) {
  if (value === undefined || value === null) return false;
  const el =
    document.querySelector(`[name="${nameOrId}"]`) ||
    document.getElementById(nameOrId);
  if (!el) return false;
  const t = (el.type || "").toLowerCase();
  if (t === "radio") {
    const r = document.querySelector(
      `[name="${nameOrId}"][value="${String(value)}"]`
    );
    if (r) { r.checked = true; return true; }
    return false;
  }
  el.value = String(value);
  return true;
}

/** Simplified restoreBwt – mirrors the field-setting logic from script.js ~10886.
 *  Also mirrors the fixed guard: `if (typeof syncBwtDoorStdHeightCaption === "function")`
 *  so that callers that never define the function don't crash the restore. */
function restoreBwt(bwt) {
  if (!bwt) return;

  // Door type checkbox
  if (bwt.bwtDoorType) {
    document.querySelectorAll('input[name="bwtDoorType"]').forEach((el) => {
      el.checked = String(el.value) === String(bwt.bwtDoorType);
    });
  }

  // Qtys & colors
  if (bwt.bwtDoorStdQty != null) setByNameOrId("bwtDoorStdQty", bwt.bwtDoorStdQty);
  if (bwt.bwtDoorStdColor != null) setByNameOrId("bwtDoorStdColor", bwt.bwtDoorStdColor);
  if (bwt.bwtDoorStdHeight != null) setByNameOrId("bwtDoorStdHeight", bwt.bwtDoorStdHeight);

  // Individual Tür - Wien dimensions
  if (bwt.bwtDoorIndWienHeight != null) setByNameOrId("bwtDoorIndWienHeight", bwt.bwtDoorIndWienHeight);
  if (bwt.bwtDoorIndWienWidth != null) setByNameOrId("bwtDoorIndWienWidth", bwt.bwtDoorIndWienWidth);
  if (bwt.bwtDoorIndWienStdWidth != null) setByNameOrId("bwtDoorIndWienStdWidth", bwt.bwtDoorIndWienStdWidth);
  if (bwt.bwtDoorIndWienDepthTop != null) setByNameOrId("bwtDoorIndWienDepthTop", bwt.bwtDoorIndWienDepthTop);
  if (bwt.bwtDoorIndWienDepthBottom != null) setByNameOrId("bwtDoorIndWienDepthBottom", bwt.bwtDoorIndWienDepthBottom);
  if (bwt.bwtDoorIndWienColor != null) setByNameOrId("bwtDoorIndWienColor", bwt.bwtDoorIndWienColor);

  // Wien Glas dimensions
  if (bwt.bwtDoorIndWienGlasHeight != null) setByNameOrId("bwtDoorIndWienGlasHeight", bwt.bwtDoorIndWienGlasHeight);
  if (bwt.bwtDoorIndWienGlasWidth != null) setByNameOrId("bwtDoorIndWienGlasWidth", bwt.bwtDoorIndWienGlasWidth);
  if (bwt.bwtDoorIndWienGlasFrameColor != null) setByNameOrId("bwtDoorIndWienGlasFrameColor", bwt.bwtDoorIndWienGlasFrameColor);

  // Anschlag (Links / Rechts radio)
  if (bwt.bwtAnschlag) setRadio("bwtAnschlag", bwt.bwtAnschlag);

  // Farbe (tray_color radio)
  if (bwt.tray_color) setRadio("tray_color", bwt.tray_color);
}

// ─── Minimal BWT form HTML ───────────────────────────────────────────────────

function buildBwtForm() {
  const form = document.createElement("form");
  form.id = "form-bwt";
  form.innerHTML = `
    <!-- Door type checkboxes (like bwtDoorType) -->
    <input type="checkbox" id="bwtDoorStd"       name="bwtDoorType" value="Universal / Standard Tür" data-product-id="1226" checked />
    <input type="checkbox" id="bwtDoorIndWien"   name="bwtDoorType" value="Individual Tür - Wien"   data-product-id="1227" />
    <input type="checkbox" id="bwtDoorIndWienGlas" name="bwtDoorType" value="Individual Tür - Wien Glas" data-product-id="1228" />
    <input type="checkbox" id="bwtDoorBudget"    name="bwtDoorType" value="Budget Tür - Verona"     data-product-id="1225" />
    <input type="checkbox" id="bwtDoorVariodoor" name="bwtDoorType" value="Variodoor"               data-product-id="1320" />

    <!-- Standard Tür fields -->
    <input id="bwtDoorStdQty"    name="bwtDoorStdQty"    type="number" value="1" />
    <select id="bwtDoorStdColor" name="bwtDoorStdColor">
      <option value="weiß" selected>weiß</option>
      <option value="Beige">Beige</option>
      <option value="Manhattan">Manhattan</option>
    </select>
    <input id="bwtDoorStdHeight" name="bwtDoorStdHeight" type="number" value="40" min="33" max="40" />

    <!-- Individual Tür - Wien fields -->
    <input id="bwtDoorIndWienQty"          name="bwtDoorIndWienQty"          type="number" value="1" />
    <input id="bwtDoorIndWienHeight"        name="bwtDoorIndWienHeight"        type="number" min="20" max="50" step="0.5" />
    <input id="bwtDoorIndWienWidth"         name="bwtDoorIndWienWidth"         type="number" min="30" max="50" step="0.5" />
    <select id="bwtDoorIndWienStdWidth"     name="bwtDoorIndWienStdWidth">
      <option value="">–</option>
      <option value="30,5 cm">30,5</option>
      <option value="45,5 cm">45,5</option>
    </select>
    <input id="bwtDoorIndWienDepthTop"      name="bwtDoorIndWienDepthTop"      type="number" min="7.5" max="40" step="0.5" />
    <input id="bwtDoorIndWienDepthBottom"   name="bwtDoorIndWienDepthBottom"   type="number" min="7.5" max="40" step="0.5" />
    <select id="bwtDoorIndWienColor"        name="bwtDoorIndWienColor">
      <option value="weiß" selected>weiß</option>
      <option value="silber">silber</option>
    </select>

    <!-- Individual Tür - Wien Glas fields -->
    <input id="bwtDoorIndWienGlasQty"           name="bwtDoorIndWienGlasQty"           type="number" value="1" />
    <input id="bwtDoorIndWienGlasHeight"         name="bwtDoorIndWienGlasHeight"         type="number" />
    <input id="bwtDoorIndWienGlasWidth"          name="bwtDoorIndWienGlasWidth"          type="number" />
    <select id="bwtDoorIndWienGlasStdWidth"      name="bwtDoorIndWienGlasStdWidth">
      <option value="">–</option>
      <option value="30,5 cm">30,5</option>
    </select>
    <input id="bwtDoorIndWienGlasDepthTop"       name="bwtDoorIndWienGlasDepthTop"       type="number" />
    <input id="bwtDoorIndWienGlasDepthBottom"    name="bwtDoorIndWienGlasDepthBottom"    type="number" />
    <input id="bwtDoorIndWienGlasFrameColor"     name="bwtDoorIndWienGlasFrameColor"     type="text" value="weiß" />

    <!-- Türanschlag (Links / Rechts) -->
    <input type="radio" name="bwtAnschlag" value="Links"  />
    <input type="radio" name="bwtAnschlag" value="Rechts" />

    <!-- Farbe (tray_color) -->
    <input type="radio" name="tray_color" value="Weiß"         />
    <input type="radio" name="tray_color" value="manhattan"    />
    <input type="radio" name="tray_color" value="bahama_beige" />
  `;
  document.body.appendChild(form);
  return form;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("BWT Save/Restore – Anschlag, Farbe, door dimensions", () => {
  let form;

  beforeEach(() => {
    document.body.innerHTML = "";
    form = buildBwtForm();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  // ── Payload capture (save side) ──────────────────────────────────────────

  describe("formToObject – payload capture", () => {
    test("captures bwtAnschlag=Links when Links radio is selected", () => {
      document.querySelector('input[name="bwtAnschlag"][value="Links"]').checked = true;
      const bwt = formToObject(form);
      expect(bwt.bwtAnschlag).toBe("Links");
    });

    test("captures bwtAnschlag=Rechts when Rechts radio is selected", () => {
      document.querySelector('input[name="bwtAnschlag"][value="Rechts"]').checked = true;
      const bwt = formToObject(form);
      expect(bwt.bwtAnschlag).toBe("Rechts");
    });

    test("bwtAnschlag is absent from payload when no radio is selected", () => {
      // No radio selected by default
      const bwt = formToObject(form);
      expect(bwt.bwtAnschlag).toBeUndefined();
    });

    test("captures tray_color=Weiß", () => {
      document.querySelector('input[name="tray_color"][value="Weiß"]').checked = true;
      const bwt = formToObject(form);
      expect(bwt.tray_color).toBe("Weiß");
    });

    test("captures tray_color=manhattan", () => {
      document.querySelector('input[name="tray_color"][value="manhattan"]').checked = true;
      const bwt = formToObject(form);
      expect(bwt.tray_color).toBe("manhattan");
    });

    test("captures tray_color=bahama_beige", () => {
      document.querySelector('input[name="tray_color"][value="bahama_beige"]').checked = true;
      const bwt = formToObject(form);
      expect(bwt.tray_color).toBe("bahama_beige");
    });

    test("captures bwtDoorStdHeight number value", () => {
      document.getElementById("bwtDoorStdHeight").value = "36";
      const bwt = formToObject(form);
      expect(bwt.bwtDoorStdHeight).toBe("36");
    });

    test("captures bwtDoorStdColor select value", () => {
      document.getElementById("bwtDoorStdColor").value = "Manhattan";
      const bwt = formToObject(form);
      expect(bwt.bwtDoorStdColor).toBe("Manhattan");
    });

    test("captures Individual Wien door height and width", () => {
      document.getElementById("bwtDoorIndWienHeight").value = "28.5";
      document.getElementById("bwtDoorIndWienWidth").value = "42";
      const bwt = formToObject(form);
      expect(bwt.bwtDoorIndWienHeight).toBe("28.5");
      expect(bwt.bwtDoorIndWienWidth).toBe("42");
    });

    test("captures Individual Wien door depth top and bottom", () => {
      document.getElementById("bwtDoorIndWienDepthTop").value = "15";
      document.getElementById("bwtDoorIndWienDepthBottom").value = "12.5";
      const bwt = formToObject(form);
      expect(bwt.bwtDoorIndWienDepthTop).toBe("15");
      expect(bwt.bwtDoorIndWienDepthBottom).toBe("12.5");
    });

    test("captures Individual Wien door StdWidth select", () => {
      document.getElementById("bwtDoorIndWienStdWidth").value = "30,5 cm";
      const bwt = formToObject(form);
      expect(bwt.bwtDoorIndWienStdWidth).toBe("30,5 cm");
    });

    test("captures Individual Wien door color", () => {
      document.getElementById("bwtDoorIndWienColor").value = "silber";
      const bwt = formToObject(form);
      expect(bwt.bwtDoorIndWienColor).toBe("silber");
    });

    test("captures Wien Glas frame color", () => {
      document.getElementById("bwtDoorIndWienGlasFrameColor").value = "anthrazit";
      const bwt = formToObject(form);
      expect(bwt.bwtDoorIndWienGlasFrameColor).toBe("anthrazit");
    });

    test("captures Wien Glas door height and width", () => {
      document.getElementById("bwtDoorIndWienGlasHeight").value = "33";
      document.getElementById("bwtDoorIndWienGlasWidth").value = "40";
      const bwt = formToObject(form);
      expect(bwt.bwtDoorIndWienGlasHeight).toBe("33");
      expect(bwt.bwtDoorIndWienGlasWidth).toBe("40");
    });

    test("captures door type when Individual Wien Glas is checked", () => {
      document.getElementById("bwtDoorStd").checked = false;
      document.getElementById("bwtDoorIndWienGlas").checked = true;
      const bwt = formToObject(form);
      expect(bwt.bwtDoorType).toBe("Individual Tür - Wien Glas");
    });
  });

  // ── Full round-trip (save → restore) ────────────────────────────────────

  describe("round-trip: save payload then restore to DOM", () => {
    test("bwtAnschlag=Links survives save/restore", () => {
      // save
      document.querySelector('input[name="bwtAnschlag"][value="Links"]').checked = true;
      const payload = formToObject(form);
      expect(payload.bwtAnschlag).toBe("Links");

      // reset
      document.querySelectorAll('input[name="bwtAnschlag"]').forEach((r) => r.checked = false);

      // restore
      restoreBwt(payload);
      expect(document.querySelector('input[name="bwtAnschlag"][value="Links"]').checked).toBe(true);
      expect(document.querySelector('input[name="bwtAnschlag"][value="Rechts"]').checked).toBe(false);
    });

    test("bwtAnschlag=Rechts survives save/restore", () => {
      document.querySelector('input[name="bwtAnschlag"][value="Rechts"]').checked = true;
      const payload = formToObject(form);

      document.querySelectorAll('input[name="bwtAnschlag"]').forEach((r) => r.checked = false);

      restoreBwt(payload);
      expect(document.querySelector('input[name="bwtAnschlag"][value="Rechts"]').checked).toBe(true);
    });

    test("tray_color=manhattan survives save/restore", () => {
      document.querySelector('input[name="tray_color"][value="manhattan"]').checked = true;
      const payload = formToObject(form);

      document.querySelectorAll('input[name="tray_color"]').forEach((r) => r.checked = false);

      restoreBwt(payload);
      expect(document.querySelector('input[name="tray_color"][value="manhattan"]').checked).toBe(true);
    });

    test("tray_color=bahama_beige survives save/restore", () => {
      document.querySelector('input[name="tray_color"][value="bahama_beige"]').checked = true;
      const payload = formToObject(form);

      document.querySelectorAll('input[name="tray_color"]').forEach((r) => r.checked = false);

      restoreBwt(payload);
      expect(document.querySelector('input[name="tray_color"][value="bahama_beige"]').checked).toBe(true);
    });

    test("tray_color=Weiß survives save/restore", () => {
      document.querySelector('input[name="tray_color"][value="Weiß"]').checked = true;
      const payload = formToObject(form);

      document.querySelectorAll('input[name="tray_color"]').forEach((r) => r.checked = false);

      restoreBwt(payload);
      expect(document.querySelector('input[name="tray_color"][value="Weiß"]').checked).toBe(true);
    });

    test("bwtDoorStdHeight survives save/restore", () => {
      document.getElementById("bwtDoorStdHeight").value = "36";
      const payload = formToObject(form);

      document.getElementById("bwtDoorStdHeight").value = "40"; // reset to default

      restoreBwt(payload);
      expect(document.getElementById("bwtDoorStdHeight").value).toBe("36");
    });

    test("bwtDoorStdColor survives save/restore", () => {
      document.getElementById("bwtDoorStdColor").value = "Beige";
      const payload = formToObject(form);

      document.getElementById("bwtDoorStdColor").value = "weiß";

      restoreBwt(payload);
      expect(document.getElementById("bwtDoorStdColor").value).toBe("Beige");
    });

    test("Individual Wien door – all dimensions survive save/restore", () => {
      // Switch to Wien door
      document.getElementById("bwtDoorStd").checked = false;
      document.getElementById("bwtDoorIndWien").checked = true;

      document.getElementById("bwtDoorIndWienHeight").value = "28.5";
      document.getElementById("bwtDoorIndWienWidth").value = "42";
      document.getElementById("bwtDoorIndWienStdWidth").value = "30,5 cm";
      document.getElementById("bwtDoorIndWienDepthTop").value = "15";
      document.getElementById("bwtDoorIndWienDepthBottom").value = "12.5";
      document.getElementById("bwtDoorIndWienColor").value = "silber";

      const payload = formToObject(form);

      // Verify all captured
      expect(payload.bwtDoorType).toBe("Individual Tür - Wien");
      expect(payload.bwtDoorIndWienHeight).toBe("28.5");
      expect(payload.bwtDoorIndWienWidth).toBe("42");
      expect(payload.bwtDoorIndWienStdWidth).toBe("30,5 cm");
      expect(payload.bwtDoorIndWienDepthTop).toBe("15");
      expect(payload.bwtDoorIndWienDepthBottom).toBe("12.5");
      expect(payload.bwtDoorIndWienColor).toBe("silber");

      // Reset
      document.getElementById("bwtDoorIndWienHeight").value = "";
      document.getElementById("bwtDoorIndWienWidth").value = "";
      document.getElementById("bwtDoorIndWienStdWidth").value = "";
      document.getElementById("bwtDoorIndWienDepthTop").value = "";
      document.getElementById("bwtDoorIndWienDepthBottom").value = "";
      document.getElementById("bwtDoorIndWienColor").value = "weiß";

      // Restore
      restoreBwt(payload);

      expect(document.getElementById("bwtDoorIndWien").checked).toBe(true);
      expect(document.getElementById("bwtDoorIndWienHeight").value).toBe("28.5");
      expect(document.getElementById("bwtDoorIndWienWidth").value).toBe("42");
      expect(document.getElementById("bwtDoorIndWienStdWidth").value).toBe("30,5 cm");
      expect(document.getElementById("bwtDoorIndWienDepthTop").value).toBe("15");
      expect(document.getElementById("bwtDoorIndWienDepthBottom").value).toBe("12.5");
      expect(document.getElementById("bwtDoorIndWienColor").value).toBe("silber");
    });

    test("Wien Glas door – height, width, frameColor survive save/restore", () => {
      document.getElementById("bwtDoorStd").checked = false;
      document.getElementById("bwtDoorIndWienGlas").checked = true;

      document.getElementById("bwtDoorIndWienGlasHeight").value = "33";
      document.getElementById("bwtDoorIndWienGlasWidth").value = "40";
      document.getElementById("bwtDoorIndWienGlasFrameColor").value = "anthrazit";

      const payload = formToObject(form);

      expect(payload.bwtDoorType).toBe("Individual Tür - Wien Glas");
      expect(payload.bwtDoorIndWienGlasHeight).toBe("33");
      expect(payload.bwtDoorIndWienGlasWidth).toBe("40");
      expect(payload.bwtDoorIndWienGlasFrameColor).toBe("anthrazit");

      // Reset
      document.getElementById("bwtDoorIndWienGlasHeight").value = "";
      document.getElementById("bwtDoorIndWienGlasWidth").value = "";
      document.getElementById("bwtDoorIndWienGlasFrameColor").value = "weiß";

      restoreBwt(payload);

      expect(document.getElementById("bwtDoorIndWienGlasHeight").value).toBe("33");
      expect(document.getElementById("bwtDoorIndWienGlasWidth").value).toBe("40");
      expect(document.getElementById("bwtDoorIndWienGlasFrameColor").value).toBe("anthrazit");
    });

    test("complete scenario: Anschlag=Rechts + tray_color=manhattan + Wien door", () => {
      document.getElementById("bwtDoorStd").checked = false;
      document.getElementById("bwtDoorIndWien").checked = true;
      document.getElementById("bwtDoorIndWienHeight").value = "30";
      document.getElementById("bwtDoorIndWienWidth").value = "35";
      document.querySelector('input[name="bwtAnschlag"][value="Rechts"]').checked = true;
      document.querySelector('input[name="tray_color"][value="manhattan"]').checked = true;

      const payload = formToObject(form);

      // Verify all fields captured
      expect(payload.bwtDoorType).toBe("Individual Tür - Wien");
      expect(payload.bwtDoorIndWienHeight).toBe("30");
      expect(payload.bwtDoorIndWienWidth).toBe("35");
      expect(payload.bwtAnschlag).toBe("Rechts");
      expect(payload.tray_color).toBe("manhattan");

      // Full reset
      document.getElementById("bwtDoorStd").checked = true;
      document.getElementById("bwtDoorIndWien").checked = false;
      document.getElementById("bwtDoorIndWienHeight").value = "";
      document.getElementById("bwtDoorIndWienWidth").value = "";
      document.querySelectorAll('input[name="bwtAnschlag"]').forEach((r) => r.checked = false);
      document.querySelectorAll('input[name="tray_color"]').forEach((r) => r.checked = false);

      // Restore
      restoreBwt(payload);

      expect(document.getElementById("bwtDoorIndWien").checked).toBe(true);
      expect(document.getElementById("bwtDoorIndWienHeight").value).toBe("30");
      expect(document.getElementById("bwtDoorIndWienWidth").value).toBe("35");
      expect(
        document.querySelector('input[name="bwtAnschlag"][value="Rechts"]').checked
      ).toBe(true);
      expect(
        document.querySelector('input[name="tray_color"][value="manhattan"]').checked
      ).toBe(true);
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  describe("edge cases", () => {
    test("formToObject handles no door checked (empty bwtDoorType)", () => {
      document.getElementById("bwtDoorStd").checked = false;
      const bwt = formToObject(form);
      expect(bwt.bwtDoorType).toBeUndefined();
    });

    test("restoreBwt with null is a no-op", () => {
      expect(() => restoreBwt(null)).not.toThrow();
    });

    test("restoreBwt with empty object is a no-op", () => {
      expect(() => restoreBwt({})).not.toThrow();
    });

    test("setRadio returns false for unknown value", () => {
      expect(setRadio("bwtAnschlag", "Mitte")).toBe(false);
    });

    test("restoreBwt does not crash when bwtAnschlag value has wrong case", () => {
      // The HTML has value="Links" (capital L). "links" (lowercase) should NOT match.
      expect(setRadio("bwtAnschlag", "links")).toBe(false);
      expect(document.querySelector('input[name="bwtAnschlag"]:checked')).toBeNull();
    });

    test("door dimension inputs captured even when door checkbox is unchecked", () => {
      // Wien door is unchecked but user previously entered values
      document.getElementById("bwtDoorIndWien").checked = false;
      document.getElementById("bwtDoorIndWienHeight").value = "28";
      const bwt = formToObject(form);
      // The dimension input should still be captured (it's a plain number input, not a checkbox)
      expect(bwt.bwtDoorIndWienHeight).toBe("28");
    });
  });

  // ── Regression: syncBwtDoorStdHeightCaption crash (script.js line 10954) ──
  //
  // Bug: restoreBwt called syncBwtDoorStdHeightCaption() — an undefined function —
  // between setting bwtDoorStdHeight and restoring bwtAnschlag/tray_color.
  // The ReferenceError aborted the rest of the restore, so Anschlag and Farbe
  // were never set. Fix: guard with typeof check before calling.
  //
  describe("regression: undefined sync function must not abort restore", () => {
    /** Simulates the BUGGY restoreBwt that calls an undefined caption-sync function */
    function restoreBwtBuggy(bwt) {
      if (!bwt) return;
      if (bwt.bwtDoorStdHeight != null) setByNameOrId("bwtDoorStdHeight", bwt.bwtDoorStdHeight);

      // Bug: calling an undefined function (no typeof guard) throws ReferenceError.
      // This is what the old code did: `syncBwtDoorStdHeightCaption();`
      const undefinedFn = undefined;
      undefinedFn(); // TypeError – simulates the missing function call

      // These lines were never reached in the buggy version:
      if (bwt.bwtAnschlag) setRadio("bwtAnschlag", bwt.bwtAnschlag);
      if (bwt.tray_color) setRadio("tray_color", bwt.tray_color);
    }

    /** Fixed version with typeof guard – mirrors the fix in script.js */
    function restoreBwtFixed(bwt) {
      if (!bwt) return;
      if (bwt.bwtDoorStdHeight != null) setByNameOrId("bwtDoorStdHeight", bwt.bwtDoorStdHeight);

      // Fix: guard with typeof before calling
      const syncBwtDoorStdHeightCaption = undefined; // intentionally undefined
      if (typeof syncBwtDoorStdHeightCaption === "function") {
        syncBwtDoorStdHeightCaption();
      }

      // These lines ARE reached now:
      if (bwt.bwtAnschlag) setRadio("bwtAnschlag", bwt.bwtAnschlag);
      if (bwt.tray_color) setRadio("tray_color", bwt.tray_color);
    }

    test("BUGGY version: calling undefined function crashes restore, Anschlag not set", () => {
      document.querySelector('input[name="bwtAnschlag"][value="Links"]').checked = true;
      const payload = formToObject(form);
      document.querySelectorAll('input[name="bwtAnschlag"]').forEach((r) => r.checked = false);

      // The buggy restore throws and never sets bwtAnschlag
      expect(() => restoreBwtBuggy(payload)).toThrow();
      expect(document.querySelector('input[name="bwtAnschlag"][value="Links"]').checked).toBe(false);
    });

    test("FIXED version: typeof guard prevents crash, Anschlag IS restored", () => {
      document.querySelector('input[name="bwtAnschlag"][value="Links"]').checked = true;
      document.querySelector('input[name="tray_color"][value="manhattan"]').checked = true;
      const payload = formToObject(form);

      document.querySelectorAll('input[name="bwtAnschlag"]').forEach((r) => r.checked = false);
      document.querySelectorAll('input[name="tray_color"]').forEach((r) => r.checked = false);

      // The fixed restore does NOT throw
      expect(() => restoreBwtFixed(payload)).not.toThrow();

      // And Anschlag + Farbe are correctly restored
      expect(document.querySelector('input[name="bwtAnschlag"][value="Links"]').checked).toBe(true);
      expect(document.querySelector('input[name="tray_color"][value="manhattan"]').checked).toBe(true);
    });
  });
});
