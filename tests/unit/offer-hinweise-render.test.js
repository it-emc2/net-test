// Real render of the shipped offer templates (docxtemplater, no mocks, no LibreOffice):
// the extra Hinweise lines must appear in every template, and wording rules must also
// reach the template's own fixed sentences.
import { jest } from '@jest/globals';
import { SaxesParser } from 'saxes';
import path from 'path';
import PizZip from 'pizzip';
import { renderDocx } from '../../src/routes/docx-template.js';
import { replaceTextInHtml } from '../../src/lib/docxTextReplace.js';

// the full parallel run is slow enough to blow the default 10 s on the first real render
jest.setTimeout(60000);

const TEMPLATES = ['Angebot-10', 'Angebot-BU-KK-2', 'Angebot-BWT', 'Angebot-HL', 'Angebot-BL'];
const tpl = (n) => path.join(process.cwd(), 'src', 'templates', `${n}.docx`);
const textOf = (buf) =>
  new PizZip(buf).file('word/document.xml').asText()
    .replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
const data = (extra = []) => ({
  Nachname: 'Muster', Angebotsnummer: 'ANG2026-1103-101010',
  ExtraHinweise: extra.map((Text) => ({ Text })),
});

test.each(TEMPLATES)('%s renders extra Hinweise as own lines, none when empty', async (name) => {
  const withHints = textOf(await renderDocx(tpl(name), data(['Zusatz A', 'Zusatz B & Co'])));
  expect(withHints.split('\n')).toEqual(expect.arrayContaining(['Zusatz A', 'Zusatz B & Co']));
  expect(withHints).not.toContain('ExtraHinweise'); // no raw tag left behind
  const without = textOf(await renderDocx(tpl(name), data()));
  expect(without).not.toContain('Zusatz A');
  expect(without).not.toContain('{');
});

test.each(TEMPLATES)('%s: wording rule replaces the fixed Festpreis sentence', async (name) => {
  const buf = await renderDocx(tpl(name), data(), [{ from: 'Festpreisangebot', to: 'Pauschalangebot' }]);
  const txt = textOf(buf);
  expect(txt).toContain('um ein Pauschalangebot für die oben definierten Leistungen');
  expect(txt).not.toContain('Festpreisangebot');
});

test('a rule split over several runs and a rule that matches nothing', async () => {
  const buf = await renderDocx(tpl('Angebot-10'), data(), [
    { from: 'Für eine Teilbeauftragung wäre ein neues Angebot erforderlich', to: 'Teilbeauftragung nur nach neuem Angebot' },
    { from: 'gibt-es-nicht', to: 'x' },
  ]);
  expect(textOf(buf)).toContain('Teilbeauftragung nur nach neuem Angebot.');
  // untouched template stays byte-identical in text when no rule applies
  const plain = textOf(await renderDocx(tpl('Angebot-10'), data()));
  const noop = textOf(await renderDocx(tpl('Angebot-10'), data(), [{ from: 'gibt-es-nicht', to: 'x' }]));
  expect(noop).toBe(plain);
});

test('HTML text nodes change, markup does not', () => {
  const html = '<div class="Gleittür">Gleittür 90</div>';
  expect(replaceTextInHtml(html, [{ from: 'Gleittür', to: 'Flexibel' }])).toBe('<div class="Gleittür">Flexibel 90</div>');
});

test('signing page: extra Hinweise listed, fixed sentences follow the wording rules', async () => {
  const { buildAngebotHtml } = await import('../../src/templates/signing-docs.js');
  const html = buildAngebotHtml({
    PayerKind: 'SZ', Totals: [],
    ExtraHinweise: [{ Text: 'Zusatz <A>' }],
    TextReplacements: [{ from: 'Festpreisangebot', to: 'Pauschalangebot' }],
  });
  expect(html).toContain('<li>Zusatz &lt;A&gt;</li>');
  expect(html).toContain('um ein Pauschalangebot für die oben definierten Leistungen');
  expect(html).not.toContain('Festpreisangebot');
});

