/**
 * @jest-environment jsdom
 *
 * Offline save queue replay.
 *
 * Bug: IndexedDB getAll() returns primary-key order and the primary key is a
 * random UUID, so queued saves replayed in a random order. The server stamps
 * its timestamps at replay time, so the draft list showed a random one of the
 * offline saves as "newest". A 409 on replay also silently dropped the payload.
 */

import { jest } from '@jest/globals';

import { makeIdbStub } from '../helpers/idb-stub.js';

const idb = makeIdbStub();
globalThis.indexedDB = idb.indexedDB;

let queue;

const draftRecord = (id, createdAt, name) => ({
  id,
  kind: 'draft',
  offerKey: `draft:bu:${name}`,
  url: '/api/drafts',
  body: { name, offerType: 'bu', payload: { n: name }, savedAt: createdAt, clientSaveId: id },
  createdAt,
});

// Filters to actual queue POSTs — the connection-status dot's health-check
// probe (GET /api/version, no body) also goes through this same fetch mock.
const postedNames = () =>
  globalThis.fetch.mock.calls
    .filter((c) => c[1]?.body)
    .map((c) => JSON.parse(c[1].body).name);

beforeAll(async () => {
  globalThis.fetch = jest.fn(async () => ({ ok: true, status: 201 }));
  window.toast = { success: jest.fn(), warn: jest.fn(), error: jest.fn() };
  // jsdom has no crypto.randomUUID, and it is a non-writable getter, so patch
  // the method on the existing object rather than replacing it.
  if (!globalThis.crypto?.randomUUID) {
    let n = 0;
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: () => `test-uuid-${String(++n).padStart(4, '0')}`,
    });
  }
  queue = await import('../../src/public/OfflineSaveQueue.js');

  // renderBadge() also drives the permanent header dot; give it an element
  // to find. The real one lives in index.html's <header>, out of scope here.
  const dot = document.createElement('span');
  dot.id = 'connStatus';
  document.body.appendChild(dot);
});

beforeEach(() => {
  idb.data.clear();
  globalThis.fetch.mockReset();
  globalThis.fetch.mockResolvedValue({ ok: true, status: 201 });
});

test('replays queued saves in save order, not IndexedDB key order', async () => {
  // Keys sort c < ... no: "aaa" < "bbb" < "ccc", so getAll() yields B, C, A —
  // the order the user did NOT save in.
  idb.data.set('ccc111', draftRecord('ccc111', '2026-07-28T10:00:00.000Z', 'A'));
  idb.data.set('aaa111', draftRecord('aaa111', '2026-07-28T10:05:00.000Z', 'B'));
  idb.data.set('bbb111', draftRecord('bbb111', '2026-07-28T10:10:00.000Z', 'C'));

  await queue.retryAll();

  expect(postedNames()).toEqual(['A', 'B', 'C']);
  expect(idb.data.size).toBe(0);
});

test('a 409 on a draft re-saves under a new name instead of dropping the payload', async () => {
  idb.data.set('abc123', draftRecord('abc123', '2026-07-28T10:00:00.000Z', 'ANG-BU-Meier'));

  globalThis.fetch
    .mockResolvedValueOnce({ ok: false, status: 409 })
    .mockResolvedValueOnce({ ok: true, status: 201 });

  await queue.retryAll();

  expect(postedNames()).toEqual(['ANG-BU-Meier', 'ANG-BU-Meier-offline-abc123']);
  expect(idb.data.size).toBe(0); // synced, not silently discarded
  expect(window.toast.warn).toHaveBeenCalled();
});

test('a draft stays queued under its new name if the re-save also fails', async () => {
  idb.data.set('abc123', draftRecord('abc123', '2026-07-28T10:00:00.000Z', 'ANG-BU-Meier'));

  globalThis.fetch
    .mockResolvedValueOnce({ ok: false, status: 409 })
    .mockResolvedValueOnce({ ok: false, status: 500 });

  await queue.retryAll();

  expect(idb.data.get('abc123').body.name).toBe('ANG-BU-Meier-offline-abc123');
});

