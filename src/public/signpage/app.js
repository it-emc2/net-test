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

  var state = { docs: [], index: 0 };
  var sig = null; // current signature pad controller

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
        renderStep();
      })
      .catch(function (e) { showFatal(e.message || "Der Link ist ungültig oder abgelaufen."); });
  }

  function renderStep() {
    var doc = state.docs[state.index];
    el("progress").textContent = "Dokument " + (state.index + 1) + " von " + state.docs.length;
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

  function wireControls() {
    var canvas = el("sigCanvas");
    sig = canvas ? setupCanvas(canvas) : null;
    if (sig) requestAnimationFrame(function () { sig.refit(); });

    var clearBtn = el("clearSig");
    if (clearBtn) clearBtn.addEventListener("click", function () {
      var tw = el("typeWrap");
      if (tw && !tw.classList.contains("hidden")) { el("typeName").value = ""; }
      else if (sig) sig.clear();
    });

    var toggle = el("toggleType");
    if (toggle) toggle.addEventListener("click", function () {
      var w = el("typeWrap");
      var hidden = w.classList.toggle("hidden");
      this.textContent = hidden ? "Namen tippen statt zeichnen" : "Doch lieber zeichnen";
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

    var signatureImage = null;
    var tw = el("typeWrap");
    var typing = tw && !tw.classList.contains("hidden");
    if (typing) {
      var name = (el("typeName").value || "").trim();
      if (!name) return showDocError("Bitte geben Sie Ihren Namen ein.");
      signatureImage = typedNameToPng(name);
    } else {
      if (!sig || !sig.isDirty()) return showDocError("Bitte unterschreiben Sie im Feld.");
      signatureImage = sig.toPng();
    }

    var submit = el("submitBtn");
    if (submit) { submit.disabled = true; submit.textContent = "Wird übermittelt …"; }

    api(token + "/documents/" + doc.key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signatureImage: signatureImage, extraFields: extraFields }),
    })
      .then(function (res) {
        doc.status = "signed";
        if (res.completed || res.status === "completed") return showDone();
        state.index++;
        while (state.index < state.docs.length && state.docs[state.index].status === "signed") state.index++;
        if (state.index >= state.docs.length) return showDone();
        renderStep();
      })
      .catch(function (e) {
        showDocError(e.message || "Übermittlung fehlgeschlagen.");
        if (submit) { submit.disabled = false; submit.textContent = "Unterschreiben & weiter"; }
      });
  }

  function showDone() {
    container.innerHTML = "";
    el("progress").textContent = "";
    el("doneCard").classList.remove("hidden");
    window.scrollTo(0, 0);
  }

  start();
})();
