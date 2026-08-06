# BU Selbstzahler Payment Terms Fix — Verification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the BU Konfigurator PDF shows the correct Selbstzahler payment terms ("Zahlungsbedingungen für den Selbstkostenanteil" with O 100%/50% options) instead of the Kassenkunde terms (20/30/40% Anzahlung).

**Architecture:** The payment terms are built in `mapData()` inside `docx-template.js`. The `SelfPayLines` array is populated based on `PayerKind` (derived from `services.payer` → pricing.js normalises to "SZ"/"KK", fallback `b.payer`). The DOCX template (`Angebot.docx`) loops over `{#SelfPayLines}` using docxtemplater.

**Tech Stack:** Node.js / Express, docxtemplater, LibreOffice (PDF conversion)

## Global Constraints

- Only touch `src/routes/docx-template.js` for JS changes — no other file has `SelfPayLines` logic for the BU flow
- The DOCX template `src/templates/Angebot.docx` must NOT be modified (it already has the correct `{#SelfPayLines}` placeholder)
- "O" prefix (capital letter O followed by a space) is the checkbox style used throughout — do not change to Unicode checkbox characters

---

### Task 1: Confirm the code fix is correct and complete

**Files:**
- Verify: `src/routes/docx-template.js:1549-1581`

**Context:** Commit `1bdd118` swapped the KK and SZ arrays. Before the swap, `PARA_sz_LINES` accidentally held the KK 20/30/40% terms, and the KK arrays held the SZ-style "Zahlungsbedingungen für den Selbstkostenanteil" text. The swap corrected this.

- [ ] **Step 1: Read the relevant section to confirm current state**

Open `src/routes/docx-template.js` at lines 1549–1581 and verify the following structure is present:

```javascript
// KK: Kassenkunde-Zahlungsbedingungen (20/30/40 % Anzahlung)
const PARA_kk_LINES = [
  "Wählen Sie aus folgenden Zahlungsbedingungen (bitte ankreuzen):",
  "O 20 % Anzahlung - ohne Abzug oder",
  "O 30 % Anzahlung abzüglich 1 % Skonto vom Anzahlungsbetrag oder",
  "O 40 % Anzahlung abzüglich 2 % Skonto vom Anzahlungsbetrag",
  "Für die Anzahlung wird eine Anzahlungsrechnung erstellt. Die Überweisung darf erst nach Erhalt dieser Rechnung erfolgen.",
];

// SZ: Selbstzahler-Zahlungsbedingungen (100 % Skonto oder 50/50)
const PARA_sz_LINES = [
  "Zahlungsbedingungen für den Selbstkostenanteil:",
  "O 100 % sofort abzüglich 2 % Skonto oder",
  "O 50 % sofort und 50 % nach Fertigstellung, ohne Abzug",
];

// ...
if (isKK) {
  SelfPayLines = PARA_kk_LINES.map((text, idx) => ({
    Text: text,
    IsTitle: idx === 0,
  }));
} else if (isSZ) {
  SelfPayLines = PARA_sz_LINES.map((text, idx) => ({
    Text: text,
    IsTitle: idx === 0,
  }));
}
```

If this is the current state → code is correct, proceed to Task 2.

If NOT (arrays are still swapped or absent) → apply the fix:

```javascript
// KK: Kassenkunde-Zahlungsbedingungen (20/30/40 % Anzahlung)
const PARA_kk_LINES = [
  "Wählen Sie aus folgenden Zahlungsbedingungen (bitte ankreuzen):",
  "O 20 % Anzahlung - ohne Abzug oder",
  "O 30 % Anzahlung abzüglich 1 % Skonto vom Anzahlungsbetrag oder",
  "O 40 % Anzahlung abzüglich 2 % Skonto vom Anzahlungsbetrag",
  "Für die Anzahlung wird eine Anzahlungsrechnung erstellt. Die Überweisung darf erst nach Erhalt dieser Rechnung erfolgen.",
];

// SZ: Selbstzahler-Zahlungsbedingungen (100 % Skonto oder 50/50)
const PARA_sz_LINES = [
  "Zahlungsbedingungen für den Selbstkostenanteil:",
  "O 100 % sofort abzüglich 2 % Skonto oder",
  "O 50 % sofort und 50 % nach Fertigstellung, ohne Abzug",
];
```

