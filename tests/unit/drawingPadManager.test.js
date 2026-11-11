/**
 * @jest-environment jsdom
 *
 * Sketch pad (DrawingPadManager): restoring into a pad on a hidden page must
 * not poll requestAnimationFrame forever (Audit F-03), and the PNG export must
 * happen once per stroke, not on every pointer move (Audit F-02).
 */
import { jest } from "@jest/globals";
import { initDrawingPadManager } from "../../src/public/DrawingPadManager.js";

function makePad({ visible }) {
  document.body.innerHTML = `
    <div class="project-sketch" data-sketch-key="t">
      <canvas class="project-sketch__canvas"></canvas>
      <input id="tSketchDataUrl" type="hidden" />
      <input id="tSketchJson" type="hidden" />
    </div>`;
  const root = document.querySelector(".project-sketch");
  const canvas = root.querySelector("canvas");
  const size = { w: visible ? 600 : 0, h: visible ? 300 : 0 };
  canvas.getBoundingClientRect = () => ({ width: size.w, height: size.h, left: 0, top: 0 });
  const ctx = new Proxy({}, { get: () => () => {} , set: () => true });
  canvas.getContext = () => ctx;
  let exports = 0;
  canvas.toDataURL = () => {
    exports += 1;
    return `data:image/png;base64,EXPORT${exports}`;
  };
  canvas.setPointerCapture = () => {};
  const pad = initDrawingPadManager({ root });
  return {
    pad, root, canvas, size,
    exports: () => exports,
    hidden: () => ({
      dataUrl: root.querySelector("#tSketchDataUrl").value,
      json: root.querySelector("#tSketchJson").value,
    }),
  };
}

const savedJson = JSON.stringify({ version: 1, ops: [{ type: "stroke", tool: "pen", points: [{ x: 1, y: 1 }, { x: 5, y: 5 }] }] });

afterEach(() => {
  jest.useRealTimers();
  delete window.ResizeObserver;
});

test("restore into a hidden pad keeps the saved sketch and stops polling", async () => {
  jest.useFakeTimers();
  const raf = jest.fn((cb) => setTimeout(cb, 16));
  window.requestAnimationFrame = raf;
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  const t = makePad({ visible: false });

  await t.pad.setFromSaved({ json: savedJson, dataUrl: "data:image/png;base64,SAVED" });
  // Hidden fields carry the saved values right away (a save keeps the sketch).
  expect(t.hidden()).toEqual({ json: JSON.stringify(JSON.parse(savedJson)), dataUrl: "data:image/png;base64,SAVED" });
  expect(t.exports()).toBe(0);

  jest.advanceTimersByTime(10_000);
  const callsAfterGiveUp = raf.mock.calls.length;
  jest.advanceTimersByTime(10_000);
  expect(raf.mock.calls.length).toBe(callsAfterGiveUp); // loop ended

  // Page shown later → drawn and exported once.
  t.size.w = 600;
  t.size.h = 300;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  jest.advanceTimersByTime(100);
  expect(t.exports()).toBeGreaterThanOrEqual(1);
  expect(t.hidden().dataUrl).toMatch(/EXPORT/);
});

test("a stroke exports the PNG once at the end, not on every move", () => {
  const t = makePad({ visible: true });
  const ev = (type, x, y) => {
    const e = new Event(type);
    Object.assign(e, { clientX: x, clientY: y, pointerId: 1 });
    t.canvas.dispatchEvent(e);
  };
  // One finished stroke first, so the pad is not empty during the next one.
  ev("pointerdown", 1, 1);
  ev("pointerup", 1, 1);
  const before = t.exports();
  ev("pointerdown", 10, 10);
  for (let i = 0; i < 50; i += 1) ev("pointermove", 10 + i, 10 + i);
  expect(t.exports()).toBe(before);
  ev("pointerup", 60, 60);
  expect(t.exports()).toBe(before + 1);
  expect(JSON.parse(t.hidden().json).ops[1].points).toHaveLength(51);
});
