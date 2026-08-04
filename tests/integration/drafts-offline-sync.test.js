/**
 * Drafts API against a real MongoDB (mongodb-memory-server).
 *
 * Covers the server half of the offline-sync fix: search must order by when
 * the user saved (savedAt), not by when the write reached the server, and a
 * replayed queued save must be idempotent rather than a 409.
 *
 * ponytail: the server is started per test file. One DB-backed suite doesn't
 * justify a jest globalSetup; move it there if a second one shows up, or
 * every worker pays for its own mongod.
 */
import http from 'node:http';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import draftsRouter from '../../src/routes/drafts.js';
import Draft from '../../src/models/Draft.js';
import { makeIdbStub } from '../helpers/idb-stub.js';

const app = express();
app.use(express.json());
app.use('/api/drafts', draftsRouter);

let mongod;
let server;
let baseUrl;
let queue;

// The queue module is a browser module driven by the global fetch, so the
// tests below exercise the actual client/server seam rather than a mock of it.
const idb = makeIdbStub();
globalThis.indexedDB = idb.indexedDB;

const mockedFetch = globalThis.fetch; // tests/setup.js installs a no-network mock

// A real transport, since the setup-file mock never leaves the process. The
// code under test only reads .ok and .status, so that is all this returns.
const realFetch = (url, { method = 'GET', headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      res.resume();
      res.on('end', () =>
        resolve({ ok: res.statusCode < 400, status: res.statusCode }),
      );
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });

const save = (body) => request(app).post('/api/drafts').send(body);
const search = (offerType = 'bu') =>
  request(app).get('/api/drafts/search').query({ offerType });

const draft = (name, savedAt, extra = {}) => ({
  name,
  offerType: 'bu',
  payload: { n: name },
  savedAt,
  ...extra,
});

beforeAll(async () => {
  // First run downloads the mongod binary; later runs hit the local cache.
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'drafts-test' });
  await Draft.init(); // build the unique (offerType, name) index

  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  queue = await import('../../src/public/OfflineSaveQueue.js');
}, 180000);

afterAll(async () => {
  globalThis.fetch = mockedFetch;
  await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  await mongod?.stop();
});

beforeEach(async () => {
  await Draft.deleteMany({});
  idb.data.clear();
  globalThis.fetch = realFetch;
});

test('search orders by savedAt, not by the order the writes arrived', async () => {
  // Written A, B, C — but the user actually saved them A, C, B. Sorting by
  // updatedAt (write time) would give C, B, A.
  await save(draft('A', '2026-07-28T10:00:00.000Z')).expect(201);
  await save(draft('B', '2026-07-28T10:10:00.000Z')).expect(201);
  await save(draft('C', '2026-07-28T10:05:00.000Z')).expect(201);

  const res = await search().expect(200);

  expect(res.body.map((d) => d.name)).toEqual(['B', 'C', 'A']);
});

test('drafts saved before savedAt existed fall back to updatedAt', async () => {
  // Raw insert bypasses the schema default, exactly like a pre-migration doc.
  await Draft.collection.insertOne({
    name: 'legacy',
    offerType: 'bu',
    payload: { n: 'legacy' },
    createdAt: new Date('2026-07-28T09:00:00.000Z'),
    updatedAt: new Date('2026-07-28T09:00:00.000Z'),
  });
  await save(draft('newer', '2026-07-28T10:00:00.000Z')).expect(201);

  const res = await search().expect(200);

  expect(res.body.map((d) => d.name)).toEqual(['newer', 'legacy']);
  expect(res.body[1].savedAt).toBeTruthy(); // surfaced from updatedAt
});

test('replaying the same queued save is idempotent, not a conflict', async () => {
  const body = draft('ANG-BU-Meier', '2026-07-28T10:00:00.000Z', {
    clientSaveId: 'save-abc',
  });

  const first = await save(body).expect(201);
  const replay = await save(body).expect(200); // response was lost, queue retried

  expect(replay.body.id).toBe(first.body.id);
  expect(await Draft.countDocuments({})).toBe(1);
});