Replace old `PARA_sz_LINES` / `PARA_kk_uber2000_LINES` / `PARA_kk_unter2000_LINES` with the two arrays above, and update the condition block:

```javascript
if (isKK) {
  SelfPayLines = PARA_kk_LINES.map((text, idx) => ({ Text: text, IsTitle: idx === 0 }));
} else if (isSZ) {
  SelfPayLines = PARA_sz_LINES.map((text, idx) => ({ Text: text, IsTitle: idx === 0 }));
}
```

- [ ] **Step 2: Confirm payer detection reads correctly**

At line 1193 verify:
```javascript
const PayerKind = services?.payer || b.payer || "";
```

`services.payer` comes from `src/logic/pricing.js:1157`:
```javascript
const payer = b.payer === "Kassenkunde" ? "KK" : b.payer === "Selbstzahler" ? "SZ" : "";
```

So when the form sends `Selbstzahler`, `services.payer` = `"SZ"`, `payerNorm` = `"SZ"`, `isSZ` = `true`. ✓

No code change needed here if the normalisation is already present.

- [ ] **Step 3: Commit (only if you had to make changes in Step 1)**

```bash
git add src/routes/docx-template.js
git commit -m "fix(bu-konfigurator): show correct payment terms for Selbstzahler

SZ now shows Zahlungsbedingungen für den Selbstkostenanteil with
O 100%/50% options; KK shows 20/30/40% Anzahlung options.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Restart the server and verify manually

**Files:**
- No code changes — runtime verification only

The Node.js server must be restarted for any `src/` changes to take effect. If the fix was applied in a previous session but the server was never restarted, the running process still serves old code.

- [ ] **Step 1: Restart the dev server**

```bash
# If using npm start / nodemon:
npm run dev
# or kill the existing process and restart:
pkill -f "node.*app.js" && npm run dev
```

Wait for `Listening on port 3000` (or whatever the configured port is).

- [ ] **Step 2: Open the BU Konfigurator in the browser**

Navigate to `http://localhost:3000` (or the deployed URL). Make sure the browser cache is cleared (Cmd+Shift+R on Mac).

- [ ] **Step 3: Select Selbstzahler and generate the PDF**

1. In Step 1 (Kundendaten), select **Selbstzahler** (not Kassenkunde)
2. Fill in required fields (name, address)
3. Proceed to the Dokumentenstudio section
4. Click **PDF-Dokument** (button `id="downloadDocxAsPdf"`)

- [ ] **Step 4: Verify the generated PDF content**

Open the downloaded PDF and confirm:

**Expected (SZ):**
```
Zahlungsbedingungen für den Selbstkostenanteil:
O 100 % sofort abzüglich 2 % Skonto oder
O 50 % sofort und 50 % nach Fertigstellung, ohne Abzug
```

**Must NOT appear:**
```
Wählen Sie aus folgenden Zahlungsbedingungen (bitte ankreuzen):
O 20 % Anzahlung ...
O 30 % Anzahlung ...
O 40 % Anzahlung ...
```

- [ ] **Step 5: Cross-check Kassenkunde still shows KK terms**

Repeat the test with **Kassenkunde** selected. The PDF should show:
```
Wählen Sie aus folgenden Zahlungsbedingungen (bitte ankreuzen):
O 20 % Anzahlung - ohne Abzug oder
O 30 % Anzahlung abzüglich 1 % Skonto vom Anzahlungsbetrag oder
O 40 % Anzahlung abzüglich 2 % Skonto vom Anzahlungsbetrag
Für die Anzahlung wird eine Anzahlungsrechnung erstellt. ...
```

- [ ] **Step 6: If PDF still shows wrong terms — check the server logs**

The route logs `PayerKind` before rendering. Run the PDF generation and inspect the terminal:

```
[docx] computed subsidy: { ... }
```

Also add a temporary log before SelfPayLines assignment to confirm payer detection:

```javascript
// Temporary debug line at ~1568 in docx-template.js
console.log("[docx] PayerKind:", PayerKind, "isKK:", isKK, "isSZ:", isSZ);
```

Expected output for Selbstzahler:
```
[docx] PayerKind: SZ isKK: false isSZ: true
```

If output shows `isKK: true` → the payer value coming in is "Kassenkunde" even when SZ is selected. This would indicate a frontend bug (form not sending the right value). Check `buildPayload()` at `src/public/script.js:3671`.

Remove the temporary debug line after diagnosis.
