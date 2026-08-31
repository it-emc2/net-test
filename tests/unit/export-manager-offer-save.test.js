/**
 * @jest-environment jsdom
 *
 * ExportManager's final-offer snapshot must go through the offline save queue.
 *
 * Bug: saveFinalOfferSnapshot() posted to /api/offers with a bare fetch wrapped
 * in try/catch. A fetch only throws on network failure, so losing signal
 * between the PDF response and this save discarded the offer silently — the
 * catch logged it and moved on. script.js's same-named function already used
 * trySaveOrQueue; this one was the odd copy out.
 *
 * The assertion that matters: a failed POST leaves a queued record behind.
 */

import { jest } from '@jest/globals';

import { makeIdbStub } from '../helpers/idb-stub.js';

const idb = makeIdbStub();
globalThis.indexedDB = idb.indexedDB;

let initExportManager;

const PAYLOAD = { activeOffer: 'bu', Kundendaten: { lastName: 'Meier' } };

// Minimal cfg: enough for saveFinalOfferSnapshot, nothing else. init() guards
// every DOM lookup, so an empty document is fine.
const makeManager = () =>
  initExportManager({
    offerNumberEl: () => ({ value: 'ANG2026-0210-120000' }),
    buildPayload: () => PAYLOAD,
    filterPayloadByOffer: (p) => p,
    getCurrentOfferType: () => 'bu',
    updatePricing: async () => ({ total: 42 }),
  });

const postedBodies = () =>
  globalThis.fetch.mock.calls
    .filter((c) => c[0] === '/api/offers')
    .map((c) => JSON.parse(c[1].body));

beforeAll(async () => {
  globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200 }));
  window.toast = { success: jest.fn(), warn: jest.fn(), error: jest.fn() };
  // jsdom's crypto has no randomUUID; trySaveOrQueue needs it for the record
  // id. `crypto` is a non-writable getter on the jsdom window, so patch the
  // method on the existing object rather than replacing it.
  if (!globalThis.crypto?.randomUUID) {
    let n = 0;
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: () => `test-uuid-${String(++n).padStart(4, '0')}`,
    });
  }
  ({ initExportManager } = await import('../../src/public/ExportManager.js'));
});

beforeEach(() => {
  idb.data.clear();
  window.__pricing = null;
  globalThis.fetch.mockReset();
  globalThis.fetch.mockResolvedValue({ ok: true, status: 200 });
});

test('online: posts the offer and queues nothing', async () => {
  await makeManager().saveFinalOfferSnapshot();

  const bodies = postedBodies();
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({
    offerNumber: 'ANG2026-0210-120000',
    offerType: 'bu',
    payload: PAYLOAD,
    pricing: { total: 42 },
  });
  // trySaveOrQueue stamps these on every save, online or queued. The offers
  // route destructures only the fields it needs, so they are ignored there.
  expect(bodies[0].savedAt).toBeTruthy();
  expect(bodies[0].clientSaveId).toBeTruthy();

  expect(idb.data.size).toBe(0);
});

test('offline: the offer is queued for sync instead of being lost', async () => {
  globalThis.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

  await makeManager().saveFinalOfferSnapshot();

  expect(idb.data.size).toBe(1);
  const [record] = [...idb.data.values()];
  expect(record.kind).toBe('offer');
  expect(record.url).toBe('/api/offers');
  expect(record.offerKey).toBe('ANG2026-0210-120000');
  expect(record.body.payload).toEqual(PAYLOAD);
  // Stamped by trySaveOrQueue so the server sees the user's save time and can
  // recognise a replay of this exact save.
  expect(record.body.savedAt).toBeTruthy();
  expect(record.body.clientSaveId).toBeTruthy();

  // The user has to know the offer has not reached the server yet.
  expect(window.toast.warn).toHaveBeenCalled();
});

test('server rejects: surfaces the error rather than failing silently', async () => {
  globalThis.fetch.mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => ({ error: 'Serverfehler' }),
  });

  await makeManager().saveFinalOfferSnapshot();

  expect(window.toast.error).toHaveBeenCalled();
  expect(idb.data.size).toBe(0); // a real server answer is not a queueable failure
});
