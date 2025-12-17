// src/logic/pricing.js
export default (ProductModel) => {
  // Minimal helper: adjust only the visible label to billable qty (selected - 1)
  // - Does NOT change qty, unitPrice, or lineTotal (so totals remain untouched).
  // - If billable becomes 0 and hideWhenZero=true, remove the line from the list (keeps "0 Stk" hidden).
  function setCL40LabelToBillable(list, { hideWhenZero = false } = {}) {
    const row = list?.find((l) => (l.productId || l.id) === "CLPESG40");
    if (!row) return;

    const selectedQty = Number(row.qty || 0) || 0;
    const billableQty = Math.max(0, selectedQty - 1);

    if (billableQty === 0 && hideWhenZero) {
      const idx = list.indexOf(row);
      if (idx > -1) list.splice(idx, 1);
      return;
    }

    // strip any "(hidden)" that older logic may have appended
    const baseName = (row.name || row.label || row.productId || "")
      .replace(/\s*\(hidden\)\s*$/, "")
      .trim();

    row.label = `- ${billableQty} Stk ${baseName}`;
    // IMPORTANT: do not touch row.qty / row.unitPrice / row.lineTotal
  }

  // --- helper: include selected tray as a material line ---

  async function getProductsByIds(ids) {
    const unique = [...new Set((ids || []).filter(Boolean))];
    if (!unique.length) return new Map();
    const docs = await ProductModel.find({ productId: { $in: unique } }).lean();
    const map = new Map();
    for (const d of docs) {
      map.set(d.productId, {
        price: Number(d.price) || 0,
        name: d.name || "",
      });
    }
    return map;
  }

  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const ceilSafe = (n) => Math.ceil((Number(n) || 0) - 1e-12);

  const TAX_RATE = 0.19;

  // --- active offer / Bereich helpers ---
  function getActiveOffer(payload) {
    // default to 'bu' for backward compatibility
    const k = payload?.activeOffer;
    if (k === "bu" || k === "bwt" || k === "hl") {
      console.log("current offer type is ", k);
      return k;
    }

    return "bu";
  }

  function getMaterialsTitle(offerKey) {
    switch (offerKey) {
      case "bwt":
        return "Material für Badewannentür";
      case "hl":
        return "Material für Handlauf";
      case "bu":
      default:
        return "Material für Badumbau";
    }
  }

  function collectSelections(payload) {
    const out = [];
    const opt = payload?.optional || {};
    // --- quantities for Haltegriffe (esp. CLPESG40) ---
    const cl40Qty =
      Number(opt?.qty_CLPESG40 ?? (opt?.opt_CLPESG40 ? 1 : 0)) || 0;
    // if you also use the other grab bars anywhere, define them too (optional):
    const cl60Qty =
      Number(opt?.qty_CLPESG60 ?? (opt?.opt_CLPESG60 ? 1 : 0)) || 0;
    const cl80Qty =
      Number(opt?.qty_CLPESG80 ?? (opt?.opt_CLPESG80 ? 1 : 0)) || 0;

    const aliasToId = { CL_BASIN: "CL" };
    const push = (id, qtyRaw, checked) => {
      const qtyNum =
        qtyRaw !== undefined && qtyRaw !== null && qtyRaw !== ""
          ? Number(qtyRaw)
          : checked
            ? 1
            : 0;
      const qty = Number.isFinite(qtyNum) ? qtyNum : 0;
      if ((checked || qty > 0) && qty > 0) out.push({ productId: id, qty });
    };
    for (const [key, val] of Object.entries(opt)) {
      if (key.startsWith("opt_")) {
        const k = key.slice(4);
        const id = aliasToId[k] || k;
        push(id, opt[`qty_${k}`], Boolean(val));
      } else if (key.startsWith("qty_")) {
        const k = key.slice(4);
        const id = aliasToId[k] || k;
        const qty = val;
        const checked = Boolean(opt[`opt_${k}`]);
        push(id, qty, checked);
      }
    }
    return out;
  }

  // Prefer numeric payload.pricing.markupPct; fallback to Kundendaten.aufschlag like "35%".
  const extractMarkupPct = (payload) => {
    const fromNumeric = payload?.pricing?.markupPct;
    if (typeof fromNumeric === "number" && Number.isFinite(fromNumeric)) {
      return fromNumeric;
    }
    const a = payload?.Kundendaten?.aufschlag;
    if (!a) return 0.35; // safe default
    const m = String(a)
      .trim()
      .match(/^(\d+)\%$/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) return n / 100;
    }
    return 0.35;
  };

  // Build zero-cost "work notes" for DOCX and UI
  function computeWorkNotes(payload) {
    const opt = payload?.optional || {};
    const kind = payload?.wandverkleidung?.wvKind || "";
    const dusch = payload?.duschwanne || {};

    const picked = new Set();

    // Wandverkleidung
    if (kind === "Fehlstellen") picked.add("Schließen der Fehlstellen");
    if (kind === "Deckenhoch")
      picked.add("Verkleidung Deckenhoch im Dusch/ Wannenbereich");
    if (kind === "Duschabtrennung")
      picked.add("Herstellung des Fliesenspiegels");
    if (kind === "Fliesenspiegel")
      picked.add("Herstellung des Fliesenspiegels");
    if (kind === "Innenraum-der-Kabine")
      picked.add("Verkleidung im Innenraum der Kabine");
    if (kind === "alle-Bad-Wände") picked.add("Verkleidung aller Bad-Wände");

    // Generic detector: true if non-empty array/string, or qty > 0
    const chosen = (flag, qty) => {
      if (Array.isArray(flag) && flag.length > 0) return true;
      if (typeof flag === "string" && flag.trim() !== "") return true;
      if (flag === true) return true;
      const q = Number(qty);
      return Number.isFinite(q) && q > 0;
    };

    // IMPORTANT: your keys include [] in their names
    const shower = chosen(
      opt["optShower[]"],
      opt.qty_V22WS1R ||
        opt.qty_TEMPDSU250 ||
        opt.qty_V22BG903R ||
        opt.qty_DEDS2503E,
    );
    const grab = chosen(
      opt["optGrab[]"],
      opt.qty_CLPESG40 || opt.qty_CLPESG60 || opt.qty_CLPESG80,
    );
    const fold = chosen(opt["optFold[]"], opt.qty_DEPSKG60 || opt.qty_DEPSKG85);
    const basin = chosen(opt["optBasin[]"], opt.qty_CL60);
    const tap = chosen(opt["optBasinTap[]"], opt.qty_CL_BASIN || opt.qty_DEPOH);
    const thermo = chosen(
      opt["optThermo[]"],
      opt.qty_CLTB || opt.qty_DEPTB || opt.qty_CLB,
    );
    const seat = chosen(opt["optSeat[]"], opt.qty_DEPKS);

    if (shower) picked.add("Auswechseln des Duschsystems");
    if (grab) picked.add("Anbringen zusätzlicher Haltegriffe");
    if (fold) picked.add("Anbringen zusätzlicher Stützklappgriffe");
    if (basin) picked.add("Auswechseln eines Waschtisches");
    if (tap) picked.add("Einbau einer einhand-Waschtischbatterie");
    if (thermo) picked.add("Austausch eines Thermostates");
    //if (seat)   picked.add('Einbau einer Duschhocker es');

    // >>> robust DW workTasks parse (handles odd literal keys like "duschwanne[workTasks][]")
    function normalizeDWTasks(payload) {
      const dw = payload?.duschwanne ?? {};
      const out = [];

      const addVal = (v) => {
        if (!v) return;
        if (Array.isArray(v)) {
          out.push(...v);
          return;
        }
        if (typeof v === "string") {
          // try JSON array first; else comma-separated; else single value
          try {
            const parsed = JSON.parse(v);
            if (Array.isArray(parsed)) {
              out.push(...parsed);
              return;
            }
          } catch {}
          const parts = v.includes(",") ? v.split(",") : [v];
          out.push(...parts.map((s) => s.trim()).filter(Boolean));
          return;
        }
      };
      const addExtraVal = (v) => {
        if (!v) return;
        if (Array.isArray(v)) {
          for (const x of v) {
            const s = String(x ?? "").trim();
            if (s) out.push(s);
          }
          return;
        }
        if (typeof v === "string") {
          const s = v.trim();
          if (s) out.push(s);
          return;
        }
      };

      // Existing sources (checkbox tasks)
      addVal(dw.workTasks);
      addVal(dw["workTasks[]"]);
      addVal(payload?.["duschwanne[workTasks][]"]);
      addVal(payload?.["duschwanne.workTasks"]);
      addVal(payload?.duschwanne_workTasks);

      // ✅ NEW: free-text extra tasks (no comma-splitting)
      addExtraVal(dw.extraTasks);
      addExtraVal(dw["extraTasks[]"]);
      addExtraVal(payload?.["duschwanne[extraTasks][]"]);
      addExtraVal(payload?.["duschwanne.extraTasks"]);
      addExtraVal(payload?.duschwanne_extraTasks);

      // Catch any weird nesting under duschwanne, e.g. "duschwanne[extraTasks][]"
      for (const [k, v] of Object.entries(dw)) {
        if (/worktasks/i.test(k)) {
          addVal(v); // checkbox-style lists: keep comma-splitting
        } else if (/extratasks?/i.test(k)) {
          addExtraVal(v); // free text: NO comma-splitting
        }
      }

      // de-dup & return
      return Array.from(new Set(out));
    }

    const MAP_DW = {
      remove_tub: "Entfernen und Entsorgen der Badewanne inkl. Befliesung",
      remove_showertub:
        "Entfernen und Entsorgen der Duschwanne inkl. Befliesung",
      remove_enclosure: "Entfernen und Entsorgen der Duschabtrennung",
      install_tray: "Einbau der Duschwanne",
      install_enclosure: "Einbau der Duschabtrennung",
      relocate_faucet: "Armatur verlegen",
      relocate_drain: "Abfluss verlegen",
      close_valve: "Stilllegen der Armatur",
    };

    const dwTasks = normalizeDWTasks(payload);
    for (const key of dwTasks) {
      const k = String(key).trim();
      const mapped = MAP_DW[k];
      picked.add(mapped || k); // <-- keep free-text as-is if no mapping exists
    }

    // <<< end robust parse

    return Array.from(picked).map((txt) => ({
      key: "worknote",
      label: `- ${txt}`,
      amount: 0,
    }));
  }

  async function computeMaterials(payload) {
    const offer = getActiveOffer(payload); // 'bu' | 'bwt' | 'hl'
    const markupPctForBwt = extractMarkupPct(payload); // 0.35 for "35%", etc.

    const dusch = payload?.duschwanne || {};
    const wv = payload?.wandverkleidung || {};
    const opt = payload?.optional || {};
    const bwt = payload?.bwt || {};
    const hl = payload?.hl || {};

    // For Haltegriff counts (used by UI logic later)
    let grabTotalQty = 0;
    let cl40Qty = 0;

    const lines = [];
    const idsNeeded = new Set();

    const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
    const ceilSafe = (n) => Math.ceil((Number(n) || 0) - 1e-12);

    // normalize "1.234,56", "1234.56", "100", "1.234,56 €" → Number
    const parseMoneyStrict = (v) => {
      if (typeof v === "number" && Number.isFinite(v)) return v;
      let s = String(v ?? "").trim();
      if (!s) return 0;
      // drop currency symbols & extraneous chars, keep digits and separators
      const cleaned = s
        .replace(/[^\d,.\-]/g, "")
        .replace(/\s+/g, "")
        .replace(/\./g, "")
        .replace(",", ".");
      const n = parseFloat(cleaned);
      return Number.isFinite(n) ? n : 0;
    };

    // helper to push unresolved lines; we resolve names/prices at the end
    const add = (id, qty, labelOverride, unitOverride, source) => {
      const q = Number(qty) || 0;
      if (!id || q <= 0) return;
      idsNeeded.add(id);
      lines.push({
        id,
        qty: q,
        label: labelOverride || null,
        unitOverride: Number.isFinite(unitOverride)
          ? Number(unitOverride)
          : null,
        source: source || null, // 'optional' for optionals, else null
      });
    };

    // ------- Duschwanne ancillary
    if (dusch.abdichtSet) add("TRWDB", 1);
    if (dusch.drainSet) add("AGD9060", 1);
    if (dusch.smallMaterial) add("KM02", 1);
    if (dusch.stelzlager) add("STELZ", 1);

    // ------- Fußboden
    const addFlooring = !!dusch.addFlooring;
    const floorArea =
      Number(String(dusch.floorArea ?? "").replace(",", ".")) || 0;

    if (addFlooring && floorArea > 0) {
      // Paneele inkl. 15% Verschnitt
      const panels = ceilSafe((floorArea * 1.15) / 0.3);

      // minimal inline color extraction from the first selected item
      const fp = Array.isArray(dusch.flooringProduct)
        ? dusch.flooringProduct[0] || ""
        : "";
      const color = fp.includes("|") ? fp.split("|", 2)[1].trim() : "";

      add(
        "V5FB02",
        panels,
        `- ${panels} Stk Fußboden-Paneele (1 Paneele = 0.3 m²)${color ? " — Farbe: " + color : ""}`,
      );

      // Flächenkleber (0,60 m²/Pack)
      const packs = ceilSafe(floorArea / 0.6);
      if (packs > 0)
        add(
          "R_4260602",
          packs,
          `- ${packs} Pkg Flächenkleber (1 Pkg je 0,60 m²)`,
        );

      // Bodenabdichtung pro m² (Checkbox name can be floorSealing or floorSealing[])
      const floorSealingOn = !!(dusch.floorSealing || dusch["floorSealing[]"]);
      if (floorSealingOn) {
        const effM2 = round2(floorArea * 1.15);
        if (effM2 > 0) {
          idsNeeded.add("TRBDSET7");
          lines.push({
            id: "TRBDSET7",
            qty: effM2,
            label: `- ${effM2} m² Trinnity Bodenabdichtung (inkl. 15% Verschnitt)`,
            perM2Base: 7, // derive €/m² = price(TRBDSET7)/7
            source: null,
          });
        }
      }

      // individ. 5.0 V5FB02 — Menge = eingegebene m², Preis/Einheit = DB-Preis von V5FB02
      // const m2 = round2(floorArea);
      // if (m2 > 0) {
      //   add('V5FB02', m2, `- ${m2} m² Fußboden individ.5.0 V5FB02`);
      // }
    }

    // ------- Wandverkleidung
    const qty997 = Number(wv?.wvQty997 || 0) || 0;
    const qty1497 = Number(wv?.wvQty1497 || 0) || 0;
    const totalPanels = qty997 + qty1497;

    // OLD global color (fallback)
    const wvColor = String(wv?.wvColor || "").trim();

    // NEW: per-panel config (comes from buildPayload.panelConfigs)
    const panelCfg = wv?.panelConfigs || {};
    const cfg997 = panelCfg["997x2550"] || {};
    const cfg1497 = panelCfg["1497x2550"] || {};

    const color997 = String(cfg997.color || wvColor).trim();
    const color1497 = String(cfg1497.color || wvColor).trim();

    if (qty997 > 0) {
      const base = `- ${qty997} Stk Wandverkleidung 3.0 Alu 997×2550 mm`;
      const label = color997 ? `${base} — Farbe: ${color997}` : base;
      add("V3WVK09", qty997, label);
    }
    if (qty1497 > 0) {
      const base = `- ${qty1497} Stk Wandverkleidung 3.0 Alu 1497×2550 mm`;
      const label = color1497 ? `${base} — Farbe: ${color1497}` : base;
      add("V3WV09", qty1497, label);
    }
    if (wv?.wvSealing) add("TRWDSET5", 1);
    if (wv?.flechenkleber) {
      const userQtyAdh = Number(wv?.wvFlachenQty);
      const fallbackAdh = 2 * qty997 + 2 * qty1497;
      const qAdh =
        Number.isFinite(userQtyAdh) && userQtyAdh > 0
          ? userQtyAdh
          : fallbackAdh;
      if (qAdh > 0)
        add("R_4260602", qAdh, `- ${qAdh} Pkg Flächenkleber (Wandverkleidung)`);
    }
    let endProfilesQty = 0;
    if (wv?.wvEndProfile) {
      endProfilesQty = Number(wv?.wvEndProfileQty) || 0;
      if (endProfilesQty > 0) add("V3A", endProfilesQty);
    }
    // Prefer explicit user-entered qty from the WV form
    const userRaw = wv?.wvV3VQty;
    const userV3VQty = Math.max(0, parseInt(userRaw, 10) || 0);
    const corners = Number(wv?.wvCornersCount || 0) || 0;

    // If the user provided a value (including 0), use it; else fall back to (panels - 1)
    if (
      userRaw !== undefined &&
      userRaw !== null &&
      String(userRaw).trim() !== ""
    ) {
      if (userV3VQty > 0) {
        add("V3V", userV3VQty, `- ${userV3VQty} Stk Verbindungsprofil(e)`);
      }
    } else if (totalPanels >= 2) {
      console.log("corn ", corners);
      const qV3V = Math.max(0, totalPanels - 1 - corners);
      add(
        "V3V",
        qV3V,
        `- ${qV3V} Stk Verbindungsprofil(e) (Plattenanzahl - 1 - ecken)`,
      );
    }
    if (wv?.wvSilikon) {
      const userQtySilikon = Number(wv?.wvSilikonQty);
      const qtyAbschlussprofil = endProfilesQty;
      // this is the qty of V3A
      let qSilikon;
      if (Number.isFinite(userQtySilikon) && userQtySilikon > 0) {
        // take user choice, but minimum is qty of Abschlussprofil
        qSilikon = Math.max(userQtySilikon, qtyAbschlussprofil);
      } else {
        // if user did not enter a valid value, fall back to Abschlussprofil qty
        qSilikon = qtyAbschlussprofil;
      }
      if (qSilikon > 0) add("2000302", qSilikon);
    }
    // ------- BWT · Badewannentür materials -------
    if (offer === "bwt") {
      // Example: standard door quantity
      // Tür-Varianten: jede ausgewählte Tür einzeln mit ihrer Menge hinzufügen
      const doors = [
        { qty: Number(bwt?.bwtDoorStdQty || 0) || 0, pid: "1226" },
        { qty: Number(bwt?.bwtDoorBudgetQty || 0) || 0, pid: "1225" },
        { qty: Number(bwt?.bwtDoorIndWienGlasQty || 0) || 0, pid: "1228" },
        { qty: Number(bwt?.bwtDoorVariodoorQty || 0) || 0, pid: "1320" },
        { qty: Number(bwt?.bwtDoorIndWienQty || 0) || 0, pid: "1227" },
      ];

      for (const door of doors) {
        if (!door.qty) continue;

        add(
          door.pid, // Tür-spezifische Artikelnummer
          door.qty, // jeweilige Menge
          null, // Label aus DB
          null, // Preis aus DB
          null,
        );
      }

      // Aids / Haltegriffe quantities (40 / 60 / 80 cm)
      const aidsHg40Qty = Number(bwt?.bwtAidsHaltegriff40Qty || 0) || 0;
      const aidsHg60Qty = Number(bwt?.bwtAidsHaltegriff60Qty || 0) || 0;
      const aidsHg80Qty = Number(bwt?.bwtAidsHaltegriff80Qty || 0) || 0;

      // Helper so BWT Haltegriffe are included in grabTotalQty / cl40Qty
      const addGrab = (pid, qty) => {
        const q = Number(qty) || 0;
        if (q <= 0) return;

        add(
          pid,
          q,
          null, // use DB name as label
          null, // use DB price as unit
          null,
        );

        // keep global grab counts in sync (used later in pricing/UI logic)
        grabTotalQty += q;
        if (pid === "CLPESG40") {
          cl40Qty += q;
        }
      };

      addGrab("CLPESG40", aidsHg40Qty);
      addGrab("CLPESG60", aidsHg60Qty);
      addGrab("CLPESG80", aidsHg80Qty);

      // BWT: Freier Posten (Zusätzliche Positionen BWT) → as materials
      if (Array.isArray(bwt?.quickAdd) && bwt.quickAdd.length) {
        for (const row of bwt.quickAdd) {
          if (!row) continue;

          const qty = Number(row.qty ?? 0) || 0;
          if (qty <= 0) continue;

          // robust parse of "1.234,56", "1234.56", "799,00 €", etc.
          const unitPrice = parseMoneyStrict(row.price);
          if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;

          // base name / Bezeichnung
          const rawLabel = String(row.label ?? row.name ?? "").trim();
          const rawPid = String(row.productId ?? "").trim();

          const pid = rawPid || "BWT_CUSTOM";

          // build "name [id]" part
          let base = rawLabel;
          if (rawLabel && rawPid) {
            base = `${rawLabel} [${rawPid}]`;
          }

          // qty formatting (e.g. "3" instead of "3.0")
          let qtyDisplay = "";
          if (Number.isFinite(qty)) {
            qtyDisplay = Number.isInteger(qty) ? String(qty) : String(qty);
          }

          // final label: "qty Stk name [id]"
          let label = base || null;
          if (base && qtyDisplay) {
            label = `- ${qtyDisplay} Stk ${base}`;
          }

          // add(id, qty, labelOverride, unitOverride, source)
          add(
            pid,
            qty,
            label, // e.g. "3 Stk Filterpatrone [FP-123]"
            unitPrice, // user-entered unit price
            "BWT_EXTRA", // 🔹 mark as Freier Posten (BWT) for DOCX
          );
        }
      }

      // bwt[bwtinfoTasks][] can later be mapped to extra materials or work notes if needed.
    }

    // ------- HL · Handlauf materials (placeholder) -------
    if (offer === "hl") {
      // TODO: read HL form fields from `hl` and map to products with add(...)
      // Example (you must adapt keys + productIds):
      // const hlMainQty = Number(hl?.hlMainQty || 0) || 0;
      // if (hlMainQty > 0) {
      //   add('TODO_HL_MAIN', hlMainQty, null, null, null);
      // }
    }

    // ------- OPTIONALS as material lines (tagged so UI can filter them out of Material/Debug)
    try {
      const selections = collectSelections(payload); // [{productId, qty}]
      const isGrabId = (id) =>
        id === "CLPESG40" || id === "CLPESG60" || id === "CLPESG80";

      const optGrabTotal = selections
        .filter((s) => isGrabId(s.productId))
        .reduce((a, s) => a + (Number(s.qty) || 0), 0);

      const optCl40 = selections
        .filter((s) => s.productId === "CLPESG40")
        .reduce((a, s) => a + (Number(s.qty) || 0), 0);

      // 🔹 accumulate instead of overwrite
      grabTotalQty += optGrabTotal;
      cl40Qty += optCl40;

      for (const s of selections) {
        add(s.productId, s.qty, null, null, "optional");
      }
    } catch (e) {
      console.warn("[pricing] optional->materials failed:", e?.message || e);
    }

    // ------- Sonderduschabtrennung Hassmann (user-entered net price)
    // ------- Duschabtrennung Quick-Add (Hassmann) rows (Pendeltür, Gleittür, Falt-Pendeltür, Walk-In)
    try {
      const KIND_TO_LABEL = {
        PANDELTUER: "Pendeltür Hassmann",
        GLEITUR: "Gleittür Hassmann",
        FLATPANELTUER: "Falt-Pendeltür Hassmann",
        WALKIN_OHNE_TUER: "Walk-In Hassmann",
        SONDER: "Sonderduschabtrennung Hassmann",
      };

      const qa = payload?.duschabtrennung?.quickAdd || [];
      if (Array.isArray(qa) && qa.length) {
        for (const x of qa) {
          const qty = Number(x?.qty) || 0;
          const price = parseMoneyStrict(x?.price) || 0; // parses "1.099,00" etc.
          if (qty <= 0 || price <= 0) continue;

          const kindUp = String(x?.kind || "GEN").toUpperCase();
          const pid = String(x?.productId || "").trim() || `HASS_${kindUp}`;
          // For "Freier Posten" we already receive exact label via collector.
          const base =
            String(x?.label || "").trim() ||
            KIND_TO_LABEL[kindUp] ||
            "Duschabtrennung (Hassmann)";
          const label = `- ${qty} Stk ${base}`;

          add(pid, qty, label, price, null);
        }
      }
    } catch (e) {
      console.warn(
        "[pricing] quickAdd (Hassmann) merge failed:",
        e?.message || e,
      );
    }
    // OPTIONAL → Sonderprodukte quick-add
    try {
      const oq = payload?.optional?.quickAdd || [];
      if (Array.isArray(oq) && oq.length) {
        for (const x of oq) {
          const qty = Number(x?.qty) || 0;
          const price = parseMoneyStrict(x?.price) || 0;
          if (qty <= 0 || price <= 0) continue;

          const pid = String(x?.productId || "").trim() || "OPT_CUSTOM";
          const base = String(x?.label || "").trim() || "Sonderprodukt";
          const label = `- ${qty} Stk ${base}`;

          // subgroup null/undefined: follow your Optional pricing bucket
          add(pid, qty, label, price, "optional");
        }
      }
    } catch (e) {
      console.warn("[pricing] optional quick-add failed:", e);
    }

    // ------- Resolve names/prices once
    const productMap = await getProductsByIds([...idsNeeded]);

    const resolved = lines.map((l) => {
      const prod = productMap.get(l.id) || { price: 0, name: "" };

      let unit;
      if (l.perM2Base && prod.price) {
        unit = round2((Number(prod.price) || 0) / Number(l.perM2Base)); // €/m² from set
      } else if (Number.isFinite(l.unitOverride)) {
        unit = Number(l.unitOverride);
      } else {
        unit = Number(prod.price) || 0;
      }

      // 👇 special rule for Fußboden-Paneele
      if (l.id === "V5FB02") {
        unit = round2(unit / 8);
      }

      const displayName = (prod.name || "").trim() || l.id;
      const builtLabel = `- ${l.qty} Stk ${displayName}`;
      const label = l.label || builtLabel;

      // --- BWT: Einstiegshilfen (Haltegriffe) ---
      let lineTotal;
      if (offer === "bwt") {
        const pid = String(l.id || "").trim();
        const isBwtGrab =
          (pid === "CLPESG40" || pid === "CLPESG60" || pid === "CLPESG80") &&
          l.source !== "optional"; // only the BWT page "zusätzliche Einstiegshilfen", not global optionals

        if (isBwtGrab && markupPctForBwt > 0) {
          // unitPrice stays = DB price
          // lineTotal gets DB price * (1 + Aufschlag) * qty
          lineTotal = round2(unit * (1 + markupPctForBwt) * l.qty);
        } else {
          lineTotal = round2(unit * l.qty);
        }
      } else {
        // non-BWT: normal calculation
        lineTotal = round2(unit * l.qty);
      }

      return {
        productId: l.id,
        name: displayName,
        qty: l.qty,
        unitPrice: unit, // DB price (or overridden), unchanged for BWT
        lineTotal,
        label,
        source: l.source || null,
      };
    });

    const sum = round2(resolved.reduce((a, x) => a + (x.lineTotal || 0), 0));

    // Return grabCounts at materials-level; UI or computePrices can bubble it up
    return {
      title: getMaterialsTitle(offer),
      lines: resolved,
      sum,
      grabCounts: { cl40: cl40Qty, total: grabTotalQty },
    };
  }

  // Services (zones removed)
  function computeServiceCosts(payload) {
    const offer = getActiveOffer(payload);
    const b = payload?.Kundendaten || {};
    const arbeits = payload?.Arbeitszeit || {};

    const payer =
      b.payer === "Kassenkunde" ? "KK" : b.payer === "Selbstzahler" ? "SZ" : "";

    // NEW: distance from Arbeitszeit, fallback to Kundendaten
    const oneWayKm = Number(arbeits.distanceKm ?? b.distanceKm ?? 0) || 0;
    const roundTripKm = Math.max(0, oneWayKm * 2);

    // NEW: hours from Arbeitszeit, fallback to old Kundendaten keys
    const total_hours_numeric =
      Number(b.totalHoursNumeric ?? arbeits.totalHoursNumeric ?? 0) || 0;

    const total_hours_HH_mm =
      String(arbeits.totalHoursHHMM ?? b.totalHoursHHMM ?? "") || "";

    const reise_hours_numeric =
      Number(arbeits.ReiseHoursNumeric ?? b.ReiseHoursNumeric ?? 0) || 0;

    const Arbeitszeit_hours_numeric =
      Number(arbeits.ArbeitHoursNumeric ?? b.ArbeitHoursNumeric ?? 0) || 0;

    const laborHours = Arbeitszeit_hours_numeric;

    const handwerkerCount = 2;
    const laborRateKK = 69.5;
    const laborRateSZ = 59.5;
    const kmRate = 0.35;
    const sitz_reise_Rate = 25;

    const fahrzeugbereitstellung = 80.0;
    const werkzeug = 7.5;
    const beraeumung = 4.5;
    const kilometerpauschale = round2(roundTripKm * kmRate);
    const laborRate =
      payer === "KK" ? laborRateKK : payer === "SZ" ? laborRateSZ : 0;

    const facharbeiter =
      Arbeitszeit_hours_numeric * handwerkerCount * laborRate +
      reise_hours_numeric * (laborRate + sitz_reise_Rate);

    const lines = [];
    lines.push({
      key: "fahrzeug",
      label: "- 1,00 Stk Fahrzeugbereitstellung",
      amount: round2(fahrzeugbereitstellung),
    });
    lines.push({
      key: "werkzeuge",
      label:
        "- 1,00 Stk Bereitstellung und Vorhaltung von Maschinen & Werkzeugen",
      amount: round2(werkzeug),
    });
    lines.push({
      key: "beraeumung",
      label: "- 1,00 Stk Beräumung der Baustelle",
      amount: round2(beraeumung),
    });
    if (roundTripKm > 0) {
      lines.push({
        key: "kilometer",
        label: `- ${roundTripKm} km Kilometerpauschale `,
        amount: kilometerpauschale,
      });
    }
    if (total_hours_numeric > 0 && laborRate > 0) {
      lines.push({
        key: "facharbeiter",
        label: `- ${total_hours_HH_mm} (${total_hours_numeric}) Std × ${handwerkerCount} Facharbeiter × ${laborRate.toFixed(
          2,
        )} €`,
        amount: facharbeiter,
        docxHide: true,
      });
    }
    let extraAufgabeAmount = 0;

    // Extra Arbeitszeit: nur für BWT-Angebote berücksichtigen
    let extraHours = 0;
    if (offer === "bwt") {
      extraHours = Number(arbeits.extraHoursTotal ?? 0) || 0;

      if (extraHours > 0 && laborRate > 0) {
        const extraAmount = round2(extraHours * handwerkerCount * laborRate);
        extraAufgabeAmount = extraAmount; // 🔹 remember for Zwischensumme

        lines.push({
          key: "extraAufgabe",
          label: "- extra Aufgabe",
          amount: extraAmount,
        });
      }
    }

    // Work notes unchanged
    try {
      const notes = computeWorkNotes(payload);
      for (const n of notes) lines.push(n);
    } catch (e) {
      console.warn("[pricing] computeWorkNotes failed:", e?.message || e);
    }

    const posTitle = "Auszuführende Arbeiten";
    const sum = round2(lines.reduce((a, x) => a + (x.amount || 0), 0));
    return {
      title: posTitle,
      lines,
      sum,
      payer,
      zoneLabel: "",
      distanceKm: roundTripKm,
      laborHours,
      laborRate,
      extraAufgabeAmount,
    };
  }

  // --- BWT: "Enthält je Einheit" rows, with real prices from DB ---
  async function computeBwtIncludedLines(payload) {
    const offer = getActiveOffer(payload);
    if (offer !== "bwt") return [];

    const b = payload?.Arbeitszeit || {};
    const bwt = payload?.bwt || {};

    // distance (same logic as in computeServiceCosts)
    const oneWayKm = Number(b.distanceKm || 0) || 0;
    const roundTripKm = Math.max(0, oneWayKm * 2);
    const billedKm = Math.max(0, roundTripKm - 200); // only km > 200 are billed
    const kmRate = 0.35;
    const kmAmount = round2(billedKm * kmRate);

    const reise_hours_numeric = Number(b.ReiseHoursNumeric ?? 0) || 0;

    // Reisezeit for bwt
    const bwt_reise_Rate = 35;
    const bwt_handwerkerCount = 2;
    const billed_reise_zeit = Math.max(0, reise_hours_numeric - 2);
    const reise_ampunt_zeit = round2(
      billed_reise_zeit * bwt_reise_Rate * bwt_handwerkerCount,
    );

    const bwt_reise_amount = reise_ampunt_zeit + kmAmount;

    console.log("reise_hours_numeric ", reise_hours_numeric);
    console.log("billed_reise_zeit ", billed_reise_zeit);
    console.log("reise_ampunt_zeit ", reise_ampunt_zeit);
    console.log("kmAmount ", kmAmount);

    // door quantity: sum of ALL BWT door variants, only real qty > 0
    const rawDoorQty =
      (Number(bwt?.bwtDoorStdQty || 0) || 0) +
      (Number(bwt?.bwtDoorBudgetQty || 0) || 0) +
      (Number(bwt?.bwtDoorIndWienGlasQty || 0) || 0) +
      (Number(bwt?.bwtDoorVariodoorQty || 0) || 0) +
      (Number(bwt?.bwtDoorIndWienQty || 0) || 0);

    const doorQty = rawDoorQty > 0 ? rawDoorQty : 0;
    const hasDoor = doorQty > 0;

    const out = [];

    // 1) Kilometerpauschale (already reduced to >200km)
    if (bwt_reise_amount > 0) {
      out.push({
        key: "bwt_km",
        label: `- ${roundTripKm} km Kilometerpauschale + Reisezeit`,
        qty: 1,
        unitPrice: bwt_reise_amount,
        lineTotal: bwt_reise_amount,
      });
    }

    // If no door selected (qty 0 or no type), skip Lieferkosten / Tür / Kleinmaterial
    if (!hasDoor) {
      return out;
    }

    const qtyStr = doorQty.toFixed(2).replace(/\.00$/, "");

    // fetch unit prices for Lieferkosten + Kleinmaterial
    const ids = ["140322", "KM02"];
    const map = await getProductsByIds(ids);

    const lieferPrice = Number(map.get("140322")?.price || 0);
    const kleinPrice = Number(map.get("KM02")?.price || 0);

    // 2) Lieferkosten Badewannentür (real price from DB)
    if (lieferPrice > 0) {
      out.push({
        key: "140322",
        label: `- ${qtyStr} Stk Lieferkosten Badewannentür`,
        qty: doorQty,
        unitPrice: lieferPrice,
        lineTotal: round2(lieferPrice * doorQty),
      });
    }

    // 3) Universal / Standard Tür (price forced to 0 here – already counted in materials)
    // --- which door variants are selected? ---
    const DOOR_VARIANTS = [
      { key: "bwtDoorStdQty", label: "Universal / Standard Tür" },
      { key: "bwtDoorBudgetQty", label: "Budget Tür" },
      { key: "bwtDoorIndWienGlasQty", label: "Individuelle Tür Wien Glas" },
      { key: "bwtDoorVariodoorQty", label: "Variodoor" },
      { key: "bwtDoorIndWienQty", label: "Individuelle Tür Wien" },
    ];

    const doorLabelParts = [];
    for (const v of DOOR_VARIANTS) {
      const q = Number(bwt?.[v.key] || 0) || 0;
      if (q > 0) doorLabelParts.push(v.label);
    }

    let doorLabelText = "Badewannentür";
    if (doorLabelParts.length === 1) {
      doorLabelText = doorLabelParts[0];
    } else if (doorLabelParts.length > 1) {
      doorLabelText = doorLabelParts.join(", ");
    }

    // 3) Tür (price forced to 0 here – already counted in materials)
    out.push({
      key: "",
      label: `- ${qtyStr} Stk ${doorLabelText}`,
      qty: doorQty,
      unitPrice: 0,
      lineTotal: 0,
    });

    // 4) Kleinmaterial (real price from DB)
    if (kleinPrice > 0) {
      out.push({
        key: "km02",
        label: `- ${qtyStr} Stk Kleinmaterial`,
        qty: doorQty,
        unitPrice: kleinPrice,
        lineTotal: round2(kleinPrice * doorQty),
      });
    }

    return out;
  }

  return {
    computePrices: async (payload) => {
      const selections = collectSelections(payload);
      const ids = [...new Set(selections.map((s) => s.productId))];
      const productMap = await getProductsByIds(ids);

      const items = selections.map((s) => {
        const prod = productMap.get(s.productId) || { price: 0 };
        const unit = prod.price;
        const qty = s.qty || 1;
        return {
          productId: s.productId,
          qty,
          unitPrice: unit,
          lineTotal: round2(unit * qty),
        };
      });

      let materials = { title: "", lines: [], sum: 0 };
      try {
        materials = await computeMaterials(payload);
      } catch (e) {
        console.error("[pricing] computeMaterials failed:", e);
      }

      let services = {
        title: "",
        lines: [],
        sum: 0,
        payer: "",
        zoneLabel: "",
        distanceKm: 0,
        laborHours: 0,
        laborRate: 0,
      };
      try {
        services = computeServiceCosts(payload) || services;
      } catch (e) {
        console.error("[pricing] computeServiceCosts failed:", e);
      }
      const originalServicesSum = Number(services?.sum || 0);
      // figure out active offer here
      const offer =
        payload?.activeOffer ||
        payload?.currentOfferKey ||
        payload?.offerType ||
        "bu";

      // --- BWT: Enthält-je-Einheit rows with real prices ---
      let bwtIncludedDisplayUI = [];
      if (offer === "bwt") {
        try {
          bwtIncludedDisplayUI = await computeBwtIncludedLines(payload);
        } catch (e) {
          console.error("[pricing] computeBwtIncludedLines failed:", e);
        }
      }

      // --- BWT: Summe Leistungen aus den 4 BWT-Zeilen + Extra Arbeitszeit ---
      let bwtLeistungenSum = 0;
      if (
        offer === "bwt" &&
        Array.isArray(bwtIncludedDisplayUI) &&
        bwtIncludedDisplayUI.length
      ) {
        bwtLeistungenSum = round2(
          bwtIncludedDisplayUI.reduce(
            (acc, row) => acc + (Number(row.lineTotal) || 0),
            0,
          ),
        );

        // Extra Arbeitszeit from Arbeitszeit page (computed in computeServiceCosts)
        const extraAufgabe = Number(services?.extraAufgabeAmount || 0);

        // For BWT: base BWT-Leistungen + Extra Arbeitszeit
        const bwtServicesTotal = round2(bwtLeistungenSum + extraAufgabe);

        services.sum = bwtServicesTotal;
      }

      // --- add the selected Duschwanne (from smart search) as a material line ---
      let selectedTray = null;

      try {
        const pid = payload?.duschwanne?.chosenTrayProductId;
        const sizeLabel = (payload?.duschwanne?.traySize || "").trim();

        if (pid) {
          const already = (materials?.lines || []).some(
            (l) => l?.productId === pid || l?.id === pid,
          );

          if (!already) {
            const p = await ProductModel.findOne({ productId: pid }).lean();
            if (p) {
              const unit = Number(p.price || 0);
              const qty = 1; // ← add this
              const line = {
                productId: p.productId,
                name: p.name || "",
                qty,
                unitPrice: unit,
                lineTotal: round2(unit * qty),
                label: sizeLabel
                  ? `- ${qty} Stk Duschwanne ${sizeLabel}`
                  : `- ${qty} Stk Duschwanne`,
              };
              materials.lines.push(line);
              materials.sum = round2((materials.sum || 0) + line.lineTotal);

              selectedTray = {
                productId: p.productId,
                name: p.name || "",
                sizeLabel,
                unitPrice: unit,
              };
            }
          }
        }
      } catch (e) {
        console.warn("[pricing] addSelectedTrayLine failed:", e?.message || e);
      }

      // ----- UI/DOCX display adjustments for Haltegriff-Bonus (presentation only) -----
      // ---- HALTEGRIFF + DISPLAY PREP ----
      const grabCounts = materials?.grabCounts || { cl40: 0, total: 0 };
      const bonusHG = !!payload?.rabatt?.bonusGrab;

      // Split materials into non-optional (for UI) and all (for DOCX)
      const allMatLines = Array.isArray(materials?.lines)
        ? materials.lines.map((x) => ({ ...x }))
        : [];
      const optLines = allMatLines.filter((l) => l.source === "optional");
      const nonOptLines = allMatLines.filter((l) => l.source !== "optional");

      // Sums
      const optSum = optLines.reduce(
        (a, x) => a + (Number(x.lineTotal) || 0),
        0,
      );
      const nonOptSum = (materials?.sum || 0) - optSum;

      // --- UI MATERIALS: show ONLY non-optional under “Material für Badumbau”
      const uiMaterials = nonOptLines.map((x) => ({ ...x }));
      // --- UI OPTIONALS: show ONLY optional under “Additional gewählte Produkte”
      const uiOptionals = optLines.map((x) => ({ ...x }));

      // --- DOCX MATERIALS: include everything (business rule)
      const docxMaterials = allMatLines.map((x) => ({ ...x }));

      // --- SERVICES display copies
      const uiServices = (services?.lines || []).map((x) => ({ ...x }));
      const docxServices = (services?.lines || []).map((x) => ({ ...x }));

      // ===== Apply bonus presentation rules =====
      const ONLY_ONE_CL40 = grabCounts.total === 1 && grabCounts.cl40 === 1;

      // Helper: decrement CLPESG40 qty by exactly 1 across an array (remove if qty -> 0)
      function decOneCL40(arr, { removeIfZero }) {
        let left = 1;
        for (let i = 0; i < arr.length && left > 0; i++) {
          const l = arr[i];
          const pid = l.productId || l.id;
          if (pid === "CLPESG40") {
            const q = Number(l.qty || 0);
            if (q > 0) {
              const newQ = Math.max(0, q - left);
              left = Math.max(0, left - q);
              l.qty = newQ;
              // recompute lineTotal for display only (prices NEVER used from these lists)
              l.lineTotal =
                Math.round(
                  (Number(l.unitPrice || 0) * newQ + Number.EPSILON) * 100,
                ) / 100;
              if (removeIfZero && newQ === 0) {
                arr.splice(i, 1);
                i--;
              }
            }
          }
        }
      }

      // UI rules
      if (bonusHG && grabCounts.cl40 > 0) {
        // Multiple grab bars: show CLPESG40 as qty-1 in Optional UI
        setCL40LabelToBillable(uiOptionals, { hideWhenZero: false }); // show "0 Stk ..." in UI
        // Particular case: single CLPESG40 and no other grab bars → hide the worknote in UI (to mirror DOCX behavior)
        if (ONLY_ONE_CL40) {
          const GRAB_NOTE = "Anbringen zusätzlicher Haltegriffe";
          const uiNoteIdx = uiServices.findIndex((s) =>
            (s.label || "").includes(GRAB_NOTE),
          );
          if (uiNoteIdx >= 0) uiServices.splice(uiNoteIdx, 1);
        }
      }

      // DOCX rules
      if (bonusHG && grabCounts.cl40 > 0) {
        if (ONLY_ONE_CL40) {
          // Single CLPESG40 → hide it completely in DOCX materials
          const idx = docxMaterials.findIndex(
            (l) => (l.productId || l.id) === "CLPESG40",
          );
          if (idx >= 0) docxMaterials.splice(idx, 1);
          // Remove the worknote line from DOCX services
          const GRAB_NOTE = "Anbringen zusätzlicher Haltegriffe";
          const dn = docxServices.findIndex((s) =>
            (s.label || "").includes(GRAB_NOTE),
          );
          if (dn >= 0) docxServices.splice(dn, 1);
        } else {
          // Multiple → decrement one from DOCX
          setCL40LabelToBillable(docxMaterials, { hideWhenZero: true }); // hide when 0 in PDF
        }
      }

      // Pack adjusted displays (presentation only; totals remain from server truth)
      const materialsDisplayUI = {
        title: materials.title,
        sum: nonOptSum,
        lines: uiMaterials,
      };
      const optionalDisplayUI = { sum: optSum, lines: uiOptionals };
      const materialsDisplayDocx = {
        title: materials.title,
        lines: docxMaterials,
      };
      const servicesDisplayUI = { ...services, lines: uiServices };
      const servicesDisplayDocx = { ...services, lines: docxServices };

      //const productsSubtotal = round2((items || []).reduce((sum, i) => sum + (i?.lineTotal || 0), 0) +(materials?.sum ?? 0));
      const productsSubtotal = round2(Number(materials?.sum || 0));

      // Extract and enforce markup rules
      let markupPct = extractMarkupPct(payload);
      const payer = payload?.Kundendaten?.payer || "";
      // Bonus checkboxes in Rabatt Menu --
      const flags = {
        bonus_neu: !!payload?.rabatt?.bonus300,
        bonus_Haltegriff: !!payload?.rabatt?.bonusGrab,
      };

      // NEW: rebuild markup from material lines with the two exceptions
      const lines = Array.isArray(materials?.lines) ? materials.lines : [];
      let markupBase = 0;

      if (offer !== "bwt") {
        // Normal BU/HL-Markup-Logik
        for (const row of lines) {
          const id = String(row?.productId || row?.id || "").trim();
          const qty = Number(row?.qty ?? row?.quantity ?? 0) || 0;
          const unitPrice = Number(row?.unitPrice ?? 0) || 0;

          if (!qty || !unitPrice) continue;

          // 1) skip Kleinmaterial (added as KM02 when the checkbox is on)
          if (id === "KM02") continue;

          // 2) if Haltegriff bonus is active, one CLPESG40 is free for markup purposes
          // if (id === 'CLPESG40' && flags?.bonus_Haltegriff === true) {
          // const effectiveQty = Math.max(qty - 1, 0);
          // if (effectiveQty > 0) markupBase += effectiveQty * unitPrice;
          // continue;
          // }

          // default: count full qty
          markupBase += qty * unitPrice;
        }
      } else {
        // BWT: kein Aufschlag
        markupPct = 0;
        markupBase = 0;
      }

      // Final markup using the existing percentage
      const markup =
        offer === "bwt" ? 0 : round2(markupBase * (markupPct || 0));

      // Nettobetrag
      const baseSubtotal = round2(
        productsSubtotal + (services?.sum ?? 0) + markup,
      );
      const baseVat = round2(baseSubtotal * TAX_RATE);
      const base_total = round2(baseSubtotal + baseVat);
      // --- Rabatt on MATERIAL only (percent from payload.rabatt.materialDiscountPct) ---
      const materialPct = Number(payload?.rabatt?.materialDiscountPct || 0); // 0..0.09
      const rabattAmount = round2((productsSubtotal || 0) * materialPct);

      // VAT is applied AFTER discount on net amount:
      const netAfterRabatt = round2((baseSubtotal || 0) - rabattAmount);

      //  show material + aufschlag in angebote file

      //const Vat_on_net_AfterDiscount = round2(netAfterDiscount * TAX_RATE);
      const totalAfterRabatt = round2(netAfterRabatt * (1 + TAX_RATE));

      // If you want a threshold for the 300 € (e.g., only if totalAfterRabatt ≥ 3000), add it here:
      let bonusGross = 0;
      let bonus_neu = 0;
      if (flags.bonus_neu) {
        bonusGross += 252.1;
        bonus_neu += 252.1;
      }
      if (flags.bonus_Haltegriff) {
        // Use actual net unit price of CLPESG40 (one piece free)
        const cl40 = (materials?.lines || []).find(
          (l) => (l.productId || l.id) === "CLPESG40",
        );
        const cl40Unit = Number(cl40?.unitPrice) || 0;
        bonusGross += round2(cl40Unit);
      }

      const netAfterRabatt_and_Bonus = round2(
        Math.max(0, netAfterRabatt - bonusGross),
      );
      // material and aufschlag but without neu bonus if exist
      const material_plus_aufschlag =
        netAfterRabatt_and_Bonus - (services?.sum ?? 0) + bonus_neu;
      const material_afterRabatt_and_aufschlag =
        netAfterRabatt_and_Bonus - (services?.sum ?? 0) - markup;

      const vatOnNet = round2((netAfterRabatt_and_Bonus || 0) * TAX_RATE);
      const total = round2((netAfterRabatt_and_Bonus || 0) + vatOnNet);

      // -------- NEW: Zuschuss/Selbstkostenanteil --------
      const b = payload?.Kundendaten || {};

      // Accept string or array; pick the first non-empty if it's an array
      const rawOptionSrc =
        b?.budgetOption ?? b?.budgetOptionsPanel ?? b?.budgetOptions ?? "";
      const rawOption = Array.isArray(rawOptionSrc)
        ? rawOptionSrc.find((v) => v != null && String(v).trim() !== "") || ""
        : rawOptionSrc;

      // Canonicalize: underscores->spaces, collapse whitespace, uppercase
      const option = String(rawOption)
        .toUpperCase()
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      // Copay from any field you might use
      const zuzahlungRaw =
        Number(b?.zuzahlung ?? b?.copay ?? b?.copayAmount ?? 0) || 0;
      const prior = Number(b?.wohnumfeld?.amount) || 0;
      let subsidyAmount = 0;
      let subsidyAmount_max = 0; // changed if prior different from 0
      switch (option) {
        case "4180 MAXIMAL":
        case "MAX_4180":
        case "4180_MAXIMAL":
        case "MAXIMAL_4180":
          subsidyAmount = 4180;
          break;

        case "4180 MIT ZUZAHLUNG":
        case "KUNDE_MIT_ZUZAHLUNG":
        case "4180_KUNDE_MIT_ZUZAHLUNG":
        case "ZUSZAHLUNG_CA":
          //  subsidyAmount = 4180 - Math.max(0, zuzahlungRaw);
          subsidyAmount = 4180;
          break;

        case "ZWEI PERSONEN MIT PFLEGEGRAD":
        case "ZWEI_PERSONEN_8360":
        case "2_PERSONEN_MIT_PFLEGEGRAD":
        case "8360_ZWEI_PERSONEN":
          subsidyAmount = 8360;
          break;

        default:
          subsidyAmount = 0;
      }
      subsidyAmount_max = subsidyAmount;
      // subtract prior Wohnumfeld amount (KK only)

      if (payer === "Kassenkunde" && b?.wohnumfeld?.done) {
        // prevent negative subsidy

        subsidyAmount_max = Math.max(0, subsidyAmount - Math.max(0, prior)); //   // we substract prior (wohnumfeldAmount ) if exist from money help pfelegebudget
      }

      const selfPayAmount = round2(
        Math.max(0, Number(total) - Number(subsidyAmount_max)),
      );

      return {
        // before discount:
        items,
        materials,
        productsSubtotal,
        services,
        Nettobetrag: baseSubtotal,
        markupPct,
        markup,
        vatOnNet,
        total,
        netAfterRabatt_and_Bonus,

        // values after discount
        netAfterRabatt,
        materialDiscountPct: materialPct, // for the slider label in UI
        rabattAmount,
        totalAfterRabatt,
        baseVat,
        base_total,

        // rabatt + bonus:
        bonusGross,
        bonusFlags: flags,
        flags: flags,

        // NEW: Zuschuss/Selbstkostenanteil for UI + DOCX
        subsidyKind: option,
        subsidyInput: Math.max(0, zuzahlungRaw),
        subsidyAmount, // money help pfelegebudget
        prior, //  wohnumfeldAmount
        subsidyAmount_max,
        selfPayAmount,
        selectedTray,

        // NEW display-only blocks
        grabCounts,

        // presentation-only copies
        materialsDisplayUI,
        optionalDisplayUI,
        servicesDisplayUI,

        materialsDisplayDocx,
        servicesDisplayDocx,

        // Produkte + Material in kosten-details
        material_afterRabatt_and_aufschlag,
        // BWT-only helper for "Enthält je Einheit"
        bwtIncludedDisplayUI,

        // BU we show in the angebote this amount instead of pure material
        material_plus_aufschlag,
      };
    },
  };
};
