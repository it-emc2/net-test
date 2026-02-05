/* eslint-disable no-undef */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../src/models/Product.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB  = process.env.MONGODB_DB || 'KonfiguratorDB';

const products = [
  { productId: 'V22WS1R', name: 'Wannenset individual 2.2 m. Wandhalter Schlauch u. HB 1-str. rund verchr. VIGOUR', price: 39.38, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'TEMPDSU250', name: 'Duschsystem Tempesta Flex verchromt m. Umstellung KB 210mm Brausegarn. Grohe', price: 165.83, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'V22BG903R', name: 'Brausegarnitur individ. 2.2 m. Stange 90cm Schlauch u. HB 3-str. rund verchr. VIGOUR', price: 66.55, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'DEDS2503E', name: 'Duschsystem derby Thermostat m KB 250mm HB 3.2 3-fach edge u. Schl. verchr. VIG (verchromt)', price: 278.40, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'CLTB', name: 'AP-Brause-Thermostat clivia, ohne Brausegarnitur', price: 95.76, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'DEPTB', name: 'AP-Brause-Thermostat derby plus m. therm. Desinfektion Safe-Tec verchromt VIGOUR', price: 198.40, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'CLB', name: 'Einhand-Aufputz-Brausebatterie clivia ohne Brausegarnitur verchromt VIGOUR', price: 60.84, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'CLPESG40', name: 'Haltegriff clivia plus 32/400mm m. Ros. Edelstahl glatt poliert, VIGOUR', price: 43.18, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'CLPESG60', name: 'Haltegriff clivia plus 32/600mm m. Ros. Edelstahl glatt poliert, VIGOUR', price: 52.14, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'CLPESG80', name: 'Haltegriff clivia plus 32/800mm m. Ros. Edelstahl glatt poliert, VIGOUR', price: 67.93, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'DEPSKG60', name: 'Stützklappgriff derby plus 600mm verchromt m. ABS-Ummantelung VIGOUR', price: 387.84, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'DEPSKG85', name: 'Stützklappgriff derby plus 850mm verchromt m. ABS-Ummantelung VIGOUR', price: 433.28, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'DEPKS', name: 'Klappsitz derby plus 362x91x381mm belastbar bis 110 kg, verchromt VIGOUR', price: 241.28, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'CL', name: 'Einhand-Waschtischbatterie clivia mit Ablaufgarnitur verchromt VIGOUR', price: 54.23, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'DEPOH', name: 'Einhand-Waschtischbatterie derby plus mit Hebel offen m. Ablg. verchromt VIG.', price: 90.88, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'DEP60U', name: 'Waschtisch derby plus care 60x55 cm unterfahrbar weiss VIGOUR', price: 198.40, widthCm: 60, heightCm: null, lengthCm: 55 },
  { productId: 'CL60', name: 'Waschtisch clivia 60x48 cm weiss VIGOUR', price: 46.43, widthCm: 60, heightCm: null, lengthCm: 48 },
  { productId: 'WTBF', name: 'Befestigungssatz Fischer WST 10x140', price: 0.99, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'RSL', name: 'Waschtisch-Röhrensiphon 1 1/4" G mit Verstellrohr 120mm TRINNITY', price: 10.40, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'WESUNIFLWT', name: 'Wandeinbausifon Geberit 11/4" x 32mm f. Waschtisch Abg. horiz. 50/56mm verchromt', price: 81.95, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'EV', name: 'SCHELL Eckventil COMFORT regulierbar, ASAG, 1/2", chrom', price: 3.61, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'V3WVK09', name: 'Wandverkleidung 3.0 Alu 997x 2550mm Stein beige VIGOUR Standardfarbe: weiß', price: 168.00, widthCm: 99.7, heightCm: null, lengthCm: 255 },
  { productId: 'V3WV09', name: 'Wandverkleidung 3.0 Alu 1497x 2550mm Marmor weiß VIGOUR Standardfarbe: weiß', price: 263.76, widthCm: 149.7, heightCm: null, lengthCm: 255 },
  { productId: 'TRWDSET5', name: 'TRINNITY Wandabdichtung BASIS-Set 5 qm DW bis 100 x 100 / BW bis 180 x 80 cm', price: 152.52, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'V4RKIT', name: 'Wandverkleidungsklebstoff 3.0/4.0 für Wandverkleidungspaneel VIGOUR', price: 21.54, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'V3A', name: 'Abschlussprofil 3.0 255 cm silber eloxiert VIGOUR', price: 29.51, widthCm: null, heightCm: null, lengthCm: 255 },
  { productId: 'V4RPKIT', name: '3.0 / 4.0 Profilklebstoff für Wandverkleidungsprofil VIGOUR', price: 21.54, widthCm: null, heightCm: null, lengthCm: null },

  // Existing Slate items with dimensions
  { productId: 'SLA180100', name: 'Duschwanne Slate 180x100x3cm Mineralguss weiss Nuovvo', price: 556.92, widthCm: 180, heightCm: 3, lengthCm: 100 },
  { productId: 'SLA160100', name: 'Duschwanne Slate 160x100x3cm Mineralguss weiss Nuovvo', price: 513.45, widthCm: 160, heightCm: 3, lengthCm: 100 },
  { productId: 'SLA140100', name: 'Duschwanne Slate 140x100x3cm Mineralguss weiss Nuovvo', price: 464.31, widthCm: 140, heightCm: 3, lengthCm: 100 },
  { productId: 'SLA120100', name: 'Duschwanne Slate 120x100x3cm Mineralguss weiss Nuovvo', price: 424.62, widthCm: 120, heightCm: 3, lengthCm: 100 },
  { productId: 'SLA100', name: 'Duschwanne Slate 100x100x3cm Mineralguss weiss Nuovvo', price: 373.59, widthCm: 100, heightCm: 3, lengthCm: 100 },
  { productId: 'SLA90', name: 'Duschwanne Slate 90x90x3cm Mineralguss weiss Nuovvo', price: 302.40, widthCm: 90, heightCm: 3, lengthCm: 90 },
  { productId: 'SLA80', name: 'Duschwanne Slate 80x80x3cm Mineralguss weiss Nuovvo', price: 277.83, widthCm: 80, heightCm: 3, lengthCm: 80 },

  { productId: 'TRWDB', name: 'TRINNITY Wannenabdichtband-Set 3,4 m Nass-/Trockenanbindung entspr. DIN 18534', price: 29.57, widthCm: null, heightCm: null, lengthCm: 340 },
  { productId: 'AGD9060', name: 'Ablaufgarnitur Rohbauset m. Sifon BH60mm f. Flache Duschw. m. 90mm Ablauf TRINNITY', price: 20.20, widthCm: null, heightCm: 6, lengthCm: null },
  { productId: 'KM01', name: 'Kleinmaterial klein', price: 45.00, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'KM02', name: 'Kleinmaterial groß', price: 150.00, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'STELZ', name: 'Stelzlager höhenverstellar Set', price: 20.00, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'V5FB02', name: 'Fußboden individ.5.0 1500x200mm Lava beige (8 Paneele=2,4m/2) VIGOUR', price: 159.84, widthCm: 20, heightCm: null, lengthCm: 150 },
  { productId: 'V4FK600', name: 'Flächenkleber 3.0/4.0/5.0 Fußboden und Wandverkleidungspaneele 600ml', price: 16.56, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'TRBDSET7', name: 'TRINNITY Bodenabdichtung BASIS-Set 7 qm Dichtb., Sockelb., Außen- + Innenecke', price: 278.38, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'V4FK600', name: 'Flächenkleber 3.0/4.0/5.0 Fußboden und Wandverkleidungspaneele 600ml VIGOUR', price: 16.56, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'V3V', name: 'Verbindungsprofil 3.0 255 cm silber eloxiert VIGOUR', price: 29.51, widthCm: null, heightCm: null, lengthCm: 255 },

  // Added full Slate range with dimensions
  { productId: 'SLA200100', name: 'Duschwanne Slate 200x100x3cm Mineralguss weiss Nuovvo', price: 602.91, widthCm: 200, heightCm: 3, lengthCm: 100 },
  { productId: 'SLA20090', name: 'Duschwanne Slate 200x90x3cm Mineralguss weiss Nuovvo', price: 546.84, widthCm: 200, heightCm: 3, lengthCm: 90 },
  { productId: 'SLA20080', name: 'Duschwanne Slate 200x80x3cm Mineralguss weiss Nuovvo', price: 478.80, widthCm: 200, heightCm: 3, lengthCm: 80 },
  { productId: 'SLA18090', name: 'Duschwanne Slate 180x90x3cm Mineralguss weiss Nuovvo', price: 490.14, widthCm: 180, heightCm: 3, lengthCm: 90 },
  { productId: 'SLA18080', name: 'Duschwanne Slate 180x80x3cm Mineralguss weiss Nuovvo', price: 456.12, widthCm: 180, heightCm: 3, lengthCm: 80 },
  { productId: 'SLA16090', name: 'Duschwanne Slate 160x90x3cm Mineralguss weiss Nuovvo', price: 429.03, widthCm: 160, heightCm: 3, lengthCm: 90 },
  { productId: 'SLA16080', name: 'Duschwanne Slate 160x80x3cm Mineralguss weiss Nuovvo', price: 417.06, widthCm: 160, heightCm: 3, lengthCm: 80 },
  { productId: 'SLA14090', name: 'Duschwanne Slate 140x90x3cm Mineralguss weiss Nuovvo', price: 395.01, widthCm: 140, heightCm: 3, lengthCm: 90 },
  { productId: 'SLA14080', name: 'Duschwanne Slate 140x80x3cm Mineralguss weiss Nuovvo', price: 381.15, widthCm: 140, heightCm: 3, lengthCm: 80 },
  { productId: 'SLA12090', name: 'Duschwanne Slate 120x90x3cm Mineralguss weiss Nuovvo', price: 368.55, widthCm: 120, heightCm: 3, lengthCm: 90 },
  { productId: 'SLA12080', name: 'Duschwanne Slate 120x80x3cm Mineralguss weiss Nuovvo', price: 355.95, widthCm: 120, heightCm: 3, lengthCm: 80 },
  { productId: 'SLA10090', name: 'Duschwanne Slate 100x90x3cm Mineralguss weiss Nuovvo', price: 342.72, widthCm: 100, heightCm: 3, lengthCm: 90 },
  { productId: 'SLA9085', name: 'Duschwanne Slate 90x85x3cm Mineralguss weiss Nuovvo', price: 295.47, widthCm: 90, heightCm: 3, lengthCm: 85 },
  { productId: 'SLA9080', name: 'Duschwanne Slate 90x80x3cm Mineralguss weiss Nuovvo', price: 279.09, widthCm: 90, heightCm: 3, lengthCm: 80 },
  { productId: 'SLA9075', name: 'Duschwanne Slate 90x75x3cm Mineralguss weiss Nuovvo', price: 263.34, widthCm: 90, heightCm: 3, lengthCm: 75 },
  { productId: 'SLA9070', name: 'Duschwanne Slate 90x70x3cm Mineralguss weiss Nuovvo', price: 247.59, widthCm: 90, heightCm: 3, lengthCm: 70 },
  { productId: 'SLA85', name: 'Duschwanne Slate 85x85x3cm Mineralguss weiss Nuovvo', price: 280.35, widthCm: 85, heightCm: 3, lengthCm: 85 },
  { productId: 'SLA8075', name: 'Duschwanne Slate 80x75x3cm Mineralguss weiss Nuovvo', price: 237.51, widthCm: 80, heightCm: 3, lengthCm: 75 },
  { productId: 'SLA8070', name: 'Duschwanne Slate 80x70x3cm Mineralguss weiss Nuovvo', price: 223.02, widthCm: 80, heightCm: 3, lengthCm: 70 },
  { productId: 'SLA75', name: 'Duschwanne Slate 75x75x3cm Mineralguss weiss Nuovvo', price: 224.28, widthCm: 75, heightCm: 3, lengthCm: 75 },
  { productId: 'SLA70', name: 'Duschwanne Slate 70x70x3cm Mineralguss weiss Nuovvo', price: 198.45, widthCm: 70, heightCm: 3, lengthCm: 70 },
  { productId: 'SLA20085', name: 'Duschwanne Slate 200x85x3cm Mineralguss weiss Nuovvo', price: 491.40, widthCm: 200, heightCm: 3, lengthCm: 85 },
  { productId: 'SLA20075', name: 'Duschwanne Slate 200x75x3cm Mineralguss weiss Nuovvo', price: 475.02, widthCm: 200, heightCm: 3, lengthCm: 75 },
  { productId: 'SLA20070', name: 'Duschwanne Slate 200x70x3cm Mineralguss weiss Nuovvo', price: 470.61, widthCm: 200, heightCm: 3, lengthCm: 70 },
  { productId: 'SLA19090', name: 'Duschwanne Slate 190x90x3cm Mineralguss weiss Nuovvo', price: 522.27, widthCm: 190, heightCm: 3, lengthCm: 90 },
  { productId: 'SLA19085', name: 'Duschwanne Slate 190x85x3cm Mineralguss weiss Nuovvo', price: 476.91, widthCm: 190, heightCm: 3, lengthCm: 85 },
  { productId: 'SLA19080', name: 'Duschwanne Slate 190x80x3cm Mineralguss weiss Nuovvo', price: 468.09, widthCm: 190, heightCm: 3, lengthCm: 80 },
  { productId: 'SLA19075', name: 'Duschwanne Slate 190x75x3cm Mineralguss weiss Nuovvo', price: 463.68, widthCm: 190, heightCm: 3, lengthCm: 75 },
  { productId: 'SLA19070', name: 'Duschwanne Slate 190x70x3cm Mineralguss weiss Nuovvo', price: 458.64, widthCm: 190, heightCm: 3, lengthCm: 70 },
  { productId: 'SLA190100', name: 'Duschwanne Slate 190x100x3cm Mineralguss weiss Nuovvo', price: 579.60, widthCm: 190, heightCm: 3, lengthCm: 100 },
  { productId: 'SLA18085', name: 'Duschwanne Slate 180x85x3cm Mineralguss weiss Nuovvo', price: 458.64, widthCm: 180, heightCm: 3, lengthCm: 85 },
  { productId: 'SLA18075', name: 'Duschwanne Slate 180x75x3cm Mineralguss weiss Nuovvo', price: 453.60, widthCm: 180, heightCm: 3, lengthCm: 75 },
  { productId: 'SLA18070', name: 'Duschwanne Slate 180x70x3cm Mineralguss weiss Nuovvo', price: 449.82, widthCm: 180, heightCm: 3, lengthCm: 70 },
  { productId: 'SLA17090', name: 'Duschwanne Slate 170x90x3cm Mineralguss weiss Nuovvo', price: 453.60, widthCm: 170, heightCm: 3, lengthCm: 90 },
  { productId: 'SLA17085', name: 'Duschwanne Slate 170x85x3cm Mineralguss weiss Nuovvo', price: 449.82, widthCm: 170, heightCm: 3, lengthCm: 85 },
  { productId: 'SLA17080', name: 'Duschwanne Slate 170x80x3cm Mineralguss weiss Nuovvo', price: 447.30, widthCm: 170, heightCm: 3, lengthCm: 80 },
  { productId: 'SLA17075', name: 'Duschwanne Slate 170x75x3cm Mineralguss weiss Nuovvo', price: 440.37, widthCm: 170, heightCm: 3, lengthCm: 75 },
  { productId: 'SLA17070', name: 'Duschwanne Slate 170x70x3cm Mineralguss weiss Nuovvo', price: 434.07, widthCm: 170, heightCm: 3, lengthCm: 70 },
  { productId: 'SLA170100', name: 'Duschwanne Slate 170x100x3cm Mineralguss weiss Nuovvo', price: 521.01, widthCm: 170, heightCm: 3, lengthCm: 100 },
  { productId: 'SLA16085', name: 'Duschwanne Slate 160x85x3cm Mineralguss weiss Nuovvo', price: 422.73, widthCm: 160, heightCm: 3, lengthCm: 85 },
  { productId: 'SLA16075', name: 'Duschwanne Slate 160x75x3cm Mineralguss weiss Nuovvo', price: 412.02, widthCm: 160, heightCm: 3, lengthCm: 75 },
  { productId: 'SLA16070', name: 'Duschwanne Slate 160x70x3cm Mineralguss weiss Nuovvo', price: 409.50, widthCm: 160, heightCm: 3, lengthCm: 70 },
  { productId: 'SLA15090', name: 'Duschwanne Slate 150x90x3cm Mineralguss weiss Nuovvo', price: 419.58, widthCm: 150, heightCm: 3, lengthCm: 90 },
  { productId: 'SLA15085', name: 'Duschwanne Slate 150x85x3cm Mineralguss weiss Nuovvo', price: 408.24, widthCm: 150, heightCm: 3, lengthCm: 85 },
  { productId: 'SLA15080', name: 'Duschwanne Slate 150x80x3cm Mineralguss weiss Nuovvo', price: 400.05, widthCm: 150, heightCm: 3, lengthCm: 80 },
  { productId: 'SLA15075', name: 'Duschwanne Slate 150x75x3cm Mineralguss weiss Nuovvo', price: 396.27, widthCm: 150, heightCm: 3, lengthCm: 75 },
  { productId: 'SLA15070', name: 'Duschwanne Slate 150x70x3cm Mineralguss weiss Nuovvo', price: 392.49, widthCm: 150, heightCm: 3, lengthCm: 70 },
  { productId: 'SLA150100', name: 'Duschwanne Slate 150x100x3cm Mineralguss weiss Nuovvo', price: 489.51, widthCm: 150, heightCm: 3, lengthCm: 100 },
  { productId: 'SLA14085', name: 'Duschwanne Slate 140x85x3cm Mineralguss weiss Nuovvo', price: 387.45, widthCm: 140, heightCm: 3, lengthCm: 85 },
  { productId: 'SLA14075', name: 'Duschwanne Slate 140x75x3cm Mineralguss weiss Nuovvo', price: 378.00, widthCm: 140, heightCm: 3, lengthCm: 75 },
  { productId: 'SLA14070', name: 'Duschwanne Slate 140x70x3cm Mineralguss weiss Nuovvo', price: 374.85, widthCm: 140, heightCm: 3, lengthCm: 70 },
  { productId: 'SLA13090', name: 'Duschwanne Slate 130x90x3cm Mineralguss weiss Nuovvo', price: 377.37, widthCm: 130, heightCm: 3, lengthCm: 90 },
  { productId: 'SLA13085', name: 'Duschwanne Slate 130x85x3cm Mineralguss weiss Nuovvo', price: 370.44, widthCm: 130, heightCm: 3, lengthCm: 85 },
  { productId: 'SLA13080', name: 'Duschwanne Slate 130x80x3cm Mineralguss weiss Nuovvo', price: 364.14, widthCm: 130, heightCm: 3, lengthCm: 80 },
  { productId: 'SLA13075', name: 'Duschwanne Slate 130x75x3cm Mineralguss weiss Nuovvo', price: 355.95, widthCm: 130, heightCm: 3, lengthCm: 75 },
  { productId: 'SLA13070', name: 'Duschwanne Slate 130x70x3cm Mineralguss weiss Nuovvo', price: 350.28, widthCm: 130, heightCm: 3, lengthCm: 70 },
  { productId: 'SLA130100', name: 'Duschwanne Slate 130x100x3cm Mineralguss weiss Nuovvo', price: 439.11, widthCm: 130, heightCm: 3, lengthCm: 100 },
  { productId: 'SLA12085', name: 'Duschwanne Slate 120x85x3cm Mineralguss weiss Nuovvo', price: 361.62, widthCm: 120, heightCm: 3, lengthCm: 85 },
  { productId: 'SLA12075', name: 'Duschwanne Slate 120x75x3cm Mineralguss weiss Nuovvo', price: 347.13, widthCm: 120, heightCm: 3, lengthCm: 75 },
  { productId: 'SLA12070', name: 'Duschwanne Slate 120x70x3cm Mineralguss weiss Nuovvo', price: 341.46, widthCm: 120, heightCm: 3, lengthCm: 70 },
  { productId: 'SLA11090', name: 'Duschwanne Slate 110x90x3cm Mineralguss weiss Nuovvo', price: 354.69, widthCm: 110, heightCm: 3, lengthCm: 90 },
  { productId: 'SLA11085', name: 'Duschwanne Slate 110x85x3cm Mineralguss weiss Nuovvo', price: 345.24, widthCm: 110, heightCm: 3, lengthCm: 85 },
  { productId: 'SLA11080', name: 'Duschwanne Slate 110x80x3cm Mineralguss weiss Nuovvo', price: 339.57, widthCm: 110, heightCm: 3, lengthCm: 80 },
  { productId: 'SLA11075', name: 'Duschwanne Slate 110x75x3cm Mineralguss weiss Nuovvo', price: 335.79, widthCm: 110, heightCm: 3, lengthCm: 75 },
  { productId: 'SLA11070', name: 'Duschwanne Slate 110x70x3cm Mineralguss weiss Nuovvo', price: 332.01, widthCm: 110, heightCm: 3, lengthCm: 70 },
  { productId: 'SLA110100', name: 'Duschwanne Slate 110x100x3cm Mineralguss weiss Nuovvo', price: 388.08, widthCm: 110, heightCm: 3, lengthCm: 100 },
  { productId: 'SLA10085', name: 'Duschwanne Slate 100x85x3cm Mineralguss weiss Nuovvo', price: 340.20, widthCm: 100, heightCm: 3, lengthCm: 85 },
  { productId: 'SLA21090', name: 'Duschwanne Slate 210x90x3cm Mineralguss weiss Nuovvo', price: 624.96, widthCm: 210, heightCm: 3, lengthCm: 90 },
  { productId: 'SLA10080', name: 'Duschwanne Slate 100x80x3cm Mineralguss weiss Nuovvo', price: 335.79, widthCm: 100, heightCm: 3, lengthCm: 80 },
  { productId: 'SLA10075', name: 'Duschwanne Slate 100x75x3cm Mineralguss weiss Nuovvo', price: 331.38, widthCm: 100, heightCm: 3, lengthCm: 75 },
  { productId: 'SLA10070', name: 'Duschwanne Slate 100x70x3cm Mineralguss weiss Nuovvo', price: 326.97, widthCm: 100, heightCm: 3, lengthCm: 70 },
  { productId: 'SLA250100', name: 'Duschwanne Slate 250x100x3cm Mineralguss weiss Nuovvo', price: 752.22, widthCm: 250, heightCm: 3, lengthCm: 100 },
  { productId: 'SLA210100', name: 'Duschwanne Slate 210x100x3cm Mineralguss weiss Nuovvo', price: 660.87, widthCm: 210, heightCm: 3, lengthCm: 100 },
  { productId: 'SLA21080', name: 'Duschwanne Slate 210x80x3cm Mineralguss weiss Nuovvo', price: 555.66, widthCm: 210, heightCm: 3, lengthCm: 80 },
  { productId: 'SLA21070', name: 'Duschwanne Slate 210x70x3cm Mineralguss weiss Nuovvo', price: 485.73, widthCm: 210, heightCm: 3, lengthCm: 70 }
];

(async () => {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
    console.log('Connected for seeding:', MONGODB_DB);

    const ops = products.map(p => ({
      updateOne: {
        filter: { productId: p.productId },
        update: { $set: { name: p.name, price: Number(p.price), widthCm: p.widthCm, heightCm: p.heightCm, lengthCm: p.lengthCm } },
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