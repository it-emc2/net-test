// DrawingPadManager.js
// Reusable sketch pad with pen, eraser, line, ruler, undo, colors and stroke sizes.

export function initDrawingPadManager(options = {}) {
  const root = options.root;
  if (!root) {
    console.warn("[DrawingPadManager] root missing, skipping init");
    return { clear: () => {}, setFromSaved: () => {} };
  }

  const canvas = root.querySelector(".project-sketch__canvas");
  const clearBtn = root.querySelector(".pad-clear");
  const hiddenDataUrl = root.querySelector('input[id$="SketchDataUrl"]');
  const hiddenJson = root.querySelector('input[id$="SketchJson"]');
  const toolButtons = Array.from(root.querySelectorAll(".pad-tool"));
  const colorButtons = Array.from(root.querySelectorAll(".pad-color"));
  const sizeButtons = Array.from(root.querySelectorAll(".pad-size"));
  const undoBtn = root.querySelector(".pad-undo");

  if (!canvas) {
    console.warn("[DrawingPadManager] canvas missing, skipping init");
    return { clear: () => {}, setFromSaved: () => {} };
  }

  const ctx = canvas.getContext("2d");
  let dpr = window.devicePixelRatio || 1;
  let ops = [];
  let pointerDown = false;
  let currentOp = null;
  let preview = null;
  let tool = "pen";
  let color = root.querySelector('.pad-color.active')?.dataset.color || "#2563eb";
  let size = Number(root.querySelector('.pad-size.active')?.dataset.size || 4) || 4;

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width || 1));
    const cssH = Math.max(1, Math.floor(rect.height || 1));
    const nextDpr = window.devicePixelRatio || 1;
    const nextW = Math.max(1, Math.floor(cssW * nextDpr));
    const nextH = Math.max(1, Math.floor(cssH * nextDpr));
    if (canvas.width === nextW && canvas.height === nextH) return;
    dpr = nextDpr;
    canvas.width = nextW;
    canvas.height = nextH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }

  // A pad on a page that is not shown has no layout size. Restoring into it
  // used to poll requestAnimationFrame forever (one loop per restore, never
  // cancelled). Now the saved sketch is kept as-is ("deferred") and drawn as
  // soon as the canvas gets a size: ResizeObserver where available, otherwise
  // one bounded rAF wait that is resumed on the next page change.
  let deferred = false;
  let deferredDataUrl = "";
  let waitRaf = 0;
  const WAIT_MAX_MS = 3000;

  function isCanvasReady() {
    const rect = canvas.getBoundingClientRect();
    return rect.width > 50 && rect.height > 50;
  }

  function renderDeferredIfReady() {
    if (!deferred) return true;
    resizeCanvas();
    if (!isCanvasReady()) return false;
    redraw();
    return true;
  }

  function stopWait() {
    if (waitRaf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(waitRaf);
    waitRaf = 0;
  }

  function startBoundedWait() {
    stopWait();
    if (typeof requestAnimationFrame !== "function") return;
    const started = Date.now();
    const tick = () => {
      waitRaf = 0;
      if (renderDeferredIfReady()) return;
      if (Date.now() - started > WAIT_MAX_MS) return; // give up; resumed on hashchange
      waitRaf = requestAnimationFrame(tick);
    };
    waitRaf = requestAnimationFrame(tick);
  }

  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => {
      if (deferred) renderDeferredIfReady();
    }).observe(canvas);
  } else {
    window.addEventListener("hashchange", () => {
      if (deferred) startBoundedWait();
    });
  }

  function drawImageOp(op) {
    return new Promise((resolve) => {
      if (!op?.dataUrl) {
        resolve();
        return;
      }
      const img = new Image();
      img.onload = () => {
        const rect = canvas.getBoundingClientRect();
        const cw = Math.max(1, rect.width || canvas.width);
        const ch = Math.max(1, rect.height || canvas.height);
        const scale = Math.min(cw / img.width, ch / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (cw - w) / 2;
        const y = (ch - h) / 2;
        ctx.drawImage(img, x, y, w, h);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = op.dataUrl;
    });
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function drawStroke(op) {
    if (!op.points?.length) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = op.tool === "eraser" ? "#ffffff" : (op.color || "#111827");
    ctx.lineWidth = op.size || 4;
    ctx.globalCompositeOperation = op.tool === "eraser" ? "destination-out" : "source-over";
    ctx.beginPath();
    ctx.moveTo(op.points[0].x, op.points[0].y);
    for (let i = 1; i < op.points.length; i += 1) ctx.lineTo(op.points[i].x, op.points[i].y);
    if (op.points.length === 1) {
      ctx.lineTo(op.points[0].x + 0.01, op.points[0].y + 0.01);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Draw only the newest segment of the stroke in progress (no full replay).
  function drawStrokeSegment(op, from, to) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = op.tool === "eraser" ? "#ffffff" : (op.color || "#111827");
    ctx.lineWidth = op.size || 4;
    ctx.globalCompositeOperation = op.tool === "eraser" ? "destination-out" : "source-over";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawLine(op) {
    if (!op?.from || !op?.to) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = op.color || "#111827";
    ctx.lineWidth = op.size || 4;
    ctx.beginPath();
    ctx.moveTo(op.from.x, op.from.y);
    ctx.lineTo(op.to.x, op.to.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawRuler(op) {
    drawLine(op);
    const dx = op.to.x - op.from.x;
    const dy = op.to.y - op.from.y;
    const len = Math.round(Math.hypot(dx, dy));
    const mx = (op.from.x + op.to.x) / 2;
    const my = (op.from.y + op.to.y) / 2;
    ctx.save();
    ctx.fillStyle = op.color || "#111827";
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${len}px`, mx, my - 8);
    ctx.restore();
  }

  function drawOp(op) {
    if (!op) return;
    if (op.type === "stroke") return drawStroke(op);
    if (op.type === "line") return drawLine(op);
    if (op.type === "ruler") return drawRuler(op);
  }

  // sync=false: repaint only (live preview while drawing a line/ruler); the
  // PNG export in syncHidden() runs at stroke end, undo, clear and restore.
  function redraw(sync = true) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const imageOps = ops.filter((op) => op?.type === "image");
    const vectorOps = ops.filter((op) => op?.type !== "image");

    if (imageOps.length) {
      imageOps.reduce((p, op) => p.then(() => drawImageOp(op)), Promise.resolve()).then(() => {
        vectorOps.forEach(drawOp);
        if (preview) {
          ctx.save();
          ctx.globalAlpha = 0.65;
          drawOp(preview);
          ctx.restore();
        }
        if (sync) syncHidden();
      });
      return;
    }

    vectorOps.forEach(drawOp);
    if (preview) {
      ctx.save();
      ctx.globalAlpha = 0.65;
      drawOp(preview);
      ctx.restore();
    }
    if (sync) syncHidden();
  }

  function syncHidden() {
    if (hiddenJson) hiddenJson.value = JSON.stringify({ version: 1, ops });
    if (!hiddenDataUrl) return;
    if (!ops.length) {
      hiddenDataUrl.value = "";
      return;
    }
    // Not drawn yet: keep the saved PNG instead of exporting an empty canvas.
    if (deferred && !isCanvasReady()) {
      hiddenDataUrl.value = deferredDataUrl;
      return;
    }
    deferred = false;
    deferredDataUrl = "";
    stopWait();
    hiddenDataUrl.value = canvas.toDataURL("image/png");
  }

  function setTool(next) {
    tool = next || "pen";
    root.dataset.tool = tool;
    toolButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tool === tool));
    preview = null;
    currentOp = null;
    pointerDown = false;
  }

  function setColor(next) {
    color = next || color;
    colorButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.color === color));
  }

  function setSize(next) {
    size = Number(next || size) || 4;
    sizeButtons.forEach((btn) => btn.classList.toggle("active", Number(btn.dataset.size) === size));
  }

  function pushOp(op) {
    ops.push(op);
    preview = null;
    currentOp = null;
    redraw();
  }

  function pointerStart(e) {
    resizeCanvas();
    const p = getPos(e);

    if (tool === "line" || tool === "ruler") {
      if (!currentOp || !currentOp.from) {
        currentOp = { type: tool, color, size, from: p };
        preview = { ...currentOp, to: p };
      } else {
        pushOp({ ...currentOp, to: p });
      }
      return;
    }

    pointerDown = true;
    currentOp = {
      type: "stroke",
      tool,
      color,
      size,
      points: [p],
    };
    preview = currentOp;
  }

  function pointerMove(e) {
    const p = getPos(e);
    if (tool === "line" || tool === "ruler") {
      if (currentOp?.from) {
        preview = { ...currentOp, to: p };
        redraw(false);
      }
      return;
    }

    if (!pointerDown || !currentOp) return;
    const last = currentOp.points[currentOp.points.length - 1];
    currentOp.points.push(p);
    preview = currentOp;
    drawStrokeSegment(currentOp, last, p);
  }

  function pointerEnd() {
    if (tool === "line" || tool === "ruler") return;
    if (!pointerDown || !currentOp) return;
    pointerDown = false;
    pushOp({ ...currentOp, points: [...currentOp.points] });
  }

  function undo() {
    if (!ops.length) return;
    ops.pop();
    preview = null;
    currentOp = null;
    redraw();
  }

  function clear() {
    ops = [];
    preview = null;
    currentOp = null;
    pointerDown = false;
    redraw();
  }

  async function setFromSaved(saved = {}) {
    const json = saved?.json || "";
    const dataUrl = saved?.dataUrl || "";

    let nextOps = null;
    if (json) {
      try {
        const parsed = JSON.parse(json);
        const parsedOps = Array.isArray(parsed?.ops) ? parsed.ops : [];
        if (parsedOps.length) nextOps = parsedOps;
      } catch (e) {
        console.warn("[DrawingPadManager] invalid sketch json, falling back to image:", e);
      }
    }
    if (!nextOps && dataUrl) nextOps = [{ type: "image", dataUrl }];

    if (!nextOps) {
      deferred = false;
      deferredDataUrl = "";
      stopWait();
      clear();
      return;
    }

    ops = nextOps;
    preview = null;
    currentOp = null;
    pointerDown = false;
    deferred = true;
    deferredDataUrl = dataUrl;

    if (renderDeferredIfReady()) return;
    // Page not shown: keep the saved values in the hidden fields (so a save
    // before the page is opened keeps the sketch) and draw once it is shown.
    syncHidden();
    if (typeof ResizeObserver !== "function") startBoundedWait();
  }

  toolButtons.forEach((btn) => btn.addEventListener("click", () => setTool(btn.dataset.tool || "pen")));
  colorButtons.forEach((btn) => btn.addEventListener("click", () => setColor(btn.dataset.color || color)));
  sizeButtons.forEach((btn) => btn.addEventListener("click", () => setSize(btn.dataset.size || size)));
  undoBtn?.addEventListener("click", undo);
  clearBtn?.addEventListener("click", clear);

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    pointerStart(e);
  });
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerEnd);
  canvas.addEventListener("pointercancel", pointerEnd);
  window.addEventListener("resize", resizeCanvas);

  root.__drawingPad = { clear, undo, setFromSaved };
  setTool(tool);
  setColor(color);
  setSize(size);
  resizeCanvas();
  redraw();

  return {
    clear,
    undo,
    setFromSaved,
    resize: resizeCanvas,
    getData: () => ({ json: hiddenJson?.value || "", dataUrl: hiddenDataUrl?.value || "" }),
  };
}
