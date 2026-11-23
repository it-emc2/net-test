// Load-time measurement of the React app on the target device (iPad Pro 11" portrait, 834×1194,
// CPU slowed 6×), against a PRODUCTION build served by the v2 server (never the vite dev server).
// For each offer type it opens one step of an existing draft and measures, per action:
//   cold   full load of the step URL in a fresh browser context (empty cache)
//   warm   reload of the same page (files from the HTTP cache)
//   weiter in-app „Weiter“ to the next step
//   jump   in-app jump via the step list (drawer) to Kundendaten
//   home   (once per run) cold load of the Hauptmenü — the app start
// Numbers per action: blocked time (sum of long tasks − 50 ms, as ipad-check.cjs), longest task,
// main-thread time by kind (self time of Chrome trace events: compile, module evaluation, other JS
// = React render/commit + effects + handlers, style + layout, paint, GC), JS chunks (count,
// fetched, kB), API requests per endpoint, step visible (first animation frame with the step's
// heading) and interactive (= max(visible, end of the last long task)).
//
//   CAPTURE_BASE=http://localhost:5173 node v2/scripts/perf-open.cjs [--runs 5] [--types bu,ah] [--out dir] [--label before]
//   … --profile bu:Wandverkleidung   one cold load with the JS sampling profiler: writes the trace
//                                    (open it in Chrome DevTools › Performance) and a summary by
//                                    source module (needs hidden source maps in apps/web/dist/assets)
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:5173";
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const RUNS = Number(arg("runs", 5));
const TYPES = arg("types", "bu,bwt,ah,bl,hl").split(",");
const OUT = arg("out", path.join(process.env.HOME, "emc2-local/perf/runs"));
const LABEL = arg("label", "run");
const PROFILE = arg("profile", "");
const SETTLE = Number(arg("settle", 3500)); // after the step is visible: price debounce + request, autosave (2.5 s) included

// per type: the step opened by URL and the step „Weiter“ leads to; the step list jump goes to Kundendaten
const PLAN = {
  bu: { step: "Wandverkleidung", next: "DuschabtrennungNeu", nextLabel: "Duschabtrennung" },
  bwt: { step: "bwtArbeiten", next: "bwt", nextLabel: "Badewannentür" },
  ah: { step: "ah", next: "Finanzierung", nextLabel: "Finanzierung" },
  bl: { step: "bl", next: "Kosten", nextLabel: "Kosten" },
  hl: { step: "hlArbeiten", next: "hlk", nextLabel: "Handläufe" },
};
const JUMP = "Kundendaten";
// what shows that a step is on the page (its heading)
const MARK = {
  Kundendaten: "#kd-contact", Wandverkleidung: "#wv-title", DuschabtrennungNeu: "#da-title", bwtArbeiten: "#bwt-arbeiten-title", bwt: "#bwt-bestand",
  hlArbeiten: "#hl-arbeiten-title", hlk: "#hl-title", bl: "#bl-title", Kosten: "#kosten-title",
  ah: "h2:Leistungen", Finanzierung: "h2:Finanzierung", home: "h1:Hauptmenü",
};

const token = (() => { const p = `${Date.now() + 12 * 3600e3}:capture@local.test`; return Buffer.from(p).toString("base64url") + "." + crypto.createHmac("sha256", SECRET).update(p).digest("hex"); })();
const LAUNCH = { headless: true, ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) };
const CATS = ["devtools.timeline", "disabled-by-default-devtools.timeline", "v8.execute", "v8", "blink.user_timing", "loading", "toplevel"];

// in the page: long tasks with their start, and the first frame each step heading was seen in
const INIT = (marks) => {
  window.__lt = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true });
  window.__seen = {};
  const found = (m) => {
    if (m.startsWith("h1:") || m.startsWith("h2:")) { const tag = m.slice(0, 2), text = m.slice(3); return [...document.querySelectorAll(tag)].some((h) => h.textContent.trim() === text); }
    return !!document.querySelector(m);
  };
  const tick = () => { for (const [k, m] of Object.entries(marks)) if (window.__seen[k] === undefined && found(m)) window.__seen[k] = performance.now(); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
};

const endpoint = (method, url) => `${method} ${new URL(url).pathname.replace(/\/deals\/[^/]+/, "/deals/:id")}`;
const sha = (s) => (s ? crypto.createHash("sha1").update(s).digest("hex").slice(0, 10) : "");

