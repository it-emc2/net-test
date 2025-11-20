import express from 'express';
import Customer from '../models/Customer.js';

const router = express.Router();

// Create or update customer
router.post('/', async (req, res) => {
  try {
    const data = req.body || {};

    if (!data.lastName && !data.company) {
      return res.status(400).json({ error: 'Name oder Firma erforderlich' });
    }

    let customer;
    if (data._id) {
      customer = await Customer.findByIdAndUpdate(data._id, data, {
        new: true,
      });
    } else {
      customer = await Customer.create(data);
    }

    res.json(customer);
  } catch (err) {
    console.error('POST /api/customers error:', err);
    res.status(500).json({ error: 'Fehler beim Speichern des Kunden' });
  }
});

// Search customers
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);

    const regex = new RegExp(q, 'i');

    const customers = await Customer.find({
      $or: [
        { customerNumber: regex },
        { firstName: regex },
        { lastName: regex },
        { company: regex },
        { email: regex },
      ],
    })
      .limit(20)
      .lean();

    res.json(customers);
  } catch (err) {
    console.error('GET /api/customers/search error:', err);
    res.status(500).json({ error: 'Fehler bei der Kundensuche' });
  }
});

// Get by id
router.get('/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) return res.status(404).json({ error: 'Kunde nicht gefunden' });
    res.json(customer);
  } catch (err) {
    console.error('GET /api/customers/:id error:', err);
    res.status(500).json({ error: 'Fehler beim Laden des Kunden' });
  }
});

export default router;