// Eigenanteil sentence: only the amount is bold, so the customer sees what they pay (also 0,00 €).
test.each(['Angebot-10', 'Angebot-BU-KK-2', 'Angebot-BWT', 'Angebot-HL'])('%s: Eigenanteil amount is bold, its sentence is not', async (name) => {
  const xml = new PizZip(await renderDocx(tpl(name), {
    ...data(), hasSubsidyLine: true, IsKassenkunde: true, SelbstkostenanteilFmt: '0,00 €', Zuschusskrankenkasse: '4.180,00 €',
  })).file('word/document.xml').asText();
  const runs = xml.match(/<w:r>(?:(?!<\/w:r>).)*<\/w:r>/gs) || [];
  const amount = runs.find((r) => r.replace(/<[^>]+>/g, '') === '0,00 €');
  const label = runs.find((r) => r.replace(/<[^>]+>/g, '').startsWith('Ihr Eigenanteil beträgt'));
  expect(amount).toMatch(/<w:b\/>/);
  expect(label).not.toMatch(/<w:b\/>/);
  expect(textOf(await renderDocx(tpl(name), { ...data(), hasSubsidyLine: true, SelbstkostenanteilFmt: '12,50 €', Zuschusskrankenkasse: '1 €' })))
    .toContain('Ihr Eigenanteil beträgt 12,50 € unter Berücksichtigung');
});

test('signing page: Eigenanteil amount in <b>', async () => {
  const { buildAngebotHtml } = await import('../../src/templates/signing-docs.js');
  const html = buildAngebotHtml({ PayerKind: 'KK', hasSubsidyLine: true, SelbstkostenanteilFmt: '0,00 €', Zuschusskrankenkasse: '4.180,00 €', Totals: [] });
  expect(html).toContain('Ihr Eigenanteil beträgt <b>0,00 €</b> unter');
});

// Regression (test offer ANG-BU-Stefan-Wolfrum-05112026-111915): a rule whose replacement
// contains its own search text produced invalid XML (LibreOffice: "PDF file not found")
// and was applied several times.
describe('wording rule that contains its own search text', () => {
  const rules = [{ from: 'Wannenaufsatz', to: 'Wannenaufsatz 2' }];
  const withWord = () => ({
    ...data(),
    MaterialsLines: [{ MaterialLine: '- 1 Stk Wannenaufsatz 90 cm', IsSub: false }],
    PrimaryServiceLines: [{ ServiceLine: '- Wannenaufsatz montieren' }],
    ExtraHinweise: [{ Text: 'Wannenaufsatz wird gestellt' }],
  });

  test.each(TEMPLATES)('%s: valid XML, replaced exactly once, in data text too', async (name) => {
    const buf = await renderDocx(tpl(name), withWord(), rules);
    const xml = new PizZip(buf).file('word/document.xml').asText();
    expect(xml).not.toMatch(/<w:t\b[^>]*\sxml:space="preserve"[^>]*\sxml:space=/); // no duplicate attribute
    const parse = () => { const sax = new SaxesParser(); sax.on('error', (e) => { throw e; }); sax.write(xml).close(); };
    expect(parse).not.toThrow(); // well-formed (LibreOffice opens it)
    const txt = textOf(buf);
    expect(txt).toContain('- 1 Stk Wannenaufsatz 2 90 cm');
    expect(txt).toContain('- Wannenaufsatz 2 montieren');
    expect(txt).toContain('Wannenaufsatz 2 wird gestellt');
    expect(txt).not.toContain('Wannenaufsatz 2 2');
  });

  test('HTML pass: once as well', () => {
    expect(replaceTextInHtml('<p>Wannenaufsatz 90</p>', rules)).toBe('<p>Wannenaufsatz 2 90</p>');
  });

  test('rule split across runs inside a paragraph that already has xml:space', async () => {
    const buf = await renderDocx(tpl('Angebot-10'), data(), [
      { from: 'Für eine Teilbeauftragung wäre ein neues Angebot erforderlich', to: 'Für eine Teilbeauftragung wäre ein neues Angebot erforderlich (Stand 11/2026)' },
    ]);
    const xml = new PizZip(buf).file('word/document.xml').asText();
    expect(xml).not.toMatch(/xml:space="preserve"\s+xml:space=/);
    expect(textOf(buf).match(/Stand 11\/2026/g)).toHaveLength(1);
  });
});
