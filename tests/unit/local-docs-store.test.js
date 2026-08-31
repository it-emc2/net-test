/**
 * @jest-environment jsdom
 *
 * Drafts saved on site but not yet synced.
 *
 * OfflineSaveQueue already guarantees a queued save is not lost. What it could
 * not do is give the draft back before it syncs: the list and the load both go
 * through /api/drafts, so offline the morning's work was invisible. This store
 * is the copy that makes it findable.
 */

import { makeIdbStub } from '../helpers/idb-stub.js';

const idb = makeIdbStub();
globalThis.indexedDB = idb.indexedDB;

let store;

const draft = (over = {}) => ({
  key: 'draft:bu:ANG-BU-Meier',
  kind: 'draft',
  offerType: 'bu',
  name: 'ANG-BU-Meier',
  payload: { Kundendaten: { lastName: 'Meier' } },
  ...over,
});

beforeAll(async () => {
  store = await import('../../src/public/LocalDocsStore.js');
});

beforeEach(() => {
  for (const s of idb.stores.values()) s.clear();
});

test('a queued draft can be read back with its payload intact', async () => {
  await store.save(draft());

  const found = await store.get('draft:bu:ANG-BU-Meier');
  expect(found.name).toBe('ANG-BU-Meier');
  expect(found.payload).toEqual({ Kundendaten: { lastName: 'Meier' } });
  expect(found.savedAt).toBeTruthy();
});

test('re-saving the same draft name overwrites instead of duplicating', async () => {
  await store.save(draft({ payload: { v: 1 } }));
  await store.save(draft({ payload: { v: 2 } }));

  expect(await store.countPending()).toBe(1);
  expect((await store.get('draft:bu:ANG-BU-Meier')).payload).toEqual({ v: 2 });
});

test('the list is scoped to the offer type and newest first', async () => {
  await store.save(draft({ key: 'a', name: 'Alt', savedAt: '2026-02-10T08:00:00.000Z' }));
  await store.save(draft({ key: 'b', name: 'Neu', savedAt: '2026-02-10T09:00:00.000Z' }));
  await store.save(draft({ key: 'c', name: 'Anderer Bereich', offerType: 'bwt' }));

  const bu = await store.listPending({ offerType: 'bu' });
  expect(bu.map((d) => d.name)).toEqual(['Neu', 'Alt']);
});

test('the list filters by name, the way the search box does', async () => {
  await store.save(draft({ key: 'a', name: 'ANG-BU-Meier' }));
  await store.save(draft({ key: 'b', name: 'ANG-BU-Schulz' }));

  const hits = await store.listPending({ offerType: 'bu', query: 'schul' });
  expect(hits.map((d) => d.name)).toEqual(['ANG-BU-Schulz']);
});

test('a synced draft disappears — the server search owns it from then on', async () => {
  await store.save(draft());
  await store.markSynced('draft:bu:ANG-BU-Meier');

  expect(await store.get('draft:bu:ANG-BU-Meier')).toBeNull();
  expect(await store.countPending()).toBe(0);
});

test('misses and bad keys resolve rather than throw', async () => {
  await expect(store.get('nope')).resolves.toBeNull();
  await expect(store.get('')).resolves.toBeNull();
  await expect(store.save({ key: '' })).resolves.toBeUndefined();
  await expect(store.markSynced('')).resolves.toBeUndefined();
});
