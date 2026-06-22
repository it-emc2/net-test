// SignaturePadManager.js
// Handles signature pad canvas interactions + helper to set from a stored dataUrl.

export function initSignaturePadManager(options = {}) {
  const cfg = {
    els: {
      canvas: "#signaturePad",
      clearBtn: "#sigClear",
      hidden: "#signatureDataUrl",
    },
    pen: {
      lineWidth: 2,
      strokeStyle: "#111", // was "#fff" -> invisible on white exports
    },
    ...options,
  };

  const canvas = document.querySelector(cfg.els.canvas);
  const clearBtn = document.querySelector(cfg.els.clearBtn);
  const hidden = document.querySelector(cfg.els.hidden);

  if (!canvas) {
    console.warn("[SignaturePadManager] canvas missing, skipping init");
    return { setFromDataUrl: () => {}, clear: () => {}, resize: () => {} };
  }

  const ctx = canvas.getContext("2d");
  let drawing = false;
  let lastX = 0;
  let lastY = 0;

  function configureContext() {
    ctx.lineWidth = cfg.pen.lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = cfg.pen.strokeStyle;
  }

  function drawDataUrlToCanvas(dataUrl) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!dataUrl) {
      if (hidden) hidden.value = "";
      return;
    }

    const img = new Image();
    img.onload = () => {
      const rect = canvas.getBoundingClientRect();
      const cw = Math.max(1, rect.width);
      const ch = Math.max(1, rect.height);

      const scale = Math.min(cw / img.width, ch / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (cw - w) / 2;
      const y = (ch - h) / 2;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, x, y, w, h);
      configureContext();
      if (hidden) hidden.value = dataUrl;
    };
    img.src = dataUrl;
  }

  function resizeCanvas() {
    // preserve existing signature before resize (canvas resize clears bitmap)
    const existing = hidden?.value?.trim() || "";

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));
    const targetW = Math.max(1, Math.floor(cssW * dpr));
    const targetH = Math.max(1, Math.floor(cssH * dpr));

    if (canvas.width === targetW && canvas.height === targetH) {
      configureContext();
      return;
    }

    canvas.width = targetW;
    canvas.height = targetH;

    // Draw in CSS pixels while keeping retina backing store
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    configureContext();

    if (existing) {
      drawDataUrlToCanvas(existing);
    }
  }

  function ensureCanvasSized() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.max(1, Math.floor(Math.max(1, rect.width) * dpr));
    const targetH = Math.max(1, Math.floor(Math.max(1, rect.height) * dpr));

    if (canvas.width !== targetW || canvas.height !== targetH) {
      resizeCanvas();
    }
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e) {
    // hidden-init fix
    ensureCanvasSized();

    drawing = true;
    const p = getPos(e);
    lastX = p.x;
    lastY = p.y;
  }

  function move(e) {
    if (!drawing) return;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastX = p.x;
    lastY = p.y;
  }

  function end() {
    if (!drawing) return;
    drawing = false;
    if (hidden) hidden.value = canvas.toDataURL("image/png");
  }

  function clear() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (hidden) hidden.value = "";
  }

  function setFromDataUrl(dataUrl) {
    ensureCanvasSized();
    drawDataUrlToCanvas(dataUrl || "");
  }

  // Pointer events handle mouse + touch + pen
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    start(e);
  });
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("pointerleave", end);

  clearBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    clear();
  });

  // Initial + responsive resize
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // Back-compat: expose helper globally
  window.setSignaturePadFromDataUrl = setFromDataUrl;

  return { setFromDataUrl, clear, resize: resizeCanvas };
}