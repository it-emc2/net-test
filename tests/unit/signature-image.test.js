/**
 * Audit S-10: the submitted signature must be a strict PNG data URL before it
 * is stored or placed into the HTML rendered into the signed PDF.
 */
import { isValidSignatureDataUrl, MAX_SIGNATURE_DATA_URL_LENGTH } from '../../src/lib/signatureImage.js';
import { buildVollmachtHtml } from '../../src/templates/signing-docs.js';

// 1×1 transparent PNG
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('accepts a real PNG data URL', () => {
  expect(isValidSignatureDataUrl(PNG)).toBe(true);
});

test.each([
  ['missing prefix', PNG.replace('data:image/png;base64,', '')],
  ['markup after the prefix', 'data:image/png;base64,AAAA" onerror="alert(1)'],
  ['tag injection', 'data:image/png;base64,iVBOR"><script>fetch("http://10.0.0.1")</script>'],
  ['other mime type', PNG.replace('image/png', 'image/svg+xml')],
  ['not a PNG after decoding', 'data:image/png;base64,' + Buffer.from('<svg xmlns="x"></svg>').toString('base64')],
  ['too large', PNG + 'A'.repeat(MAX_SIGNATURE_DATA_URL_LENGTH)],
  ['not a string', { toString: () => PNG }],
  ['empty', ''],
])('rejects %s', (_label, value) => {
  expect(isValidSignatureDataUrl(value)).toBe(false);
});

test('the PDF template never places an invalid stored signature into the page', () => {
  const sr = { prefill: { firstName: 'A', lastName: 'B', city: 'Hof' }, payloadSnapshot: { Kundendaten: {} } };
  const evil = 'data:image/png;base64,x"><img src="http://10.0.0.1/x">';
  const bad = buildVollmachtHtml(sr, { key: 'vollmacht', status: 'signed', signatureImage: evil }, 'pdf');
  expect(bad).not.toContain('10.0.0.1');
  const good = buildVollmachtHtml(sr, { key: 'vollmacht', status: 'signed', signatureImage: PNG }, 'pdf');
  expect(good).toContain(`src="${PNG}"`);
});
