import * as engine from '../../src/public/configurator/engine.js';

// Vigor's catalog sometimes only manufactures some Glasart/Beschichtung/Profilfarbe
// combinations (e.g. "silber hochglanz" never ships "mit Beschichtung"). Before the
// fix, availableOptions() offered every finish value regardless, so the wizard could
// walk into a combo with zero matching articles and resolveConfiguration() came back
// null. availableOptions() must now filter those combos out as they're picked.
const model = {
  params: [{ id: 'Serie', values: [{ value: 'S1' }] }],
  leaves: [{
    selections: { Serie: 'S1' },
    finish: [
      { id: 'Beschichtung_mit_ohne', values: [
        { value: 'mit', label: 'mit Beschichtung', cat: 'mit' },
        { value: 'ohne', label: 'ohne Beschichtung', cat: 'ohne' },
      ] },
      { id: 'Profilfarbe', values: [
        { value: 'hochglanz', label: 'silber hochglanz', cat: 'hochglanz' },
        { value: 'schwarz', label: 'schwarz matt', cat: 'schwarz' },
      ] },
    ],
    components: [{
      key: 'Tuer', label: 'Tür',
      articles: [
        { articleNumber: 'A1', width: 800, height: 2000, net: 1, gros: 1, currency: 'EUR', finish: { beschichtung: 'ohne', profilfarbe: 'hochglanz' } },
        { articleNumber: 'A2', width: 800, height: 2000, net: 1, gros: 1, currency: 'EUR', finish: { beschichtung: 'mit', profilfarbe: 'schwarz' } },
        { articleNumber: 'A3', width: 800, height: 2000, net: 1, gros: 1, currency: 'EUR', finish: { beschichtung: 'ohne', profilfarbe: 'schwarz' } },
        // note: no "mit" + "hochglanz" article exists
      ],
    }],
  }],
};

function resolvedLeafState() {
  let s = engine.applySelection(model, engine.initialState(), 'Serie', 'S1');
  return engine.settle(model, s);
}

test('finish options exclude a value once it has zero articles under the other picks', () => {
  let s = resolvedLeafState();
  s = engine.applySelection(model, s, 'Beschichtung_mit_ohne', 'mit');
  const profilfarbe = engine.availableOptions(model, s, 'Profilfarbe');
  expect(profilfarbe.map((v) => v.value)).toEqual(['schwarz']);
});

test('picking only offered values always resolves a configuration', () => {
  let s = resolvedLeafState();
  s = engine.applySelection(model, s, 'Beschichtung_mit_ohne', 'mit');
  s = engine.applySelection(model, s, 'Profilfarbe', engine.availableOptions(model, s, 'Profilfarbe')[0].value);
  s = engine.setComponentSize(s, 'Tuer', 800, 2000);
  expect(engine.resolveConfiguration(model, s)).not.toBeNull();
});

test('unaffected value (schwarz) stays available regardless of Beschichtung', () => {
  let s = resolvedLeafState();
  const before = engine.availableOptions(model, s, 'Profilfarbe').map((v) => v.value);
  expect(before).toEqual(['hochglanz', 'schwarz']);
  s = engine.applySelection(model, s, 'Beschichtung_mit_ohne', 'ohne');
  const after = engine.availableOptions(model, s, 'Profilfarbe').map((v) => v.value);
  expect(after).toEqual(['hochglanz', 'schwarz']);
});
