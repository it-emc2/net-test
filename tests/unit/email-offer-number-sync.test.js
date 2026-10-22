/**
 * @jest-environment jsdom
 *
 * A reopened offer restores its saved mail subject/body, which marks both as
 * touched, so "Neue Version erstellen" never rebuilt them and the customer
 * mail + Bitrix comment kept the previous offer number (37 customer sends,
 * Feb–Oct 2026). The number must follow the new version; the rest of the
 * hand-edited text must stay.
 */

import { initEmailManager } from '../../src/public/EmailManager.js';

test('new offer version replaces the old ANG number in a touched subject/body', () => {
  document.body.innerHTML = `
    <button id="sendOfferMail"></button><input id="offerNumber" value="ANG2026-0101-111111">
    <input id="mailTo"><input id="mailCc"><input id="mailSubject"><textarea id="mailBody"></textarea>
    <iframe id="mailHtmlPreview"></iframe><input id="mailAuftragId"><input id="auftragId">
    <input type="checkbox" id="mailAntragGestellt"><input type="file" id="mailAttachments">
    <input type="file" id="mailEditedDocx"><div id="mailAttachmentList"></div><div id="mailStatus"></div>`;
  initEmailManager({ hooks: {} });

  const subject = document.getElementById('mailSubject');
  const body = document.getElementById('mailBody');
  // what RestoreManager does: set the saved text and fire input → touched
  subject.value = 'emc2 | Ihr Angebot ANG2026-0101-111111 zum Badumbau – Rückfrage';
  subject.dispatchEvent(new Event('input'));
  body.value = 'anbei Ihr Angebot ANG2026-0101-111111.\nPersönliche Notiz';
  body.dispatchEvent(new Event('input'));

  document.getElementById('offerNumber').value = 'ANG2026-0202-222222';
  window.dispatchEvent(new CustomEvent('offerflow:changed'));

  expect(subject.value).toBe('emc2 | Ihr Angebot ANG2026-0202-222222 zum Badumbau – Rückfrage');
  expect(body.value).toBe('anbei Ihr Angebot ANG2026-0202-222222.\nPersönliche Notiz');
});
