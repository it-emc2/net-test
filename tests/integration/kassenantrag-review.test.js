/**
 * LP checks every Kassenantrag before it goes out (four eyes): the rep can
 * only submit, the send needs a submitted draft and a different user.
 * Real MongoDB (mongodb-memory-server); Bitrix/SMTP are not reachable here,
 * so the task call fails softly and the send stops at the SMTP check.
 */
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import signingRouter from '../../src/routes/signing.js';
import SigningRequest from '../../src/models/SigningRequest.js';

const app = express();
app.use((req, _res, next) => { req.user = { email: req.get('x-user') }; next(); });
app.use('/api/signing', signingRouter);

let mongod;
const body = {
  measures: ['Demontage der Badewanne', 'Einbau der Duschwanne'],
  individualReason: 'Die vorhandene Wanne ist trotz Haltegriff nicht mehr sicher zu betreten.',
  answers: { wohnsituation: 'Eigentum', weitere: 0, zweck: ['erleichtert'] },
};
const call = (path, user) =>
  request(app).post(`/api/signing/status/ANG-1/kassenantrag${path}`).set('x-user', user).send(body);

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  delete process.env.SMTP_HOST;
  delete process.env.KASSENANTRAG_DIRECT_SEND;
  await SigningRequest.create({
    token: 't1', offerNumber: 'ANG-1', offerType: 'bu', status: 'completed', customerType: 'KASSE',
    documents: [{ key: 'angebot' }, { key: 'abtretung' }],
    prefill: { firstName: 'Else', lastName: 'Fröhlich', geburtsdatum: '1946-04-13' },
    payloadSnapshot: { Kundendaten: { kassenkundeName: 'Barmer', kk_versichertennr: 'G1' } },
  });
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

test('rep submits, cannot send; LP can', async () => {
  expect((await call('/send', 'tr@x.de')).status).toBe(403); // nothing submitted yet

  const sub = await call('/submit', 'tr@x.de');
  expect(sub.status).toBe(200);
  expect(sub.body.draft).toMatchObject({ status: 'review', submittedBy: 'tr@x.de' });

  expect((await call('/send', 'tr@x.de')).status).toBe(403); // own draft
  const lp = await call('/send', 'lp@x.de');
  expect(lp.status).not.toBe(403); // past the guard (stops at SMTP here)

  const get = await request(app).get('/api/signing/status/ANG-1/kassenantrag').set('x-user', 'lp@x.de');
  expect(get.body).toMatchObject({ canSend: true, draft: { individualReason: body.individualReason } });
}, 30000);
