// src/routes/pdf.js
import express from 'express';
import PDFDocument from 'pdfkit';
import dayjs from 'dayjs';


export const router = express.Router();

function val(v) {
  // Render booleans nicely, leave numbers as-is, stringify others
  if (v === undefined || v === null) return '';
  if (typeof v === 'boolean') return v ? 'Ja' : 'Nein';
  return String(v);
}

function section(doc, title) {
  doc.moveDown(0.5);
  doc.fillColor('#111').fontSize(13).text(title);
  doc.moveTo(doc.x, doc.y + 4).lineTo(550, doc.y + 4).lineWidth(0.5).stroke('#cccccc');
  doc.moveDown(0.6);
  doc.fontSize(10).fillColor('#111');
}

function field(doc, label, value) {
  doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
  doc.font('Helvetica').text(val(value));
}

router.post('/', async (req, res) => {
  try {
    // Expect shape: { bereich: {...}, duschwanne: {...}, wandverkleidung: {...}, optional: {...} }
    const p = req.body || {};
    const b = p.bereich || {};
    const d = p.duschwanne || {};
    const w = p.wandverkleidung || {};
    const o = p.optional || {};

    // Prepare headers
    const fileName = `Anfrage_${dayjs().format('YYYY-MM-DD_HH-mm')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Create doc
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    // Header
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#111').text('Anfrage – Zusammenfassung');
    doc.moveDown(0.25);
    doc.font('Helvetica').fontSize(10).fillColor('#666')
      .text(`Erstellt: ${dayjs().format('DD.MM.YYYY HH:mm')}`);
    doc.moveDown();

    // Bereich – Kontaktdaten des Kunden
    section(doc, 'Bereich – Kontaktdaten des Kunden');
    field(doc, 'Anrede', b.salutation);
    field(doc, 'Datum', b.date);
    field(doc, 'Vorname', b.firstName);
    field(doc, 'Nachname', b.lastName);
    field(doc, 'Telefon', b.phone);
    field(doc, 'Email', b.email);
    field(doc, 'Adresse', b.street);
    field(doc, 'Stadt', b.city);
    field(doc, 'Bundesland / Provinz', b.state);
    field(doc, 'PLZ', b.postalCode);
    field(doc, 'Abweichender Einsatzort', b.deployment);
    field(doc, 'Kundennummer', b.customerNumber);
    field(doc, 'Ansprechpartner vorhanden?', b.hasContactPerson);
    field(doc, 'Kundenstatus', b.customerType);

    // Duschwanne
    section(doc, 'Duschwanne');
    if (Object.keys(d).length) {
      field(doc, 'Größe', d.traySize);
      field(doc, 'Einstieg', d.entry);
    } else {
      doc.text('Keine Angaben');
    }

    // Wandverkleidung
    section(doc, 'Wandverkleidung');
    if (Object.keys(w).length) {
      field(doc, 'Farbe', w.panelColor);
    } else {
      doc.text('Keine Angaben');
    }

    // Optional
    section(doc, 'Optionale Ausstattung');
    if (Object.keys(o).length) {
      Object.entries(o).forEach(([k, v]) => field(doc, k, v));
    } else {
      doc.text('Keine Angaben');
    }

    // Footer
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9).fillColor('#666')
      .text('Dies ist ein Test-PDF, generiert vom lokalen Server und via ngrok ausgeliefert.');

    doc.end();
  } catch (err) {
    console.error('PDF error:', err);
    // If headers not sent, send JSON error; otherwise end the stream
    if (!res.headersSent) {
      res.status(400).json({ error: 'PDF-Erzeugung fehlgeschlagen' });
    } else {
      try { res.end(); } catch {}
    }
  }
});