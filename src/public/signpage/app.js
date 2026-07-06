/* Signing page client — served at /sign/<token>, assets under /signpage/. */
(function () {
  "use strict";

  var token = decodeURIComponent(
    (window.location.pathname.split("/sign/")[1] || "").replace(/\/+$/, ""),
  );

  var el = function (id) { return document.getElementById(id); };
  var loading = el("loading");
  var fatal = el("fatal");
  var app = el("app");

  // Editable key fields shown per document (customer may correct them).
  var EDITABLE = [
    { key: "salutation", label: "Anrede" },
    { key: "firstName", label: "Vorname" },
    { key: "lastName", label: "Nachname" },
    { key: "street", label: "Straße & Nr." },
    { key: "postalCode", label: "PLZ" },
    { key: "city", label: "Ort" },
    { key: "phone", label: "Telefon" },
    { key: "email", label: "E-Mail" },
  ];

  var state = { data: null, docs: [], index: 0, prefill: {} };

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
        state.data = data;
        state.prefill = data.prefill || {};
        state.docs = (data.documents || []).slice();
        loading.classList.add("hidden");
        app.classList.remove("hidden");
        if (data.completed) return showDone();
        // resume at first unsigned document
        state.index = 0;
        while (
          state.index < state.docs.length &&
          state.docs[state.index].status === "signed"
        ) {
          state.index++;
        }
        if (state.index >= state.docs.length) return showDone();
        renderStep();
      })
      .catch(function (e) { showFatal(e.message || "Der Link ist ungültig oder abgelaufen."); });
  }

  function renderDots() {
    var box = el("stepdots");
    box.innerHTML = "";
    state.docs.forEach(function (d, i) {
      var dot = document.createElement("span");
      dot.className =
        "dot" + (i === state.index ? " active" : i < state.index ? " done" : "");
      box.appendChild(dot);
    });
  }

  function renderFields() {
    var wrap = el("fieldsWrap");
    wrap.innerHTML = "";
    EDITABLE.forEach(function (f) {
      var div = document.createElement("div");
      div.className = "field";
      var val = state.prefill[f.key] || "";
      div.innerHTML =
        '<label>' + f.label + "</label>" +
        '<input type="text" data-key="' + f.key + '" value="' +
        String(val).replace(/"/g, "&quot;") + '">';
      wrap.appendChild(div);
    });
  }

  function collectFields() {
    var out = {};
    var inputs = el("fieldsWrap").querySelectorAll("input[data-key]");
    Array.prototype.forEach.call(inputs, function (inp) {
      out[inp.getAttribute("data-key")] = inp.value.trim();
    });
    return out;
  }

  var sig = null;
  function renderStep() {
    var doc = state.docs[state.index];
    el("progress").textContent =
      "Dokument " + (state.index + 1) + " von " + state.docs.length;
    el("docTitle").textContent = doc.label;
    renderDots();
    renderFields();
    el("docFrame").src = "/api/signing/" + token + "/documents/" + doc.key + "/pdf";
    el("docError").classList.add("hidden");
    resetSignature();
  }

  // ---- signature canvas ----
  function setupCanvas() {
    var canvas = el("sigCanvas");
    var ctx = canvas.getContext("2d");
    var drawing = false, dirty = false, last = null;

    function resize() {
      var ratio = window.devicePixelRatio || 1;
      var rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#122";
    }
    resize();
    window.addEventListener("resize", function () {
      var data = dirty ? canvas.toDataURL() : null;
      resize();
      if (data) {
        var img = new Image();
        img.onload = function () { ctx.drawImage(img, 0, 0, canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height); };
        img.src = data;
      }
    });

    function pos(e) {
      var rect = canvas.getBoundingClientRect();
      var t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    function down(e) { drawing = true; last = pos(e); e.preventDefault(); }
    function move(e) {
      if (!drawing) return;
      var p = pos(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p; dirty = true; e.preventDefault();
    }
    function up() { drawing = false; }

    canvas.addEventListener("mousedown", down);
    canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    canvas.addEventListener("touchstart", down, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", up);

    return {
      clear: function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        dirty = false;
      },
      isDirty: function () { return dirty; },
      toPng: function () { return canvas.toDataURL("image/png"); },
    };
  }

  function resetSignature() {
    if (sig) sig.clear();
    el("typeWrap").classList.add("hidden");
    el("typeName").value = "";
  }

  // Build a PNG from a typed name (fallback for users who can't draw).
  function typedNameToPng(name) {
    var c = document.createElement("canvas");
    c.width = 600; c.height = 160;
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#122";
    ctx.font = "48px 'Segoe Script', 'Comic Sans MS', cursive";
    ctx.textBaseline = "middle";
    ctx.fillText(name, 20, 80);
    return c.toDataURL("image/png");
  }

  function submitCurrent() {
    var doc = state.docs[state.index];
    var errBox = el("docError");
    errBox.classList.add("hidden");

    var signatureImage = null;
    var typing = !el("typeWrap").classList.contains("hidden");
    if (typing) {
      var name = el("typeName").value.trim();
      if (!name) { errBox.textContent = "Bitte geben Sie Ihren Namen ein."; errBox.classList.remove("hidden"); return; }
      signatureImage = typedNameToPng(name);
    } else {
      if (!sig || !sig.isDirty()) { errBox.textContent = "Bitte unterschreiben Sie im Feld."; errBox.classList.remove("hidden"); return; }
      signatureImage = sig.toPng();
    }

    var fields = collectFields();
    var btn = el("submitBtn");
    btn.disabled = true; btn.textContent = "Wird übermittelt …";

    api(token + "/documents/" + doc.key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signatureImage: signatureImage, editedFields: fields, place: fields.city }),
    })
      .then(function (res) {
        doc.status = "signed";
        if (res.completed || res.status === "completed") return showDone();
        state.index++;
        while (state.index < state.docs.length && state.docs[state.index].status === "signed") state.index++;
        if (state.index >= state.docs.length) return showDone();
        renderStep();
        window.scrollTo(0, 0);
      })
      .catch(function (e) {
        errBox.textContent = e.message || "Übermittlung fehlgeschlagen.";
        errBox.classList.remove("hidden");
      })
      .then(function () { btn.disabled = false; btn.textContent = "Unterschreiben & weiter"; });
  }

  function showDone() {
    el("docCard").classList.add("hidden");
    el("doneCard").classList.remove("hidden");
    window.scrollTo(0, 0);
  }

  function wire() {
    sig = setupCanvas();
    el("clearSig").addEventListener("click", function () {
      if (!el("typeWrap").classList.contains("hidden")) { el("typeName").value = ""; }
      else if (sig) sig.clear();
    });
    el("toggleType").addEventListener("click", function () {
      var w = el("typeWrap");
      var hidden = w.classList.toggle("hidden");
      this.textContent = hidden ? "Namen tippen statt zeichnen" : "Doch lieber zeichnen";
    });
    el("submitBtn").addEventListener("click", submitCurrent);
  }

  wire();
  start();
})();
