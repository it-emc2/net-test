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
      strokeStyle: "#fff",
    },
    ...options,
  };

  const canvas = document.querySelector(cfg.els.canvas);
  const clearBtn = document.querySelector(cfg.els.clearBtn);
  const hidden = document.querySelector(cfg.els.hidden);

  if (!canvas) {
    console.warn("[SignaturePadManager] canvas missing, skipping init");
    return { setFromDataUrl: () => {}, clear: () => {} };
  }

  const ctx = canvas.getContext("2d");
  let drawing = false;
  let lastX = 0;
  let lastY = 0;

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    // Draw in CSS pixels while keeping retina backing store
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.lineWidth = cfg.pen.lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = cfg.pen.strokeStyle;
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e) {
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
    resizeCanvas();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!dataUrl) {
      if (hidden) hidden.value = "";
      return;
    }

    const img = new Image();
    img.onload = () => {
      // draw scaled to fit (in CSS pixel space)
      const rect = canvas.getBoundingClientRect();
      const cw = rect.width;
      const ch = rect.height;
      const scale = Math.min(cw / img.width, ch / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (cw - w) / 2;
      const y = (ch - h) / 2;
      ctx.drawImage(img, x, y, w, h);
      if (hidden) hidden.value = dataUrl;
    };
    img.src = dataUrl;
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

  // Back-compat: expose helper globally (some restore code may call it)
  window.setSignaturePadFromDataUrl = setFromDataUrl;

  return { setFromDataUrl, clear, resize: resizeCanvas };
}
