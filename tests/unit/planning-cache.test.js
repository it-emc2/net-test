/**
 * @jest-environment jsdom
 *
 * Offline "Heutige Planung".
 *
 * The primary field use case is starting an offer from a planned appointment
 * with the customer's Bitrix data prefilled. Offline that used to collapse
 * entirely: /api/planning/current failed, the list rendered "Fehler beim Laden
 * der Planungstermine", and enrichPlanningAppointmentFromBitrix could not
 * supply the Anrede — the route-planning service carries no HONORIFIC field,
 * so it stayed blank and everything had to be typed by hand.
 */

import { jest } from '@jest/globals';

import { makeIdbStub } from '../helpers/idb-stub.js';

const idb = makeIdbStub();
globalThis.indexedDB = idb.indexedDB;

let cache;

const ENTRY_WITH_DEAL = { importDealId: '4711', contactId: '99' };
const ENTRY_CONTACT_ONLY = { contactId: '99' };

beforeAll(async () => {
  cache = await import('../../src/public/PlanningCache.js');
});

beforeEach(() => {
  for (const store of idb.stores.values()) store.clear();
});

describe('snapshot', () => {
  test('round-trips the whole-week payload verbatim', async () => {
    // The real payload carries the full week, not just today — this is why
    // caching it needs no extra endpoint.
    const payload = {
      planning: {
        days: [{ customers: [{ name: 'Meier, Hans' }] }],
        futurePlanned: [{ name: 'Schulz, Eva', plannedDate: '2026-02-12' }],
      },
    };

    await cache.saveSnapshot(payload);
    const record = await cache.loadSnapshot();

    expect(record.payload).toEqual(payload);
    expect(record.fetchedAt).toBeTruthy();
  });

  test('an empty cache reports nothing rather than a blank week', async () => {
    // The caller must be able to tell "no cache" from "cached empty week",
    // otherwise it would render an empty list instead of its error state.
    expect(await cache.loadSnapshot()).toBeNull();
  });

  test('a refresh overwrites rather than accumulating', async () => {
    await cache.saveSnapshot({ planning: { days: [] } });
    await cache.saveSnapshot({ planning: { days: [{ customers: [{ name: 'Neu' }] }] } });

    const record = await cache.loadSnapshot();
    expect(record.payload.planning.days).toHaveLength(1);
    expect(idb.stores.get('snapshot').size).toBe(1);
  });
});

describe('enrichment', () => {
  test('keys prefer the deal, matching how the enrich path resolves', async () => {
    // enrichPlanningAppointmentFromBitrix tries the deal first and only falls
    // back to the contact, so writes and look-ups must agree on the same key.
    expect(cache.enrichmentKey(ENTRY_WITH_DEAL)).toBe('d:4711');
    expect(cache.enrichmentKey(ENTRY_CONTACT_ONLY)).toBe('c:99');
    expect(cache.enrichmentKey({})).toBe('');
  });

  test('round-trips the fields the planning service cannot supply', async () => {
    const key = cache.enrichmentKey(ENTRY_WITH_DEAL);
    await cache.saveEnrichment(key, { salutation: 'Frau', email: 'eva@example.de' });

    const record = await cache.loadEnrichment(key);
    expect(record.salutation).toBe('Frau');
    expect(record.email).toBe('eva@example.de');
  });

  test('entries are kept apart per appointment', async () => {
    await cache.saveEnrichment('d:4711', { salutation: 'Herr' });
    await cache.saveEnrichment('c:99', { salutation: 'Frau' });

    expect((await cache.loadEnrichment('d:4711')).salutation).toBe('Herr');
    expect((await cache.loadEnrichment('c:99')).salutation).toBe('Frau');
  });

  test('a miss resolves to null instead of throwing', async () => {
    expect(await cache.loadEnrichment('d:does-not-exist')).toBeNull();
    expect(await cache.loadEnrichment('')).toBeNull();
  });

  test('freshness gates the week-warming re-fetch', async () => {
    const TTL = 12 * 60 * 60 * 1000;
    expect(cache.isFresh({ fetchedAt: new Date().toISOString() }, TTL)).toBe(true);
    expect(
      cache.isFresh({ fetchedAt: new Date(Date.now() - TTL - 1000).toISOString() }, TTL),
    ).toBe(false);
    // No record and a corrupt record must both re-fetch, never skip.
    expect(cache.isFresh(null, TTL)).toBe(false);
    expect(cache.isFresh({ fetchedAt: 'nonsense' }, TTL)).toBe(false);
  });
});

describe('failure handling', () => {
  test('a broken IndexedDB degrades to a cache miss, it does not throw', async () => {
    // Safari can refuse IndexedDB outright (private browsing, evicted origin).
    // That must cost the cache, not the page.
    jest.resetModules();
    globalThis.indexedDB = {
      open: () => {
        const req = { error: new Error('denied') };
        queueMicrotask(() => req.onerror?.());
        return req;
      },
    };
    const broken = await import('../../src/public/PlanningCache.js');

    await expect(broken.loadSnapshot()).resolves.toBeNull();
    await expect(broken.loadEnrichment('d:1')).resolves.toBeNull();
    await expect(broken.saveSnapshot({ planning: {} })).resolves.toBeUndefined();

    globalThis.indexedDB = idb.indexedDB;
  });
});