test('a different save reusing an existing name is a real 409', async () => {
  await save(
    draft('ANG-BU-Meier', '2026-07-28T10:00:00.000Z', { clientSaveId: 'save-abc' }),
  ).expect(201);

  await save(
    draft('ANG-BU-Meier', '2026-07-28T10:05:00.000Z', { clientSaveId: 'save-xyz' }),
  ).expect(409);

  expect(await Draft.countDocuments({})).toBe(1);
});

test('savedAt round-trips and a malformed one falls back instead of erroring', async () => {
  const ok = await save(draft('good', '2026-07-28T10:00:00.000Z')).expect(201);
  expect(new Date(ok.body.savedAt).toISOString()).toBe('2026-07-28T10:00:00.000Z');

  const bad = await save(draft('bad', 'not-a-date')).expect(201);
  expect(new Date(bad.body.savedAt).getTime()).not.toBeNaN();
});

test('concurrent replays of one save never 500 and never duplicate', async () => {
  // Overlapping sweeps can both pass the existence check before either write
  // commits; the loser hits the unique index. Asserting the invariant rather
  // than the race means this never fails spuriously when they don't overlap.
  const body = draft('ANG-BU-Race', '2026-07-28T10:00:00.000Z', {
    clientSaveId: 'save-race',
  });

  const results = await Promise.all(Array.from({ length: 10 }, () => save(body)));

  expect(results.map((r) => r.status).filter((s) => s >= 400)).toEqual([]);
  expect(await Draft.countDocuments({})).toBe(1);
});

// --- Real client/server round trips: the queue module against the live server.

const offline = () => {
  globalThis.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
};

// The server handles the request normally, but the client never sees the
// response — exactly what a connection dropping mid-flight looks like.
const responseLost = () => {
  globalThis.fetch = async (...args) => {
    await realFetch(...args);
    throw new TypeError('Failed to fetch');
  };
};

const queueSave = (name) =>
  queue.trySaveOrQueue({
    kind: 'draft',
    offerKey: `draft:bu:${name}`,
    url: `${baseUrl}/api/drafts`,
    body: { name, offerType: 'bu', payload: { n: name } },
  });

test('a save whose response is lost is not duplicated on the next sweep', async () => {
  offline();
  const { queued } = await queueSave('ANG-BU-Meier');
  expect(queued).toBe(true);
  expect(await Draft.countDocuments({})).toBe(0);

  // Sweep 1: the write lands, the response does not.
  responseLost();
  await queue.retryAll();
  expect(await Draft.countDocuments({})).toBe(1); // server did create it
  expect(idb.data.size).toBe(1); // client still thinks it is pending

  // Sweep 2: the server recognises the replay by clientSaveId and answers 200.
  globalThis.fetch = realFetch;
  await queue.retryAll();
  expect(await Draft.countDocuments({})).toBe(1); // no duplicate
  expect(idb.data.size).toBe(0); // queue drained
  expect(await Draft.findOne({ name: 'ANG-BU-Meier' })).toBeTruthy(); // not renamed
});

test('three offline saves sync in save order and list newest first', async () => {
  offline();
  for (const name of ['ANG-BU-1000', 'ANG-BU-1005', 'ANG-BU-1010']) {
    await queueSave(name);
    await new Promise((r) => setTimeout(r, 5)); // distinct savedAt stamps
  }
  expect(idb.data.size).toBe(3);

  globalThis.fetch = realFetch;
  await queue.retryAll();

  expect(idb.data.size).toBe(0);
  const res = await search().expect(200);
  expect(res.body.map((d) => d.name)).toEqual([
    'ANG-BU-1010',
    'ANG-BU-1005',
    'ANG-BU-1000',
  ]);
});