async function newPage(browser, profile = false) {
  const ctx = await browser.newContext({ viewport: { width: 834, height: 1194 }, deviceScaleFactor: 2, hasTouch: true, serviceWorkers: "block", locale: "de-DE", timezoneId: "Europe/Berlin" });
  await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
  const page = await ctx.newPage(); // no page.route(): routing would switch the HTTP cache off (warm reloads); the user is in the seeded database
  await page.addInitScript(INIT, MARK);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  await cdp.send("Network.enable");
  const net = { list: [], byId: new Map() };
  cdp.on("Network.requestWillBeSent", (e) => {
    const r = { id: e.requestId, url: e.request.url, method: e.request.method, body: e.request.postData ?? "", cached: false, bytes: 0, done: false };
    net.byId.set(e.requestId, r); net.list.push(r);
  });
  cdp.on("Network.responseReceived", (e) => { const r = net.byId.get(e.requestId); if (r) { r.status = e.response.status; r.cached = r.cached || !!(e.response.fromDiskCache || e.response.fromMemoryCache || e.response.fromPrefetchCache); } });
  cdp.on("Network.requestServedFromCache", (e) => { const r = net.byId.get(e.requestId); if (r) r.cached = true; });
  cdp.on("Network.loadingFinished", (e) => { const r = net.byId.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; r.done = true; } });
  cdp.on("Network.loadingFailed", (e) => { const r = net.byId.get(e.requestId); if (r) { r.done = true; r.failed = true; } });
  return { ctx, page, cdp, net, profile };
}

async function traceStart(p) {
  const cats = [...CATS, ...(p.profile ? ["disabled-by-default-v8.cpu_profiler"] : [])];
  await p.cdp.send("Tracing.start", { traceConfig: { includedCategories: cats }, transferMode: "ReturnAsStream" });
}
async function traceStop(p) {
  const done = new Promise((res) => p.cdp.once("Tracing.tracingComplete", res));
  await p.cdp.send("Tracing.end");
  const { stream } = await done;
  const parts = [];
  for (;;) { const c = await p.cdp.send("IO.read", { handle: stream, size: 1 << 20 }); parts.push(c.base64Encoded ? Buffer.from(c.data, "base64").toString() : c.data); if (c.eof) break; }
  await p.cdp.send("IO.close", { handle: stream });
  const parsed = JSON.parse(parts.join(""));
  return Array.isArray(parsed) ? parsed : parsed.traceEvents;
}

/** main-thread time by kind (self time of trace events), ms of throttled CPU */
function breakdown(events) {
  const names = new Map();
  for (const e of events) if (e.ph === "M" && e.name === "thread_name") names.set(`${e.pid}:${e.tid}`, e.args.name);
  const count = new Map();
  for (const e of events) { const k = `${e.pid}:${e.tid}`; if (names.get(k) === "CrRendererMain" && e.ph === "X") count.set(k, (count.get(k) ?? 0) + 1); }
  const main = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const ev = events.filter((e) => `${e.pid}:${e.tid}` === main && e.ph === "X" && e.dur !== undefined).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const kind = (n) =>
    /compile|CompileScript|CompileCode|parseOnBackground|produceCache|deserialize/i.test(n) ? "compile"
    : /^v8\.evaluateModule$|^EvaluateScript$|^v8\.run$/.test(n) ? "evaluate"
    : /GC|Collect/.test(n) ? "gc"
    : /^(UpdateLayoutTree|RecalculateStyles|ParseAuthorStyleSheet)$/.test(n) ? "style"
    : /^(Layout|ComputeIntersections)$/.test(n) ? "layout"
    : /^(Paint|PrePaint|Layerize|UpdateLayer|Commit|PaintImage|Decode Image|UpdateLayerTree)$/.test(n) ? "paint"
    : /^ParseHTML$/.test(n) ? "html"
    : /^(FunctionCall|TimerFire|EventDispatch|FireAnimationFrame|RunMicrotasks|v8\.callFunction|V8\.Execute|v8\.execute|XHRReadyStateChange|XHRLoad|FireIdleCallback)$/.test(n) ? "js"
    : "other";
  const out = { busy: 0, compile: 0, evaluate: 0, js: 0, style: 0, layout: 0, paint: 0, gc: 0, html: 0, other: 0 };
  const stack = [];
  const close = (upTo) => { while (stack.length && stack[stack.length - 1].end <= upTo) { const s = stack.pop(); out[s.kind] += Math.max(0, s.self) / 1000; } };
  for (const e of ev) {
    close(e.ts);
    if (stack.length) { const parent = stack[stack.length - 1]; parent.self -= Math.min(e.dur, parent.end - e.ts); }
    else out.busy += e.dur / 1000;
    stack.push({ end: e.ts + e.dur, self: e.dur, kind: kind(e.name) });
  }
  close(Infinity);
  for (const k of Object.keys(out)) out[k] = Math.round(out[k]);
  return out;
}

