// ✅ UPDATED: Modern docxtemplater API usage
async function renderDocx(templatePath, data) {
  const content = await fs.readFile(templatePath);
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { 
    paragraphLoop: true, 
    linebreaks: true, 
    nullGetter: () => '' 
  });
  
  try {
    doc.render(data);  // ✅ Use render(data) directly instead of setData() + render()
  } catch (e) {
    const msg = e?.message || String(e);
    console.error('Docxtemplater render error:', msg);
    if (e?.properties?.errors) {
      for (const er of e.properties.errors) {
        console.error('- Docx error:', {
          id: er.id, explanation: er.explanation, file: er.file,
          xtag: er.xtag, context: er.context, offset: er.offset,
        });
      }
    }
    throw new Error(`DOCX render failed: ${msg}`);
  }
  return doc.getZip().generate({ type: 'nodebuffer' });
}

// ✅ COMPLETE: Material overview DOCX route
router.post('/material-overview', async (req, res) => {
  try {
    const computed = await pricing.computePrices(req.body || {});
    const rows = aggregateMaterialsForOverview(req.body || {}, computed);

    const materials = rows.map((m, i) => ({
      pos: i + 1,
      materialNumber: m.materialNumber,
      name: m.name,
      quantity: formatQtyForOverview(m.quantity, m.unit || 'Stck.'),
      unit: m.unit || 'Stck.',
      remarks: m.remarks || ''
    }));

    // === USE THE SAME PATTERN AS THE WORKING ROUTE ===
    const b = req.body?.bereich || {};
    
    // Build customer name the same way as mapData()
    const salutation = b.salutation || '';
    const firstName = b.firstName || '';
    const lastName = b.lastName || '';
    
    const kundeName = [salutation, firstName, lastName].filter(Boolean).join(' ') || '';
    
    // Build address the same way
    const street = b.street || '';
    const city = b.city || '';
    const plz = b.postalCode || '';
    
    const adresse = [street, [plz, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

    const data = {
      angebotNummer: req.body?.offerNumber || 'ANG-0001',
      datum: (b.date || dayjs().format('YYYY-MM-DD')),
      kunde: kundeName,
      adresse,
      ansprechpartner: (b.emc2_contact || '').trim(),
      // Individual fields for debugging
      salutation,
      firstName,
      lastName,
      street,
      plz,
      city,
      materials
    };

    console.log('[DEBUG] Template data:', {
      kunde: data.kunde,
      adresse: data.adresse,
      ansprechpartner: data.ansprechpartner,
      materialsCount: materials.length,
      firstMaterial: materials[0] || null
    });

    const templatePath = path.join(process.cwd(), 'src', 'templates', 'Materialuebersicht.docx');
    const out = await renderDocx(templatePath, data);

    // Optional: write debug copy
    try {
      const verifyOut = path.join(process.cwd(), 'out-Materialuebersicht.docx');
      fsSync.writeFileSync(verifyOut, out);
      console.log('[material-overview] wrote generated DOCX:', verifyOut, 'size:', out.length);
    } catch (e) {
      console.warn('[material-overview] could not write verify file:', e?.message || e);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="Materialuebersicht.docx"');
    res.send(out);
    
  } catch (e) {
    console.error('Materialübersicht generation failed:', e);
    res.status(500).json({ error: 'Materialübersicht generation failed', detail: e.message || String(e) });
  }
});