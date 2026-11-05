/**
 * @jest-environment jsdom
 *
 * The document preview reloads on input/change events of the Zusammenfassung page.
 * Removing a rule/Hinweis with ✕ fires neither, so the old (possibly error) preview
 * stayed until a page reload.
 */
import { setOfferOverrides } from '../../src/public/OfferOverrides.js';

test('✕ on a rule tells the preview to refresh (change event from the card)', () => {
  document.body.innerHTML = `
    <details id="offerOverridesCard"><summary id="offerOverridesBadge"></summary>
      <div id="offerOverridesList"></div><button id="offerOverridesAdd"></button>
      <div id="offerPriceTitle"></div><div id="offerPriceList"></div><button id="offerPriceAdd"></button>
      <div id="offerHinweiseTitle"></div><div id="offerHinweiseList"></div><button id="offerHinweiseAdd"></button>
    </details>`;
  const seen = [];
  document.addEventListener('change', (e) => seen.push(e.target.id), true);

  setOfferOverrides({ textReplacements: [{ from: 'a', to: 'b' }], extraHinweise: ['x'] });
  document.querySelector('#offerOverridesList .oo-del').click();
  expect(seen).toEqual(['offerOverridesCard']);
  expect(document.querySelectorAll('#offerOverridesList .oo-row')).toHaveLength(0);

  document.querySelector('#offerHinweiseList .oo-del').click();
  expect(seen).toHaveLength(2);
});
