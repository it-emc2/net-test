import * as pdfjsLib from "/pdfjs/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

const errorDiv = document.getElementById("error");
const loading = document.getElementById("loading");
const viewportDiv = document.getElementById("viewport");

const prevButton = document.getElementById("prev-page");
const nextButton = document.getElementById("next-page");
const currentPageSpan = document.getElementById("current-page");
const totalPagesSpan = document.getElementById("total-pages");

const zoomInButton = document.getElementById("zoom-in");
const zoomOutButton = document.getElementById("zoom-out");
const zoomFitButton = document.getElementById("zoom-fit");
const zoomLevelSpan = document.getElementById("zoom-level");

let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let scale = 1.5;
let rendering = false;

console.log("[viewer] viewer.mjs executed", { href: location.href, origin: location.origin });
window.parent?.postMessage({ type: "VIEWER_PING_1" }, window.location.origin);

function showError(message) {
  if (!errorDiv) return;
  errorDiv.textContent = message;
  errorDiv.classList.add("active");
  setTimeout(() => errorDiv.classList.remove("active"), 6000);
}

function setLoading(v) {
  if (!loading) return;
  loading.classList.toggle("active", !!v);
}

function updatePageInfo() {
  if (currentPageSpan) currentPageSpan.textContent = String(currentPage);
  if (totalPagesSpan) totalPagesSpan.textContent = String(totalPages);
  if (prevButton) prevButton.disabled = currentPage <= 1;
  if (nextButton) nextButton.disabled = currentPage >= totalPages;
}

function updateZoomLevel() {
  if (zoomLevelSpan) zoomLevelSpan.textContent = `${Math.round(scale * 100)}%`;
}

async function renderPage(pageNum) {
  if (rendering || !pdfDoc) return null;
  rendering = true;
  setLoading(true);

  try {
    const page = await pdfDoc.getPage(pageNum);
    const pdfViewport = page.getViewport({ scale });

    const container = document.createElement("div");
    container.className = "page-container";

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = Math.ceil(pdfViewport.width);
    canvas.height = Math.ceil(pdfViewport.height);

    container.appendChild(canvas);

    await page.render({ canvasContext: ctx, viewport: pdfViewport }).promise;
    return container;
  } catch (e) {
    console.error(e);
    showError("Render error: " + (e?.message ?? String(e)));
    return null;
  } finally {
    rendering = false;
    setLoading(false);
  }
}

async function renderCurrentPage() {
  if (!viewportDiv) return;
  viewportDiv.innerHTML = "";
  const el = await renderPage(currentPage);
  if (el) viewportDiv.appendChild(el);
  updatePageInfo();
}

prevButton?.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderCurrentPage();
  }
});

nextButton?.addEventListener("click", () => {
  if (currentPage < totalPages) {
    currentPage++;
    renderCurrentPage();
  }
});

zoomInButton?.addEventListener("click", () => {
  scale = Math.min(scale + 0.25, 3);
  updateZoomLevel();
  renderCurrentPage();
});

zoomOutButton?.addEventListener("click", () => {
  scale = Math.max(scale - 0.25, 0.5);
  updateZoomLevel();
  renderCurrentPage();
});

zoomFitButton?.addEventListener("click", () => {
  scale = 1.5;
  updateZoomLevel();
  renderCurrentPage();
});

async function loadPdfFromArrayBuffer(buf) {
  try {
    setLoading(true);

    pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
    totalPages = pdfDoc.numPages;
    currentPage = 1;

    updatePageInfo();
    updateZoomLevel();

    await renderCurrentPage();
  } catch (e) {
    console.error(e);
    showError("Load error: " + (e?.message ?? String(e)));
  } finally {
    setLoading(false);
  }
}

window.addEventListener("message", async (event) => {
  // strict same-origin (adjust only if you intentionally embed cross-origin)
  if (event.origin !== window.location.origin) return;

  const data = event.data || {};
  if (data.type === "LOAD_PDF_ARRAYBUFFER" && data.buffer) {
    await loadPdfFromArrayBuffer(data.buffer);
  }
});

// Signal parent when ready
window.parent?.postMessage({ type: "VIEWER_READY" }, window.location.origin);