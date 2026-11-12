// P7-4 (ADR 022): the browser confirm() questions of today's UI become the app's own in-page
// dialog (window.appConfirm — already part of today's UI) with buttons that say what happens.
// confirm() blocks synchronously, so it cannot be replaced from outside; v2 serves the affected
// files with these exact rewrites applied. The repo files stay untouched. Every rule must match
// (test/rewrites.test.ts) — when main changes a text, the test fails instead of silently skipping.
export interface Rewrite { find: string; replace: string }

export const REWRITES: Record<string, Rewrite[]> = {
  "EmailManager.js": [{
    find:
`        const again = window.confirm(
          \`Für diesen Deal wurde bereits am \${when} eine Angebots-E-Mail versendet (\${conflict.lastOfferNumber || "-"}).\\n\\nWirklich erneut senden?\`,
        );`,
    replace:
`        const again = await window.appConfirm({
          title: "Angebot noch einmal senden?",
          message: \`Für diesen Deal wurde am \${when} schon eine Angebots-E-Mail gesendet (\${conflict.lastOfferNumber || "-"}).\`,
          confirmLabel: "Ja, noch einmal senden", cancelLabel: "Nein, nicht senden",
        });`,
  }],
  "script.js": [
    {
      find: "        if (!window.confirm(`${data.warning}\\n\\nTrotzdem fortfahren?`)) {",
      replace:
        '        if (!(await window.appConfirm({ title: "Neuen Unterschrifts-Link erstellen?", message: data.warning, confirmLabel: "Ja, neuen Link erstellen", cancelLabel: "Nein, alten Link behalten" }))) {',
    },
    {
      find:
`          const again = window.confirm(
            \`Für diesen Deal wurde bereits am \${when} ein Brief versendet \` +
              \`(\${result.lastOfferNumber || "-"}, onlinebrief24 \${result.lastPrintjobId || "-"}).\\n\\n\` +
              "Wirklich einen ZWEITEN Brief versenden?",
          );`,
      replace:
`          const again = await window.appConfirm({
            title: "Noch einen Brief senden?",
            message: \`Für diesen Deal wurde am \${when} schon ein Brief gesendet (\${result.lastOfferNumber || "-"}, onlinebrief24 \${result.lastPrintjobId || "-"}).\`,
            confirmLabel: "Ja, zweiten Brief senden", cancelLabel: "Nein, nicht senden",
          });`,
    },
    {
      find:
`        if (!window.confirm(\`„\${c?.name || "Konfiguration"}“ wirklich entfernen? Alle Auswahlen dieser Konfiguration gehen verloren.\`)) return;
        configs = configs.filter((x) => x.id !== id);
        if (activeId === id) activeId = configs[0].id;
        renderAll();
        refreshOffer();`,
      replace:
`        window.appConfirm({ title: "Konfiguration entfernen?", message: \`„\${c?.name || "Konfiguration"}“ und alle Auswahlen darin werden entfernt.\`, confirmLabel: "Ja, entfernen", cancelLabel: "Nein, behalten" }).then((ok) => { if (!ok) return;
        configs = configs.filter((x) => x.id !== id);
        if (activeId === id) activeId = configs[0].id;
        renderAll();
        refreshOffer(); });`,
    },
  ],
};

/** Apply all rules for a served file; throws if a rule no longer matches exactly once. */
export function applyRewrites(file: string, src: string): string {
  let out = src;
  for (const r of REWRITES[file] ?? []) {
    const n = out.split(r.find).length - 1;
    if (n !== 1) throw new Error(`rewrite for ${file} matches ${n}× (expected 1): ${r.find.slice(0, 80)}`);
    out = out.replace(r.find, () => r.replace);
  }
  return out;
}