test('a queued save that is still offline is kept for the next sweep', async () => {
  idb.data.set('abc123', draftRecord('abc123', '2026-07-28T10:00:00.000Z', 'ANG-BU-Meier'));
  globalThis.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

  await queue.retryAll();

  expect(idb.data.size).toBe(1);
});

test('a record the server keeps rejecting is parked instead of retried forever', async () => {
  // Not being offline: postRecord returns null then and nothing is counted.
  // This is a real server answer that will never succeed — a malformed
  // payload, say. Retrying it every sweep keeps the badge permanently at
  // "wird synchronisiert", which reads as a slow sync rather than a failure.
  idb.data.set('bad001', draftRecord('bad001', '2026-07-28T10:00:00.000Z', 'Broken'));
  globalThis.fetch.mockResolvedValue({ ok: false, status: 400 });

  for (let i = 0; i < 8; i++) await queue.retryAll();

  const record = idb.data.get('bad001');
  expect(record.stuck).toBe(true);
  expect(record.failures).toBe(5);          // MAX_ATTEMPTS, then it stops
  expect(globalThis.fetch).toHaveBeenCalledTimes(5);
  expect(window.toast.error).toHaveBeenCalled();
});

test('parking one record does not stop the others syncing', async () => {
  idb.data.set('bad001', { ...draftRecord('bad001', '2026-07-28T10:00:00.000Z', 'Broken'), stuck: true });
  idb.data.set('ok0001', draftRecord('ok0001', '2026-07-28T10:05:00.000Z', 'Fine'));
  globalThis.fetch.mockResolvedValue({ ok: true, status: 201 });

  await queue.retryAll();

  expect(postedNames()).toEqual(['Fine']);   // the stuck one is not retried
  expect(idb.data.has('ok0001')).toBe(false);
  expect(idb.data.has('bad001')).toBe(true); // kept, so it stays visible
});

test('a synced draft releases its local copy so the list stops showing it twice', async () => {
  const local = await import('../../src/public/LocalDocsStore.js');
  const record = draftRecord('sync01', '2026-07-28T10:00:00.000Z', 'ANG-BU-Meier');
  idb.data.set('sync01', record);
  await local.save({
    key: record.offerKey,
    kind: 'draft',
    offerType: 'bu',
    name: 'ANG-BU-Meier',
    payload: { n: 1 },
  });
  expect(await local.get(record.offerKey)).not.toBeNull();

  globalThis.fetch.mockResolvedValue({ ok: true, status: 201 });
  await queue.retryAll();

  // On the server now, so the normal drafts search owns it.
  expect(await local.get(record.offerKey)).toBeNull();
});

describe('durability mirror', () => {
  test('restores evicted records and reports how many came back', async () => {
    // IndexedDB is evictable and WebKit refuses persistent storage, so on the
    // iPad the native shell keeps a copy of the queue outside the web view.
    // This is that copy being handed back after the browser threw it away.
    const evicted = [
      draftRecord('aaa111', '2026-07-28T10:00:00.000Z', 'Meier'),
      draftRecord('bbb222', '2026-07-28T10:05:00.000Z', 'Schulz'),
    ];

    expect(idb.data.size).toBe(0);              // as if evicted
    expect(await queue.restoreRecords(evicted)).toBe(2);
    expect([...idb.data.keys()].sort()).toEqual(['aaa111', 'bbb222']);
  });

  test('never clobbers a record that is already there', async () => {
    // The live queue is at least as fresh as a mirror taken earlier — the
    // mirror must not resurrect a stale copy of a record still in flight.
    const live = draftRecord('aaa111', '2026-07-28T11:00:00.000Z', 'Current');
    idb.data.set('aaa111', live);

    const stale = draftRecord('aaa111', '2026-07-28T10:00:00.000Z', 'Stale');
    expect(await queue.restoreRecords([stale, draftRecord('ccc333', '2026-07-28T10:30:00.000Z', 'New')])).toBe(1);

    expect(idb.data.get('aaa111').body.name).toBe('Current');
    expect(idb.data.has('ccc333')).toBe(true);
  });

  test('an empty or malformed mirror is a no-op, not a crash', async () => {
    for (const bad of [[], null, undefined, 'nonsense']) {
      expect(await queue.restoreRecords(bad)).toBe(0);
    }
    expect(idb.data.size).toBe(0);
  });

  test('the mirror is told about every queue change', async () => {
    const seen = [];
    const stop = queue.onQueueChanged((records) => seen.push(records.length));

    globalThis.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await queue.trySaveOrQueue({
      kind: 'draft',
      offerKey: 'draft:bu:Mirror',
      url: '/api/drafts',
      body: { name: 'Mirror', offerType: 'bu', payload: {} },
    });
    expect(seen).toEqual([1]);                  // queued -> mirrored

    globalThis.fetch.mockResolvedValue({ ok: true, status: 201 });
    await queue.retryAll();
    expect(seen).toEqual([1, 0]);               // synced -> mirror cleared

    stop();
  });
});

