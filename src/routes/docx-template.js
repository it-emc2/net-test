// src/routes/docx-template.js
import express from 'express';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

export const router = express.Router();

function mapData(body = {}) {
  const b = body.bereich || {};
  const sum = body.summe || {};
  const prix = body.preise || {};
  const tb = body.textbausteine || {};
  return {
    Anrede: b.salutation || '',
    Vorname: b.firstName || '',
    Nachname: b.lastName || '',
    Adresse: b.street || '',
    Stadt: b.city || '',
    PLZ: b.postalCode || '',
    Datum: b.date || dayjs().format('YYYY-MM-DD'),
    Ansprechpartner: body.ansprechpartner || (b.hasContactPerson || ''),
    Kundennummer: b.customerNumber || '',
    Greeting: b.salutation === 'Frau' ? 'Sehr geehrte Frau' : (b.salutation === 'Herr' ? 'Sehr geehrter Herr' : 'Guten Tag'),
    Angebotsnummer: body.offerNumber || 'ANG-0001',
    Arbeit: prix.arbeit ?? '',
    Material: prix.material ?? '',
    Long1: tb.long1 ?? '',
    Long3: tb.long3 ?? '',
    Long: tb.long ?? '',
    Pos003: body.pos003 ?? '',
    Bonus1Stk: body.bonus1Stk ?? '',
    Bonus1: body.bonus1 ?? '',
    Bonus1Price: body.bonus1Price ?? '',
    Pos004: body.pos004 ?? '',
    Bonus2Stk: body.bonus2Stk ?? '',
    Bonus2: body.bonus2 ?? '',
    Bonus2Price: body.bonus2Price ?? '',
    Nettobetrag: sum.netto ?? '',
    Rabatt: sum.rabatt ?? '',
    MwSt: sum.mwst ?? '',
    Gesamtsumme: sum.gesamt ?? '',
    Selbstkostenanteil: sum.selbstkostenanteil ?? '',
    Zuschusskrankenkasse: sum.zuschuss ?? '',
    Gesamtsummerabatt: sum.gesamtsummerabatt ?? '',
  };
}

router.post('/', async (req, res) => {
  try {
    const templatePath = path.join(process.cwd(), 'src', 'templates', 'Angebot.docx');
    const content = await fs.readFile(templatePath); // Buffer

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    });

    const data = mapData(req.body || {});
    console.log('[docx-template] replacing keys:', Object.keys(data));

    doc.setData(data);

    // Will throw if a placeholder in DOCX has no value
    doc.render();

    const out = doc.getZip().generate({ type: 'nodebuffer' });

    // Optional: write to disk for verification during debugging
    try {
      const verifyOut = path.join(process.cwd(), 'out-Angebot.docx');
      fsSync.writeFileSync(verifyOut, out);
      console.log('[docx-template] wrote generated DOCX:', verifyOut, 'size:', out.length);
    } catch (e) {
      console.warn('[docx-template] could not write verify file:', e?.message || e);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="Angebot.docx"');
    res.send(out);
  } catch (e) {
    console.error('DOCX generation failed:', e);
    res.status(500).json({ error: 'DOCX generation failed', detail: e.message || String(e) });
  }
});

export default router;