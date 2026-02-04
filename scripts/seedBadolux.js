import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../src/models/Product.js'; // Adjust path as needed

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'KonfiguratorDB';

const products = [
  // Duschwannen (Shower Trays)
  { productId: 'DW001', name: 'Mineral Duschwanne SMC 70x140', price: 168.00, widthCm: 70, heightCm: 2.6, lengthCm: 140, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW002', name: 'Mineral Duschwanne SMC 70x160', price: 192.78, widthCm: 70, heightCm: 2.6, lengthCm: 160, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW003', name: 'Mineral Duschwanne SMC 70x170', price: 197.40, widthCm: 70, heightCm: 2.6, lengthCm: 170, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW004', name: 'Mineral Duschwanne SMC 70x180', price: 226.80, widthCm: 70, heightCm: 2.6, lengthCm: 180, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW005', name: 'Mineral Duschwanne SMC 80x80', price: 124.32, widthCm: 80, heightCm: 2.6, lengthCm: 80, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW006', name: 'Mineral Duschwanne SMC 80x90', price: 125.44, widthCm: 80, heightCm: 2.6, lengthCm: 90, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW007', name: 'Mineral Duschwanne SMC 80x100', price: 134.40, widthCm: 80, heightCm: 2.6, lengthCm: 100, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW008', name: 'Mineral Duschwanne SMC 80x120', price: 161.70, widthCm: 80, heightCm: 2.6, lengthCm: 120, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW009', name: 'Mineral Duschwanne SMC 80x140', price: 180.60, widthCm: 80, heightCm: 2.6, lengthCm: 140, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW010', name: 'Mineral Duschwanne SMC 80x160', price: 195.30, widthCm: 80, heightCm: 2.6, lengthCm: 160, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW011', name: 'Mineral Duschwanne SMC 80x170', price: 203.49, widthCm: 80, heightCm: 2.6, lengthCm: 170, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW012', name: 'Mineral Duschwanne SMC 80x180', price: 214.20, widthCm: 80, heightCm: 2.6, lengthCm: 180, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW013', name: 'Mineral Duschwanne SMC 90x90', price: 134.40, widthCm: 90, heightCm: 2.6, lengthCm: 90, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW014', name: 'Mineral Duschwanne SMC 90x100', price: 161.70, widthCm: 90, heightCm: 2.6, lengthCm: 100, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW015', name: 'Mineral Duschwanne SMC 90x120', price: 173.50, widthCm: 90, heightCm: 2.6, lengthCm: 120, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW016', name: 'Mineral Duschwanne SMC 90x140', price: 201.35, widthCm: 90, heightCm: 2.6, lengthCm: 140, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW017', name: 'Mineral Duschwanne SMC 90x160', price: 227.05, widthCm: 90, heightCm: 2.6, lengthCm: 160, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW018', name: 'Mineral Duschwanne SMC 90x170', price: 237.76, widthCm: 90, heightCm: 2.6, lengthCm: 170, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW019', name: 'Mineral Duschwanne SMC 90x180', price: 248.47, widthCm: 90, heightCm: 2.6, lengthCm: 180, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW020', name: 'Mineral Duschwanne SMC 100x100', price: 294.00, widthCm: 100, heightCm: 2.6, lengthCm: 100, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW021', name: 'Mineral Duschwanne SMC 100x120', price: 310.80, widthCm: 100, heightCm: 2.6, lengthCm: 120, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW022', name: 'Mineral Duschwanne SMC 100x140', price: 327.60, widthCm: 100, heightCm: 2.6, lengthCm: 140, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW023', name: 'Mineral Duschwanne SMC 100x160', price: 369.60, widthCm: 100, heightCm: 2.6, lengthCm: 160, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW024', name: 'Mineral Duschwanne SMC 100x180', price: 415.80, widthCm: 100, heightCm: 2.6, lengthCm: 180, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },
  { productId: 'DW025', name: 'Mineral Duschwanne SMC 100x200', price: 453.60, widthCm: 100, heightCm: 2.6, lengthCm: 200, description: 'Mineral Duschwanne SMC, steinoptik, rutschfest, Höhe 2,6 cm' },

  // Duschabtrennungen (Shower Enclosures)
  { productId: 'GL001', name: 'Walk in - Wien 60cm', price: 202.48, widthCm: 60, heightCm: 195, lengthCm: null, description: 'Sicherheitsglas mit Nano Beschichtung 195 cm, Glasstärke 0,8 cm, incl. Stabi und U- Profil' },
  { productId: 'GL002', name: 'Walk in - Wien 70cm', price: 225.23, widthCm: 70, heightCm: 195, lengthCm: null, description: 'Sicherheitsglas mit Nano Beschichtung 195 cm, Glasstärke 0,8 cm, incl. Stabi und U- Profil' },
  { productId: 'GL003', name: 'Walk in - Wien 80cm', price: 241.15, widthCm: 80, heightCm: 195, lengthCm: null, description: 'Sicherheitsglas mit Nano Beschichtung 195 cm, Glasstärke 0,8 cm, incl. Stabi und U- Profil' },
  { productId: 'GL004', name: 'Walk in - Wien 90cm', price: 259.35, widthCm: 90, heightCm: 195, lengthCm: null, description: 'Sicherheitsglas mit Nano Beschichtung 195 cm, Glasstärke 0,8 cm, incl. Stabi und U- Profil' },
  { productId: 'GL005', name: 'Walk in - Wien 100cm', price: 270.73, widthCm: 100, heightCm: 195, lengthCm: null, description: 'Sicherheitsglas mit Nano Beschichtung 195 cm, Glasstärke 0,8 cm, incl. Stabi und U- Profil' },
  { productId: 'GL006', name: 'Walk in - Wien 120cm', price: 302.58, widthCm: 120, heightCm: 195, lengthCm: null, description: 'Sicherheitsglas mit Nano Beschichtung 195 cm, Glasstärke 0,8 cm, incl. Stabi und U- Profil' },
  { productId: 'GL007', name: 'Faltür - Lissabon 80cm', price: 286.65, widthCm: 80, heightCm: 195, lengthCm: null, description: 'Sicherheitsglas mit Nano Beschichtung 195 x 80 x 0,8 cm' },
  { productId: 'GL008', name: 'Faltür - Lissabon 90cm', price: 302.58, widthCm: 90, heightCm: 195, lengthCm: null, description: 'Sicherheitsglas mit Nano Beschichtung 195 x 90 x 0,8 cm' },
  { productId: 'GL009', name: 'Faltür - Lissabon 100cm', price: 318.50, widthCm: 100, heightCm: 195, lengthCm: null, description: 'Sicherheitsglas mit Nano Beschichtung 195 x 100 x 0,8 cm' },
  { productId: 'GL010', name: 'Faltür - Lissabon 120cm', price: 357.10, widthCm: 120, heightCm: 195, lengthCm: null, description: 'Sicherheitsglas mit Nano Beschichtung 195 x 120 x 0,8 cm' },
  { productId: 'GL011', name: 'Faltür mit Festteil - Stockholm', price: 368.55, widthCm: 180, heightCm: null, lengthCm: null, description: 'Gesamtlänge 180 cm, Faltwand 2 x 50 cm und 80 cm fest, Glasstärke 0,6 cm' },
  { productId: 'GL012', name: 'Faltür mit Festteil - Rom', price: 423.15, widthCm: 140, heightCm: null, lengthCm: null, description: 'Gesamtlänge 140 cm, Faltwand 2 x 50 cm und 40 cm fest, Glasstärke 0,8 cm' },
  { productId: 'GL013', name: 'Schiebetür (Wand-Wand) 160cm', price: 516.43, widthCm: 160, heightCm: 195, lengthCm: null, description: '160 x 195 x 0,6 cm, Wand zu Wand Montage, oben geführt' },
  { productId: 'GL014', name: 'Schiebetür (Wand-offen) 140cm', price: 486.85, widthCm: 140, heightCm: 195, lengthCm: null, description: '140 x 195 x 0,6 cm, unten geführt' },
  { productId: 'GL015', name: 'Schiebetür (Wand-offen) 160cm', price: 502.78, widthCm: 160, heightCm: 195, lengthCm: null, description: '160 x 195 x 0,6 cm, unten geführt' },
  { productId: 'GL016', name: 'Schiebetür (Wand-offen) 180cm', price: 559.43, widthCm: 180, heightCm: 195, lengthCm: null, description: '180 x 195 x 0,6 cm, unten geführt' },

  // Wandpaneele (Wall Panels)
  { productId: 'WP001', name: 'Standard-Dekor Marmor weiß', price: 129.00, widthCm: 260, heightCm: 9.5, lengthCm: null, description: 'Wandpaneele 2600 x 95 mm', color: 'Marmor weiß', articleNumber: 'DN3287-3' },
  { productId: 'WP002', name: 'Standard-Dekor steingrau', price: 129.00, widthCm: 260, heightCm: 9.5, lengthCm: null, description: 'Wandpaneele 2600 x 95 mm', color: 'steingrau', articleNumber: 'DN9031-004' },
  { productId: 'WP003', name: 'Standard-Dekor grau', price: 129.00, widthCm: 260, heightCm: 9.5, lengthCm: null, description: 'Wandpaneele 2600 x 95 mm', color: 'grau', articleNumber: 'DN8604-009' },
  { productId: 'WP004', name: 'Standard-Dekor creme', price: 129.00, widthCm: 260, heightCm: 9.5, lengthCm: null, description: 'Wandpaneele 2600 x 95 mm', color: 'creme', articleNumber: 'DN3403-6' },
  { productId: 'WP005', name: 'Standard-Dekor Sahara', price: 129.00, widthCm: 260, heightCm: 9.5, lengthCm: null, description: 'Wandpaneele 2600 x 95 mm', color: 'Sahara', articleNumber: 'DN4595-5' },
  { productId: 'WP006', name: 'Standard-Dekor Cafe', price: 129.00, widthCm: 260, heightCm: 9.5, lengthCm: null, description: 'Wandpaneele 2600 x 95 mm', color: 'Cafe', articleNumber: 'DN8604-003' },
  { productId: 'WP007', name: 'Sonder-Dekor', price: 169.00, widthCm: 260, heightCm: 9.5, lengthCm: null, description: 'Wandpaneele nach Kundenwunsch zzgl. Grafikkosten 39,00 €/Std.', color: 'Custom' },

  // Bodenplatten (Floor Panels)
  { productId: 'BP001', name: 'Hydroträgerplatte steingrau', price: 35.16, widthCm: null, heightCm: null, lengthCm: null, description: 'Boden Wasserfeste Hydroträgerplatte mit Nanoversiegelung,1,49 m² pro Paket', color: 'steingrau', articleNumber: 'DN9031-004' },
  { productId: 'BP002', name: 'Hydroträgerplatte grau', price: 35.16, widthCm: null, heightCm: null, lengthCm: null, description: 'Boden Wasserfeste Hydroträgerplatte mit Nanoversiegelung,1,49 m² pro Paket', color: 'grau', articleNumber: 'DN8604-009' },
  { productId: 'BP003', name: 'Hydroträgerplatte creme', price: 35.16, widthCm: null, heightCm: null, lengthCm: null, description: 'Boden Wasserfeste Hydroträgerplatte mit Nanoversiegelung,1,49 m² pro Paket', color: 'creme', articleNumber: 'DN3403-6' },
  { productId: 'BP004', name: 'Hydroträgerplatte Sahara', price: 35.16, widthCm: null, heightCm: null, lengthCm: null, description: 'Boden Wasserfeste Hydroträgerplatte mit Nanoversiegelung,1,49 m² pro Paket', color: 'Sahara', articleNumber: 'DN4595-5' },
  { productId: 'BP005', name: 'Hydroträgerplatte Cafe', price: 35.16, widthCm: null, heightCm: null, lengthCm: null, description: 'Boden Wasserfeste Hydroträgerplatte mit Nanoversiegelung,1,49 m² pro Paket', color: 'Cafe', articleNumber: 'DN8604-003' },

  // Zubehör (Accessories)
  { productId: 'AC001', name: 'Schwallleiste kleine 35-50mm', price: 2.57, widthCm: null, heightCm: null, lengthCm: null, description: 'Schwallleiste zu Duschwannen ohne Rand' },
  { productId: 'AC002', name: 'Schwallleiste mittlere 50-80mm', price: 2.74, widthCm: null, heightCm: null, lengthCm: null, description: 'Schwallleiste zu Duschwannen ohne Rand' },
  { productId: 'AC003', name: 'Schwallleiste große 80-140mm', price: 3.47, widthCm: null, heightCm: null, lengthCm: null, description: 'Schwallleiste zu Duschwannen ohne Rand' },
  { productId: 'AC004', name: '1KU-PU-Kleber', price: 17.59, widthCm: null, heightCm: null, lengthCm: null, description: '1VE = 20 Stück' },
  { productId: 'AC005', name: 'Dichtband 10m', price: 166.00, widthCm: null, heightCm: null, lengthCm: 10, description: 'Dichtband' },
  { productId: 'AC006', name: 'Dichtband 1m', price: 5.81, widthCm: null, heightCm: null, lengthCm: 1, description: 'Dichtband' },
  { productId: 'AC007', name: 'Dichtbahn Rolle 30x0.6m', price: 247.25, widthCm: 30, heightCm: null, lengthCm: 0.6, description: 'Dichtbahn Rolle' },
  { productId: 'AC008', name: 'Dichtbahn 1m', price: 8.24, widthCm: null, heightCm: null, lengthCm: 1, description: 'Dichtbahn' },
  { productId: 'AC009', name: 'Wandmanschette', price: 4.97, widthCm: null, heightCm: null, lengthCm: null, description: 'Wandmanschette' },
  { productId: 'AC010', name: 'Winkelleisten Kunststoff grau', price: 33.42, widthCm: null, heightCm: null, lengthCm: 250, description: 'Winkelleisten Kunststoff, 10 x 10 mm, 250 cm Länge', color: 'grau' },
  { productId: 'AC011', name: 'Winkelleisten Kunststoff weiß', price: 33.42, widthCm: null, heightCm: null, lengthCm: 250, description: 'Winkelleisten Kunststoff, 10 x 10 mm, 250 cm Länge', color: 'weiß' },
  { productId: 'AC012', name: 'Winkelleisten Alu (Winkelprofil)', price: 15.96, widthCm: null, heightCm: null, lengthCm: 260, description: 'Wahlweise in hellgrau, taupe und Anthrazit, Länge 260 cm' },
  { productId: 'AC013', name: 'Winkelleisten Alu (Nutprofil)', price: 12.48, widthCm: null, heightCm: null, lengthCm: 260, description: 'Wahlweise in hellgrau, taupe und Anthrazit, Länge 260 cm' },
  { productId: 'AC014', name: 'Winkelleisten Alu (Abschlussprofil)', price: 12.48, widthCm: null, heightCm: null, lengthCm: 260, description: 'Wahlweise in hellgrau, taupe und Anthrazit, Länge 260 cm' },
];

(async () => {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
    console.log('Connected for seeding:', MONGODB_DB);

    const ops = products.map(p => ({
      updateOne: {
        filter: { productId: p.productId },
        update: { 
          $set: { 
            name: p.name, 
            price: Number(p.price), 
            widthCm: p.widthCm, 
            heightCm: p.heightCm, 
            lengthCm: p.lengthCm,
            description: p.description || '',
            color: p.color || '',
            articleNumber: p.articleNumber || '',
            source: 'badolux'  
          } 
        },
        upsert: true
      }
    }));
    
    const result = await Product.bulkWrite(ops);
    console.log('Seed result:', result);
    console.log(`Seeded ${products.length} products successfully!`);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
})();