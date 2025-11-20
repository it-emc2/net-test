// src/routes/bitrix.js
import express from 'express';

const router = express.Router();

// n8n webhook URL
const N8N_BITRIX_WEBHOOK_URL =
  'https://fly-n8n-1.fly.dev/webhook/3bf475f1-ec63-4158-8678-589b081a1d9a';

// GET /api/bitrix/contact/:id → call n8n and forward its JSON
router.get('/contact/:id', async (req, res) => {
  try {
    const id = req.params.id?.trim();
    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    console.log('[Bitrix route] calling n8n with id =', id);

    const n8nRes = await fetch(N8N_BITRIX_WEBHOOK_URL, {
      method: 'POST', // use POST, webhook expects { id }
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });

    console.log('[Bitrix route] n8n HTTP status =', n8nRes.status);

    if (!n8nRes.ok) {
      let errorMessage = `n8n webhook error (status ${n8nRes.status})`;
      try {
        const errJson = await n8nRes.json();
        console.error('[Bitrix route] n8n error body:', errJson);
        if (errJson?.error) errorMessage = errJson.error;
      } catch (e) {
        console.error('[Bitrix route] failed to parse n8n error JSON', e);
      }
      return res.status(502).json({ error: errorMessage });
    }

    const json = await n8nRes.json();
    console.log('[Bitrix route] n8n response JSON:', json);

    // json looks like:
    // {
    //   result: { ID: '12980', NAME: 'Michael ', LAST_NAME: 'Kaufmann', ... },
    //   time: { ... }
    // }
    // Forward it unchanged; frontend will read data.result
    return res.json(json);
  } catch (err) {
    console.error('GET /api/bitrix/contact/:id error:', err);
    res.status(500).json({ error: 'Internal server error calling n8n' });
  }
});

export default router;