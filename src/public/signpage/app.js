/* Signing page controller. Served at /sign/<token>, assets under /signpage/.
   Each document is fetched as a self-contained interactive HTML fragment
   (checkboxes + signature pad + submit are INSIDE the document) and injected
   into #docContainer. This controller only wires those inline controls. */
(function () {
  "use strict";

  var token = decodeURIComponent(
    (window.location.pathname.split("/sign/")[1] || "").replace(/\/+$/, ""),
  );

  function el(id) { return document.getElementById(id); }
  var loading = el("loading");
  var fatal = el("fatal");
  var app = el("app");
  var container = el("docContainer");

  var state = { docs: [], index: 0, maxIndex: 0 };
  var primarySig = null; // signature pad controller for #sigCanvas
  var secondarySig = null; // signature pad controller for #sigCanvas2 (Bevollmächtigte/r), if present
  // In-memory only (module scope, reset on page load) so "Kopieren" on this
  // page/customer session can never leak into another customer's session.
  var copiedSignature = null;

  function showFatal(msg) {
    loading.classList.add("hidden");
    app.classList.add("hidden");
    fatal.classList.remove("hidden");
    fatal.textContent = msg;
  }

  function api(path, opts) {
    return fetch("/api/signing/" + path, opts).then(function (r) {
      return r.json().then(function (body) {
        if (!r.ok) throw new Error(body && body.error ? body.error : "Fehler");
        return body;
      });
    });
  }

  function start() {
    if (!token) return showFatal("Ungültiger Link.");
    api(token)
      .then(function (data) {
        state.docs = (data.documents || []).slice();
        loading.classList.add("hidden");
        app.classList.remove("hidden");
        if (data.completed) return showDone();
        state.index = 0;
        while (state.index < state.docs.length && state.docs[state.index].status === "signed") state.index++;
        if (state.index >= state.docs.length) return showDone();
        state.maxIndex = state.index;
        renderStep();
      })
      .catch(function (e) { showFatal(e.message || "Der Link ist ungültig oder abgelaufen."); });
  }

  function updateNav() {
    var nav = el("docNav");
    if (!nav) return;
    if (state.docs.length <= 1) { nav.classList.add("hidden"); return; }
    nav.classList.remove("hidden");
    el("prevDoc").disabled = state.index <= 0;
    el("nextDoc").disabled = state.index >= state.maxIndex;
  }

  function goToDoc(i) {
    if (i < 0 || i > state.maxIndex || i >= state.docs.length || i === state.index) return;
    state.index = i;
    renderStep();
  }

  function renderStep() {
    var doc = state.docs[state.index];
    el("progress").textContent = "Dokument " + (state.index + 1) + " von " + state.docs.length;
    updateNav();
    container.innerHTML = "<p>Dokument wird geladen …</p>";
    fetch("/api/signing/" + token + "/documents/" + doc.key + "/html")
      .then(function (r) { return r.text(); })
      .then(function (html) {
        container.innerHTML = html;
        wireControls();
        window.scrollTo(0, 0);
      })
      .catch(function () { container.innerHTML = "<p>Dokument konnte nicht geladen werden.</p>"; });
  }

  // ---- signature canvas (built on the injected #sigCanvas) ----
  function setupCanvas(canvas) {
    var ctx = canvas.getContext("2d");
    var drawing = false, dirty = false, last = null;

    function resize() {
      var ratio = window.devicePixelRatio || 1;
      var rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      var data = dirty ? canvas.toDataURL() : null;
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#111";
      if (data) {
        var img = new Image();
        img.onload = function () { ctx.drawImage(img, 0, 0, rect.width, rect.height); };
        img.src = data;
      }
    }
    function pos(e) {
      var rect = canvas.getBoundingClientRect();
      var t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    function down(e) { drawing = true; last = pos(e); e.preventDefault(); }
    function move(e) {
      if (!drawing) return;
      var p = pos(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p; dirty = true; e.preventDefault();
    }
    function up() { drawing = false; }

    canvas.addEventListener("mousedown", down);
    canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    canvas.addEventListener("touchstart", down, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", up);
    resize();

    return {
      clear: function () { ctx.clearRect(0, 0, canvas.width, canvas.height); dirty = false; },
      refit: function () { if (!dirty) resize(); },
      isDirty: function () { return dirty; },
      toPng: function () { return canvas.toDataURL("image/png"); },
      setFromDataUrl: function (dataUrl) {
        var rect = canvas.getBoundingClientRect();
        var img = new Image();
        img.onload = function () {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, rect.width, rect.height);
          dirty = true;
        };
        img.src = dataUrl;
      },
    };
  }

  function typedNameToPng(name) {
    var c = document.createElement("canvas");
    c.width = 600; c.height = 160;
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#111";
    ctx.font = "48px 'Segoe Script', 'Comic Sans MS', cursive";
    ctx.textBaseline = "middle";
    ctx.fillText(name, 20, 80);
    return c.toDataURL("image/png");
  }

  // Convert an uploaded image file into a normalized PNG data URL. Large phone
  // photos are downscaled (max 800px wide) so the request stays well under the
  // 10mb server limit. Calls cb(dataUrl) on success or cb(null, errorMsg).
  function fileToSignaturePng(file, cb) {
    if (!file || !/^image\//.test(file.type)) {
      return cb(null, "Bitte wählen Sie eine Bilddatei (JPG oder PNG).");
    }
    if (file.size > 10 * 1024 * 1024) {
      return cb(null, "Die Datei ist zu groß (max. 10 MB).");
    }
    var reader = new FileReader();
    reader.onerror = function () { cb(null, "Die Datei konnte nicht gelesen werden."); };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () { cb(null, "Das Bild konnte nicht geladen werden."); };
      img.onload = function () {
        var maxW = 800;
        var scale = img.width > maxW ? maxW / img.width : 1;
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        var ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, c.width, c.height);
        cb(c.toDataURL("image/png"));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  // Wires one signature pad (canvas + clear/type/upload controls) identified
  // by id suffix ("" for the primary pad, "2" for a second, independent pad
  // e.g. the Bevollmächtigte/r signature on the Zusatzblatt). Returns null if
  // the document fragment doesn't have a canvas for this suffix.
  function makeSigBlock(suffix) {
    var canvas = el("sigCanvas" + suffix);
    if (!canvas) return null;

    var pad = setupCanvas(canvas);
    requestAnimationFrame(function () { pad.refit(); });
    var uploaded = null;

    function resetUpload() {
      uploaded = null;
      var up = el("sigUpload" + suffix);
      if (up) up.value = "";
      var pv = el("sigPreview" + suffix);
      if (pv) { pv.removeAttribute("src"); pv.classList.add("hidden"); }
    }

    var clearBtn = el("clearSig" + suffix);
    if (clearBtn) clearBtn.addEventListener("click", function () {
      var tw = el("typeWrap" + suffix);
      var uw = el("uploadWrap" + suffix);
      if (uw && !uw.classList.contains("hidden")) { resetUpload(); }
      else if (tw && !tw.classList.contains("hidden")) { el("typeName" + suffix).value = ""; }
      else pad.clear();
    });

    var toggle = el("toggleType" + suffix);
    if (toggle) toggle.addEventListener("click", function () {
      var w = el("typeWrap" + suffix);
      var hidden = w.classList.toggle("hidden");
      this.textContent = hidden ? "Namen tippen statt zeichnen" : "Doch lieber zeichnen";
      // Typing and uploading are mutually exclusive.
      if (!hidden) {
        var uw = el("uploadWrap" + suffix);
        if (uw) uw.classList.add("hidden");
        var ub = el("toggleUpload" + suffix);
        if (ub) ub.textContent = "Bild hochladen";
      }
    });

    var uploadToggle = el("toggleUpload" + suffix);
    if (uploadToggle) uploadToggle.addEventListener("click", function () {
      var uw = el("uploadWrap" + suffix);
      var hidden = uw.classList.toggle("hidden");
      this.textContent = hidden ? "Bild hochladen" : "Doch lieber zeichnen";
      // Uploading and typing are mutually exclusive.
      if (!hidden) {
        var tw = el("typeWrap" + suffix);
        if (tw) tw.classList.add("hidden");
        var tb = el("toggleType" + suffix);
        if (tb) tb.textContent = "Namen tippen statt zeichnen";
      }
    });

    var uploadInput = el("sigUpload" + suffix);
    if (uploadInput) uploadInput.addEventListener("change", function () {
      var box = el("docError");
      if (box) box.classList.add("hidden");
      var file = this.files && this.files[0];
      if (!file) { resetUpload(); return; }
      fileToSignaturePng(file, function (dataUrl, err) {
        if (err) { resetUpload(); return showDocError(err); }
        uploaded = dataUrl;
        var pv = el("sigPreview" + suffix);
        if (pv) { pv.src = dataUrl; pv.classList.remove("hidden"); }
      });
    });

    function isFilled() {
      var tw = el("typeWrap" + suffix);
      var uw = el("uploadWrap" + suffix);
      if (uw && !uw.classList.contains("hidden")) return !!uploaded;
      if (tw && !tw.classList.contains("hidden")) return !!(el("typeName" + suffix).value || "").trim();
      return pad.isDirty();
    }
    function toPng() {
      var tw = el("typeWrap" + suffix);
      var uw = el("uploadWrap" + suffix);
      if (uw && !uw.classList.contains("hidden")) return uploaded;
      if (tw && !tw.classList.contains("hidden")) return typedNameToPng((el("typeName" + suffix).value || "").trim());
      return pad.toPng();
    }

    function flash(btn, text) {
      var orig = btn.textContent;
      btn.textContent = text;
      setTimeout(function () { btn.textContent = orig; }, 1200);
    }

    var copyBtn = el("copySig" + suffix);
    if (copyBtn) copyBtn.addEventListener("click", function () {
      var box = el("docError");
      if (box) box.classList.add("hidden");
      if (!isFilled()) return showDocError("Bitte zuerst unterschreiben, bevor Sie kopieren.");
      copiedSignature = toPng();
      flash(copyBtn, "Kopiert!");
    });

    var pasteBtn = el("pasteSig" + suffix);
    if (pasteBtn) pasteBtn.addEventListener("click", function () {
      var box = el("docError");
      if (box) box.classList.add("hidden");
      if (!copiedSignature) return showDocError("Es wurde noch keine Unterschrift kopiert.");
      // Paste always lands in the draw pad, regardless of source mode.
      var tw = el("typeWrap" + suffix);
      var uw = el("uploadWrap" + suffix);
      if (tw) tw.classList.add("hidden");
      if (uw) uw.classList.add("hidden");
      var tb = el("toggleType" + suffix);
      if (tb) tb.textContent = "Namen tippen statt zeichnen";
      var ub = el("toggleUpload" + suffix);
      if (ub) ub.textContent = "Bild hochladen";
      pad.setFromDataUrl(copiedSignature);
      flash(pasteBtn, "Eingefügt!");
    });

    return { isFilled: isFilled, toPng: toPng };
  }

  function wireControls() {
    primarySig = makeSigBlock("");
    secondarySig = makeSigBlock("2");

    // Per-section edit toggle: unlock/lock that section's fields.
    container.querySelectorAll(".edit-toggle").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sec = btn.closest(".editsec") || container;
        var inputs = sec.querySelectorAll('[data-edit-field], input[name="pflegegrad"]');
        var editing = btn.getAttribute("data-editing") !== "1";
        inputs.forEach(function (i) { i.disabled = !editing; });
        btn.setAttribute("data-editing", editing ? "1" : "0");
        btn.textContent = editing ? "✓ Fertig" : "✎ Bearbeiten";
      });
    });

    var submit = el("submitBtn");
    if (submit) submit.addEventListener("click", submitCurrent);
  }

  function selectedPaymentIdx() {
    var checked = container.querySelector('input[name="paymentTerm"]:checked');
    return checked ? Number(checked.value) : -1;
  }

  function showDocError(msg) {
    var box = el("docError");
    if (box) { box.textContent = msg; box.classList.remove("hidden"); }
  }

  function submitCurrent() {
    var doc = state.docs[state.index];
    var box = el("docError");
    if (box) box.classList.add("hidden");

    var extraFields = {};
    if (container.querySelector('input[name="paymentTerm"]')) {
      var payIdx = selectedPaymentIdx();
      if (payIdx < 0) return showDocError("Bitte wählen Sie eine Zahlungsbedingung aus.");
      extraFields.paymentTermIdx = payIdx;
    }
    var entl = el("entlastungCheckbox");
    if (entl) extraFields.entlastungsguthaben = entl.checked;
    var budgetWuM = el("budgetWuMCheckbox");
    if (budgetWuM) extraFields.budgetWuM = budgetWuM.checked;
    var rechnungPost = el("rechnungPostCheckbox");
    if (rechnungPost) extraFields.rechnungPost = rechnungPost.checked;
    var rechnungEmail = el("rechnungEmailCheckbox");
    if (rechnungEmail) extraFields.rechnungEmail = rechnungEmail.checked;

    // Collect any customer-corrected fields (editable-on-button sections).
    var editedFields = {};
    container.querySelectorAll("[data-edit-field]").forEach(function (inp) {
      editedFields[inp.getAttribute("data-edit-field")] = (inp.value || "").trim();
    });
    var pg = container.querySelector('input[name="pflegegrad"]:checked');
    if (pg) editedFields.pflegegrad = pg.value;

    // Vollmacht/Abtretungserklärung: every field shown on the document is
    // mandatory (mirrored server-side in routes/signing.js, which is the
    // authoritative check — this is just for immediate feedback).
    var REQUIRED_FIELDS_BY_KEY = {
      vollmacht: [
        ["lastName", "Nachname"], ["firstName", "Vorname"], ["street", "Straße"],
        ["postalCode", "PLZ"], ["city", "Ort"], ["phone", "Telefon"],
        ["geburtsdatum", "Geburtsdatum"], ["kassenkundeName", "Krankenkasse"],
        ["kk_versichertennr", "KVNR"],
      ],
      abtretung: [
        ["lastName", "Nachname"], ["firstName", "Vorname"], ["geburtsdatum", "Geburtstag"],
        ["kk_versichertennr", "Vers.-Nr."], ["street", "Straße"], ["postalCode", "PLZ"],
        ["city", "Ort"], ["phone", "Telefon"], ["pflegegrad", "Pflegegrad"],
        ["kk_pflegegradSeit", "Pflegegrad seit"], ["kassenkundeName", "Name der Pflegekasse"],
        ["kk_krankenkasseAdresse", "Adresse der Pflegekasse"],
      ],
    };
    REQUIRED_FIELDS_BY_KEY.abtretung_ah = REQUIRED_FIELDS_BY_KEY.abtretung;
    var requiredFields = REQUIRED_FIELDS_BY_KEY[doc.key];
    if (requiredFields) {
      var missing = requiredFields
        .filter(function (f) { return !String(editedFields[f[0]] || "").trim(); })
        .map(function (f) { return f[1]; });
      if (missing.length) {
        return showDocError("Bitte füllen Sie alle Felder aus: " + missing.join(", "));
      }
    }

    if (!primarySig || !primarySig.isFilled()) return showDocError("Bitte unterschreiben Sie im Feld.");
    var signatureImage = primarySig.toPng();

    // Zusatzblatt: the optional Bevollmächtigte/r sub-section needs its own
    // signature (2nd pad), but only once a name was actually entered there.
    if (secondarySig && (editedFields.bevollmaechtigterName || "").trim()) {
      if (!secondarySig.isFilled()) {
        return showDocError("Bitte lassen Sie den/die Bevollmächtigte/n unterschreiben.");
      }
      extraFields.bevollmaechtigterSignature = secondarySig.toPng();
    }

    var submit = el("submitBtn");
    if (submit) { submit.disabled = true; submit.textContent = "Wird übermittelt …"; }

    api(token + "/documents/" + doc.key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signatureImage: signatureImage, extraFields: extraFields, editedFields: editedFields }),
    })
      .then(function (res) {
        doc.status = "signed";
        if (res.completed || res.status === "completed") return showDone();
        state.index++;
        while (state.index < state.docs.length && state.docs[state.index].status === "signed") state.index++;
        if (state.index >= state.docs.length) return showDone();
        state.maxIndex = Math.max(state.maxIndex, state.index);
        renderStep();
      })
      .catch(function (e) {
        showDocError(e.message || "Übermittlung fehlgeschlagen.");
        if (submit) { submit.disabled = false; submit.textContent = "Unterschreiben & weiter"; }
      });
  }

  function showDone() {
    container.innerHTML = "";
    el("docNav").classList.add("hidden");
    el("progress").textContent = "";
    el("doneCard").classList.remove("hidden");
    window.scrollTo(0, 0);
  }

  el("prevDoc").addEventListener("click", function () { goToDoc(state.index - 1); });
  el("nextDoc").addEventListener("click", function () { goToDoc(state.index + 1); });

  start();
})();
