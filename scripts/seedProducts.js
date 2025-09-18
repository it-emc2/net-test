import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../src/models/Product.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB  = process.env.MONGODB_DB || 'KonfiguratorDB';

const products = [
  { productId: 'V22WS1R', name: 'Wannenset individual 2.2 m. Wandhalter Schlauch u. HB 1-str. rund verchr. VIGOUR', price: 39.38 },
  { productId: 'TEMPDSU250', name: 'Duschsystem Tempesta Flex verchromt m. Umstellung KB 210mm Brausegarn. Grohe', price: 165.83 },
  { productId: 'V22BG903R', name: 'Brausegarnitur individ. 2.2 m. Stange 90cm Schlauch u. HB 3-str. rund verchr. VIGOUR', price: 66.55 },
  { productId: 'DEDS2503E', name: 'Duschsystem derby Thermostat m KB 250mm HB 3.2 3-fach edge u. Schl. verchr. VIG (verchromt)', price: 278.40 },
  { productId: 'CLTB', name: 'AP-Brause-Thermostat clivia, ohne Brausegarnitur', price: 95.76 },
  { productId: 'DEPTB', name: 'AP-Brause-Thermostat derby plus m. therm. Desinfektion Safe-Tec verchromt VIGOUR', price: 198.40 },
  { productId: 'CLB', name: 'Einhand-Aufputz-Brausebatterie clivia ohne Brausegarnitur verchromt VIGOUR', price: 60.84 },
  { productId: 'CLPESG40', name: 'Haltegriff clivia plus 32/400mm m. Ros. Edelstahl glatt poliert, VIGOUR', price: 43.18 },
  { productId: 'CLPESG60', name: 'Haltegriff clivia plus 32/600mm m. Ros. Edelstahl glatt poliert, VIGOUR', price: 52.14 },
  { productId: 'CLPESG80', name: 'Haltegriff clivia plus 32/800mm m. Ros. Edelstahl glatt poliert, VIGOUR', price: 67.93 },
  { productId: 'DEPSKG60', name: 'Stützklappgriff derby plus 600mm verchromt m. ABS-Ummantelung VIGOUR', price: 387.84 },
  { productId: 'DEPSKG85', name: 'Stützklappgriff derby plus 850mm verchromt m. ABS-Ummantelung VIGOUR', price: 433.28 },
  { productId: 'DEPKS', name: 'Klappsitz derby plus 362x91x381mm belastbar bis 110 kg, verchromt VIGOUR', price: 241.28 },
  { productId: 'CL', name: 'Einhand-Waschtischbatterie clivia mit Ablaufgarnitur verchromt VIGOUR', price: 54.23 },
  { productId: 'DEPOH', name: 'Einhand-Waschtischbatterie derby plus mit Hebel offen m. Ablg. verchromt VIG.', price: 90.88 },
  { productId: 'DEP60U', name: 'Waschtisch derby plus care 60x55 cm unterfahrbar weiss VIGOUR', price: 198.40 },
  { productId: 'CL60', name: 'Waschtisch clivia 60x48 cm weiss VIGOUR', price: 46.43 },
  { productId: 'WTBF', name: 'Befestigungssatz Fischer WST 10x140', price: 0.99 },
  { productId: 'RSL', name: 'Waschtisch-Röhrensiphon 1 1/4" G mit Verstellrohr 120mm TRINNITY', price: 10.40 },
  { productId: 'WESUNIFLWT', name: 'Wandeinbausifon Geberit 11/4" x 32mm f. Waschtisch Abg. horiz. 50/56mm verchromt', price: 81.95 },
  { productId: 'EV', name: 'SCHELL Eckventil COMFORT regulierbar, ASAG, 1/2", chrom', price: 3.61 },
  { productId: 'V3WVK09', name: 'Wandverkleidung 3.0 Alu 997x 2550mm Stein beige VIGOUR Standardfarbe: weiß', price: 168.00 },
  { productId: 'V3WV09', name: 'Wandverkleidung 3.0 Alu 1497x 2550mm Marmor weiß VIGOUR Standardfarbe: weiß', price: 263.76 },
  { productId: 'TRWDSET5', name: 'TRINNITY Wandabdichtung BASIS-Set 5 qm DW bis 100 x 100 / BW bis 180 x 80 cm', price: 152.52 },
  { productId: 'V4RKIT', name: 'Wandverkleidungsklebstoff 3.0/4.0 für Wandverkleidungspaneel VIGOUR', price: 21.54 },
  { productId: 'V3A', name: 'Abschlussprofil 3.0 255 cm silber eloxiert VIGOUR', price: 29.51 },
  { productId: 'V4RPKIT', name: '3.0 / 4.0 Profilklebstoff für Wandverkleidungsprofil VIGOUR', price: 21.54 },
  { productId: 'SLA180100', name: 'Duschwanne Slate 180x100x3cm Mineralguss weiss Nuovvo', price: 556.92 },
  { productId: 'SLA160100', name: 'Duschwanne Slate 160x100x3cm Mineralguss weiss Nuovvo', price: 513.45 },
  { productId: 'SLA140100', name: 'Duschwanne Slate 140x100x3cm Mineralguss weiss Nuovvo', price: 464.31 },
  { productId: 'SLA120100', name: 'Duschwanne Slate 120x100x3cm Mineralguss weiss Nuovvo', price: 424.62 },
  { productId: 'SLA100', name: 'Duschwanne Slate 100x100x3cm Mineralguss weiss Nuovvo', price: 373.59 },
  { productId: 'SLA90', name: 'Duschwanne Slate 90x90x3cm Mineralguss weiss Nuovvo', price: 302.40 },
  { productId: 'SLA80', name: 'Duschwanne Slate 80x80x3cm Mineralguss weiss Nuovvo', price: 277.83 },
  { productId: 'TRWDB', name: 'TRINNITY Wannenabdichtband-Set 3,4 m Nass-/Trockenanbindung entspr. DIN 18534', price: 29.57 },
  { productId: 'AGD9060', name: 'Ablaufgarnitur Rohbauset m. Sifon BH60mm f. Flache Duschw. m. 90mm Ablauf TRINNITY', price: 20.20 },
  { productId: 'KM01', name: 'Kleinmaterial klein', price: 45.00 },
  { productId: 'KM02', name: 'Kleinmaterial groß', price: 150.00 },
  { productId: 'STELZ', name: 'Stelzlager höhenverstellar Set', price: 20.00 },
  { productId: 'V5FB02', name: 'Fußboden individ.5.0 1500x200mm Lava beige (8 Paneele=2,4m/2) VIGOUR', price: 159.84 },
  { productId: 'V4FK600', name: 'Flächenkleber 3.0/4.0/5.0 Fußboden und Wandverkleidungspaneele 600ml', price: 16.56 },
  { productId: 'TRBDSET7', name: 'TRINNITY Bodenabdichtung BASIS-Set 7 qm Dichtb., Sockelb., Außen- + Innenecke', price: 278.38 },
  { productId: 'V4FK600', name: 'Flächenkleber 3.0/4.0/5.0 Fußboden und Wandverkleidungspaneele 600ml VIGOUR', price: 16.56 },
  { productId: 'V3V', name: 'Verbindungsprofil 3.0 255 cm silber eloxiert VIGOUR', price: 29.51 }

];

(async () => {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
    console.log('Connected for seeding:', MONGODB_DB);

    const ops = products.map(p => ({
      updateOne: {
        filter: { productId: p.productId },
        update: { $set: { name: p.name, price: Number(p.price) } },
        upsert: true
      }
    }));
    const result = await Product.bulkWrite(ops);
    console.log('Seed result:', result);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();