describe('foreground flush', () => {
  test('coming back to the app sweeps the queue', async () => {
    // `online` only fires when the interface changes, so a server that was
    // unreachable for any other reason never triggers a sweep — and iOS
    // resumes a backgrounded web app rather than reloading it, so the boot
    // sweep does not re-run either.
    idb.data.set('vis001', draftRecord('vis001', '2026-07-28T10:00:00.000Z', 'Foreground'));
    globalThis.fetch.mockResolvedValue({ ok: true, status: 201 });

    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 0));

    expect(postedNames()).toEqual(['Foreground']);
    expect(idb.data.size).toBe(0);
  });

  test('overlapping sweeps do not re-post the same record', async () => {
    idb.data.set('dup001', draftRecord('dup001', '2026-07-28T10:00:00.000Z', 'Once'));

    // Hold the first POST open so the second sweep starts while it is in
    // flight — the situation three triggers firing together produce.
    let release;
    globalThis.fetch.mockImplementation(
      () => new Promise((resolve) => { release = () => resolve({ ok: true, status: 201 }); }),
    );

    // `sweeping` is set synchronously before the first await, so the second
    // call hits the guard even though the first has not reached its POST yet.
    const first = queue.retryAll();
    const second = queue.retryAll();   // must be a no-op, not a second sweep

    while (!release) await new Promise((r) => setTimeout(r, 0));
    release();
    await Promise.all([first, second]);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(idb.data.size).toBe(0);
  });
});

describe('connection status dot', () => {
  const setOnline = (value) =>
    Object.defineProperty(navigator, 'onLine', { value, configurable: true });

  afterEach(() => setOnline(true));

  test('offline interface wins regardless of the queue', async () => {
    setOnline(false);
    await queue.renderBadge();
    expect(document.getElementById('connStatus').dataset.state).toBe('offline');
  });

  test('online with a queued record shows syncing', async () => {
    idb.data.set('sync001', draftRecord('sync001', '2026-07-28T10:00:00.000Z', 'Pending'));
    await queue.renderBadge();
    expect(document.getElementById('connStatus').dataset.state).toBe('syncing');
  });

  test('online with an empty queue shows synced', async () => {
    await queue.renderBadge();
    expect(document.getElementById('connStatus').dataset.state).toBe('synced');
  });

  // window.__nativeReachable is the native iPad shell's override (see
  // WebViewController.swift's networkWentAway()/networkCameBack()) for when
  // navigator.onLine is simply wrong — measured staying true for an entire
  // offline session where the interface was fine but the server was down.
  describe('native shell override (window.__nativeReachable)', () => {
    afterEach(() => { delete window.__nativeReachable; });

    test('false overrides navigator.onLine === true', async () => {
      window.__nativeReachable = false;
      await queue.renderBadge();
      expect(document.getElementById('connStatus').dataset.state).toBe('offline');
    });

    test('true does not mask a real navigator.onLine === false', async () => {
      window.__nativeReachable = true;
      setOnline(false);
      await queue.renderBadge();
      expect(document.getElementById('connStatus').dataset.state).toBe('offline');
    });

    test('undefined (plain browser, no native shell) defers to navigator.onLine', async () => {
      expect(window.__nativeReachable).toBeUndefined();
      await queue.renderBadge();
      expect(document.getElementById('connStatus').dataset.state).toBe('synced');
    });
  });
});