/** one action: from `t0` (page time) until the step is visible and things have settled */
async function act(p, name, markKey, fn, { full = false } = {}) {
  const { page, net } = p;
  const from = net.list.length;
  await traceStart(p);
  let t0 = 0;
  if (!full) t0 = await page.evaluate(() => { window.__seen = {}; return performance.now(); });
  await fn();
  await page.waitForFunction((k) => window.__seen && window.__seen[k] !== undefined, markKey, { timeout: 60000, polling: 100 });
  const t1 = Date.now(); // settle: no API request in flight, then SETTLE ms more
  while (Date.now() - t1 < 15000 && net.list.slice(from).some((r) => !r.done && /\/api\//.test(r.url))) await page.waitForTimeout(100);
  await page.waitForTimeout(SETTLE);
  const events = await traceStop(p);
  const m = await page.evaluate(([k, t0]) => ({ seen: window.__seen[k], lt: window.__lt.filter(([s]) => s >= t0) }), [markKey, t0]);
  const reqs = net.list.slice(from);
  const visible = m.seen - t0;
  const lastEnd = m.lt.reduce((x, [s, d]) => Math.max(x, s + d - t0), 0);
  const js = reqs.filter((r) => /\/app\/assets\/.*\.js$/.test(r.url));
  const api = {};
  for (const r of reqs.filter((r) => /\/(api|admin\/api)\//.test(r.url))) { const k = endpoint(r.method, r.url); api[k] = (api[k] ?? 0) + 1; }
  return {
    name, blockedMs: Math.round(m.lt.reduce((a, [, d]) => a + Math.max(0, d - 50), 0)), longestMs: Math.round(m.lt.reduce((a, [, d]) => Math.max(a, d), 0)),
    visibleMs: Math.round(visible), interactiveMs: Math.round(Math.max(visible, lastEnd)),
    chunks: js.length, chunksFetched: js.filter((r) => !r.cached).length, chunkKB: Math.round(js.filter((r) => !r.cached).reduce((a, r) => a + r.bytes, 0) / 1024),
    chunkNames: js.map((r) => path.basename(r.url).replace(/-[\w-]{8}\.js$/, "")).sort(),
    api, priceCalls: api["POST /api/price"] ?? 0,
    bodies: reqs.filter((r) => /\/api\//.test(r.url) && r.method !== "GET").map((r) => ({ ep: endpoint(r.method, r.url), sha: sha(r.body), len: r.body.length, body: r.body })),
    main: breakdown(events), events: p.profile ? events : undefined,
  };
}

const stepUrl = (key, type, step) => `${BASE}/app/deal/${key}/${type}/${step}`;

/** a saved draft to open: a new offer whose Kundendaten got a last name, autosaved (CPU not slowed) */
async function makeDraft(browser, type) {
  const key = "t-" + crypto.randomBytes(12).toString("hex");
  const p = await newPage(browser);
  await p.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await p.page.goto(stepUrl(key, type, "Kundendaten"), { waitUntil: "load" });
  await p.page.locator("#kd-contact").waitFor({ timeout: 30000 });
  const saved = p.page.waitForResponse((r) => r.request().method() === "PUT" && r.url().includes(`/api/deals/${key}/draft`), { timeout: 20000 });
  const ln = p.page.getByLabel("Nachname", { exact: true });
  await ln.fill("Perf"); await ln.blur();
  await saved;
  await p.page.waitForTimeout(300);
  await p.ctx.close();
  return key;
}

async function runType(browser, type, run) {
  const { step, next, nextLabel } = PLAN[type];
  const key = await makeDraft(browser, type);
  const p = await newPage(browser);
  const out = [];
  try {
    out.push(await act(p, "cold", step, () => p.page.goto(stepUrl(key, type, step), { waitUntil: "commit" }), { full: true }));
    out.push(await act(p, "warm", step, () => p.page.reload({ waitUntil: "commit" }), { full: true }));
    out.push(await act(p, "weiter", next, () => p.page.getByRole("link", { name: `Weiter zu ${nextLabel}` }).click()));
    await p.page.locator("#offer-burger").click();
    await p.page.locator(`dialog[open] ol a[href*="/${JUMP}"]`).waitFor();
    out.push(await act(p, "jump", JUMP, () => p.page.locator(`dialog[open] ol a[href*="/${JUMP}"]`).click()));
  } finally { await p.ctx.close(); }
  return out.map((r) => ({ type, run, step: r.name === "weiter" ? next : r.name === "jump" ? JUMP : step, ...r }));
}

async function runHome(browser, run) {
  const p = await newPage(browser);
  try { return [{ type: "app", run, step: "home", ...(await act(p, "cold", "home", () => p.page.goto(`${BASE}/app/`, { waitUntil: "commit" }), { full: true })) }]; }
  finally { await p.ctx.close(); }
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2); };

function summarize(rows) {
  const groups = new Map();
  for (const r of rows) { const k = `${r.type} ${r.step} ${r.name}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const lines = [
    "| type | step | action | blocked med / max | longest med / max | visible med | interactive med | compile | evaluate | other JS | style+layout | paint | gc | chunks (fetched, kB) | API calls (median run) · price calls per run |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const [k, rs] of groups) {
    const [type, step, action] = k.split(" ");
    const f = (sel) => rs.map(sel);
    const mid = rs.slice().sort((a, b) => a.blockedMs - b.blockedMs)[Math.floor(rs.length / 2)];
    const apis = Object.entries(mid.api).map(([e, n]) => `${e}×${n}`).join(", ");
    lines.push(`| ${type} | ${step} | ${action} | ${median(f((r) => r.blockedMs))} / ${Math.max(...f((r) => r.blockedMs))} | ${median(f((r) => r.longestMs))} / ${Math.max(...f((r) => r.longestMs))} | ${median(f((r) => r.visibleMs))} | ${median(f((r) => r.interactiveMs))} | ${median(f((r) => r.main.compile))} | ${median(f((r) => r.main.evaluate))} | ${median(f((r) => r.main.js))} | ${median(f((r) => r.main.style + r.main.layout))} | ${median(f((r) => r.main.paint))} | ${median(f((r) => r.main.gc))} | ${mid.chunks} (${mid.chunksFetched}, ${mid.chunkKB}) | ${apis} · ${f((r) => r.priceCalls).join("/")} |`);
  }
  return lines.join("\n");
}

/** profile summary: self time of JS samples by source module (hidden source maps in dist/assets) */
function profileSummary(events, distDir) {
  const { SourceMapConsumer } = require("../../node_modules/source-map");
  const maps = new Map();
  const mapFor = (url) => {
    const f = path.basename(new URL(url).pathname);
    if (!maps.has(f)) { const p = path.join(distDir, "assets", f + ".map"); maps.set(f, fs.existsSync(p) ? new SourceMapConsumer(JSON.parse(fs.readFileSync(p, "utf8"))) : null); }
    return maps.get(f);
  };
  const nodes = new Map();
  let samples = [], deltas = [];
  for (const e of events) {
    if (e.name !== "ProfileChunk") continue;
    const c = e.args?.data?.cpuProfile;
    for (const n of c?.nodes ?? []) nodes.set(n.id, n);
    samples = samples.concat(c?.samples ?? []); deltas = deltas.concat(e.args?.data?.timeDeltas ?? []);
  }
  const byModule = new Map(), byFn = new Map();
  for (let i = 0; i < samples.length; i++) {
    const n = nodes.get(samples[i]); const dt = (deltas[i + 1] ?? 0) / 1000;
    if (!n) continue;
    const cf = n.callFrame; let mod = cf.url ? path.basename(cf.url) : `(${cf.functionName || "native"})`, fn = cf.functionName || "(anonymous)";
    if (cf.url && cf.url.includes("/app/assets/")) {
      const pos = mapFor(cf.url)?.originalPositionFor({ line: cf.lineNumber + 1, column: cf.columnNumber });
      if (pos?.source) { mod = pos.source.replace(/^.*node_modules\//, "nm/").replace(/^.*\/v2\//, "v2/").replace(/^(\.\.\/)+/, ""); fn = pos.name || fn; }
    }
    byModule.set(mod, (byModule.get(mod) ?? 0) + dt);
    byFn.set(`${fn} @ ${mod}`, (byFn.get(`${fn} @ ${mod}`) ?? 0) + dt);
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v.toFixed(0).padStart(6)} ms  ${k}`).join("\n");
  const pkg = new Map();
  for (const [k, v] of byModule) { const g = k.startsWith("nm/") ? k.split("/").slice(0, k.split("/")[1].startsWith("@") ? 3 : 2).join("/") : k.replace(/^(.*?src\/features\/[^/]+(?:\/[^/.]+)?)\/.*$/, "$1"); pkg.set(g, (pkg.get(g) ?? 0) + v); }
  return `## by package / feature folder (self time of JS samples, ms of 6x-slowed CPU)\n${top(pkg, 25)}\n\n## by module\n${top(byModule, 40)}\n\n## by function\n${top(byFn, 40)}\n`;
}

/** --price: the price calls made on opening a step after a full load (the readings with 2 calls),
 *  with a hash of each request body — the same body twice is a duplicate */
async function priceProbe(browser) {
  const scenarios = [
    { name: "bu Zusammenfassung", type: "bu", step: "Zusammenfassung", mark: "#zf-more-trigger" },
    { name: "hl Handläufe", type: "hl", step: "hlk", mark: "#hl-title" },
    { name: "bu Kosten", type: "bu", step: "Kosten", mark: "#kosten-title" },
    // typed on Kundendaten, then Kosten opened by address before the autosave (2.5 s): the device snapshot opens
    { name: "bu Kosten after typing (snapshot)", type: "bu", step: "Kosten", mark: "#kosten-title", typed: true },
  ];
  const out = [];
  for (const s of scenarios) {
    for (let run = 1; run <= RUNS; run++) {
      const key = await makeDraft(browser, s.type);
      const p = await newPage(browser);
      try {
        if (s.typed) {
          await p.page.goto(stepUrl(key, s.type, "Kundendaten"), { waitUntil: "load" });
          await p.page.locator("#kd-contact").waitFor({ timeout: 30000 });
          const fn = p.page.getByLabel("Vorname", { exact: true }); await fn.fill(`Probe ${run}`); await fn.blur();
          await p.page.waitForTimeout(300);
          // the page goes away while the save cannot reach the server: the input stays only in the device snapshot
          await p.ctx.setOffline(true);
          await p.page.goto("about:blank");
          await p.ctx.setOffline(false);
        }
        const from = p.net.list.length;
        await p.page.goto(stepUrl(key, s.type, s.step), { waitUntil: "load" });
        await p.page.locator(s.mark).first().waitFor({ timeout: 60000 });
        await p.page.waitForTimeout(SETTLE);
        const reqs = p.net.list.slice(from).filter((r) => /\/api\//.test(r.url));
        const priceReqs = reqs.filter((r) => r.method === "POST" && /\/api\/price$/.test(r.url)), price = priceReqs.map((r) => sha(r.body));
        const row = { scenario: s.name, run, priceCalls: price.length, priceBodies: price, duplicateBodies: price.length - new Set(price).size, bodies: priceReqs.map((r) => r.body), api: reqs.map((r) => endpoint(r.method, r.url)) };
        out.push(row); console.error(JSON.stringify({ ...row, bodies: undefined }));
      } finally { await p.ctx.close(); }
    }
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(OUT, `${LABEL}-price-${stamp}.json`), JSON.stringify(out, null, 1));
  const by = new Map(); for (const r of out) { if (!by.has(r.scenario)) by.set(r.scenario, []); by.get(r.scenario).push(r); }
  console.log("| scenario | price calls per run | same body twice |\n|---|---|---|");
  for (const [k, rs] of by) console.log(`| ${k} | ${rs.map((r) => r.priceCalls).join("/")} | ${rs.map((r) => r.duplicateBodies).join("/")} |`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(LAUNCH);
  try {
    if (PROFILE) {
      const [type, step] = PROFILE.split(":");
      const key = await makeDraft(browser, type);
      const p = await newPage(browser, true);
      const r = await act(p, "cold", step, () => p.page.goto(stepUrl(key, type, step), { waitUntil: "commit" }), { full: true });
      const base = path.join(OUT, `${LABEL}-profile-${type}-${step}`);
      fs.writeFileSync(`${base}.trace.json`, JSON.stringify({ traceEvents: r.events }));
      const head = JSON.stringify({ ...r, events: undefined, bodies: undefined });
      const sum = profileSummary(r.events, path.resolve(__dirname, "../apps/web/dist"));
      fs.writeFileSync(`${base}.txt`, `${head}\n\n${sum}`);
      console.log(head); console.log(sum);
      await p.ctx.close();
      return;
    }
    if (process.argv.includes("--price")) return await priceProbe(browser);
    const rows = [];
    for (let run = 1; run <= RUNS; run++) {
      rows.push(...(await runHome(browser, run)));
      for (const type of TYPES) {
        const rs = await runType(browser, type, run);
        rows.push(...rs);
        for (const r of rs) console.error(JSON.stringify({ type: r.type, run, step: r.step, action: r.name, blocked: r.blockedMs, longest: r.longestMs, visible: r.visibleMs, interactive: r.interactiveMs, price: r.priceCalls, chunks: r.chunks }));
      }
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.writeFileSync(path.join(OUT, `${LABEL}-${stamp}.json`), JSON.stringify(rows, null, 1));
    const table = summarize(rows);
    fs.writeFileSync(path.join(OUT, `${LABEL}-${stamp}.md`), table + "\n");
    console.log(table);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
