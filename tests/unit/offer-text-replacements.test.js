// Wording changed in OC (payload.offerOverrides.textReplacements) must reach every
// customer-facing string — replaces the hand-edited DOCX for "rename product X".
import { applyTextReplacements } from '../../src/routes/docx-template.js';

test('replaces case-insensitively, deeply, literally; no-op without rules', () => {
  const data = { Titel: 'Gleittür 90', Lines: [{ MaterialLine: 'Duschsystem gleittür (Alu)' }], n: 3 };
  const out = applyTextReplacements(data, [{ from: 'Gleittür', to: 'Flexibles Duschsystem' }]);
  expect(out.Titel).toBe('Flexibles Duschsystem 90');
  expect(out.Lines[0].MaterialLine).toBe('Duschsystem Flexibles Duschsystem (Alu)');
  expect(out.n).toBe(3);
  expect(applyTextReplacements(data, [])).toBe(data);
  expect(applyTextReplacements('a.b', [{ from: '.', to: '-' }])).toBe('a-b'); // regex chars stay literal
});
