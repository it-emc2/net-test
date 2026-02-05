/* eslint-disable no-undef */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../src/models/Product.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'KonfiguratorDB';

const products = [
  // Stahlrohr 35mm (Innen) — Rohrlänge = 5m, Preis pro lfm
  { productId: 'FF_01', name: 'Stahlrohr 35mm Dekor Buche hell (Innen), Preis pro lfm, Rohrlänge 5m', price: 19.5, widthCm: 3.5, heightCm: null, lengthCm: 500 },
  { productId: 'FF_02', name: 'Stahlrohr 35mm Dekor Kirsche mittel (Innen), Preis pro lfm, Rohrlänge 5m', price: 19.5, widthCm: 3.5, heightCm: null, lengthCm: 500 },
  { productId: 'FF_03', name: 'Stahlrohr 35mm Dekor Nussbaum (Innen), Preis pro lfm, Rohrlänge 5m', price: 19.5, widthCm: 3.5, heightCm: null, lengthCm: 500 },
  { productId: 'FF_04', name: 'Stahlrohr 35mm Dekor Wurzelholz (Innen), Preis pro lfm, Rohrlänge 5m', price: 19.5, widthCm: 3.5, heightCm: null, lengthCm: 500 },
  { productId: 'FF_05', name: 'Stahlrohr 35mm Dekor Eiche hell (Innen), Preis pro lfm, Rohrlänge 5m', price: 19.5, widthCm: 3.5, heightCm: null, lengthCm: 500 },
  { productId: 'FF_06', name: 'Stahlrohr 35mm Dekor Eiche mittel (Innen), Preis pro lfm, Rohrlänge 5m', price: 19.5, widthCm: 3.5, heightCm: null, lengthCm: 500 },
  { productId: 'FF_07', name: 'Stahlrohr 35mm Dekor Eiche dunkel (Innen), Preis pro lfm, Rohrlänge 5m', price: 19.5, widthCm: 3.5, heightCm: null, lengthCm: 500 },
  { productId: 'FF_08', name: 'Stahlrohr 35mm Dekor Messing Längsstruktur (Innen), Preis pro lfm, Rohrlänge 5m', price: 19.5, widthCm: 3.5, heightCm: null, lengthCm: 500 },
  { productId: 'FF_09', name: 'Stahlrohr 35mm Dekor Schwarz mit Silberstreifen (Innen), Preis pro lfm, Rohrlänge 5m', price: 19.5, widthCm: 3.5, heightCm: null, lengthCm: 500 },
  { productId: 'FF_10', name: 'Stahlrohr 35mm Dekor Silber matt (Innen), Preis pro lfm, Rohrlänge 5m', price: 19.5, widthCm: 3.5, heightCm: null, lengthCm: 500 },
  { productId: 'FF_12', name: 'Stahlrohr 35mm Dekor Weiß (Innen), Preis pro lfm, Rohrlänge 5m', price: 19.5, widthCm: 3.5, heightCm: null, lengthCm: 500 },
  { productId: 'FF_13', name: 'Stahlrohr 35mm Dekor Rot (Innen), Preis pro lfm, Rohrlänge 5m', price: 19.5, widthCm: 3.5, heightCm: null, lengthCm: 500 },
  { productId: 'FF_14', name: 'Stahlrohr 35mm Dekor Golden Rust (Innen), Preis pro lfm, Rohrlänge 5m', price: 19.5, widthCm: 3.5, heightCm: null, lengthCm: 500 },

  { productId: 'FF_15', name: 'Stahlrohr 35mm Dekor Eiche gekalkt (Innen), Preis pro lfm, Rohrlänge 5m', price: 21.5, widthCm: 3.5, heightCm: null, lengthCm: 500 },
  { productId: 'FF_18', name: 'Stahlrohr 35mm Dekor Anthrazitgrau mit Silberstreif (Innen), Preis pro lfm, Rohrlänge 5m', price: 21.5, widthCm: 3.5, heightCm: null, lengthCm: 500 },
  { productId: 'FF_22', name: 'Stahlrohr 35mm Dekor Birnbaum dunkel mit Struktur (Innen), Preis pro lfm, Rohrlänge 5m', price: 21.5, widthCm: 3.5, heightCm: null, lengthCm: 500 },
  { productId: 'FF_90', name: 'Stahlrohr 35mm Dekor Esche weiß (Innen), Preis pro lfm, Rohrlänge 5m', price: 21.5, widthCm: 3.5, heightCm: null, lengthCm: 500 },
  { productId: 'FF_91', name: 'Stahlrohr 35mm Dekor Eiche Creme (Innen), Preis pro lfm, Rohrlänge 5m', price: 21.5, widthCm: 3.5, heightCm: null, lengthCm: 500 },
  { productId: 'FF_92', name: 'Stahlrohr 35mm Dekor Eiche hellbraun (Innen), Preis pro lfm, Rohrlänge 5m', price: 21.5, widthCm: 3.5, heightCm: null, lengthCm: 500 },
  { productId: 'FF_93', name: 'Stahlrohr 35mm Dekor Grau Holzstruktur (Innen), Preis pro lfm, Rohrlänge 5m', price: 21.5, widthCm: 3.5, heightCm: null, lengthCm: 500 },
  { productId: 'FF_94', name: 'Stahlrohr 35mm Dekor Eiche Sand (Innen), Preis pro lfm, Rohrlänge 5m', price: 21.5, widthCm: 3.5, heightCm: null, lengthCm: 500 },

  { productId: 'FF_SL01', name: 'Zuschnitt (nur auf volle 10 cm)', price: 8.0, widthCm: null, heightCm: null, lengthCm: null },

  // Plexiglas (Innen)
  { productId: 'FF_20', name: 'Plexiglas Handlauf Ø35mm Vollmaterial (Innen), Länge 3,0m', price: 270.0, widthCm: 3.5, heightCm: null, lengthCm: 300 },

  // Massivholz (Innen)
  { productId: 'FF_30', name: 'Massivholz Handlauf Ø35mm Buche (Innen), Länge 1,0m', price: 38.0, widthCm: 3.5, heightCm: null, lengthCm: 100 },
  { productId: 'FF_30a', name: 'Massivholz Handlauf Ø35mm Buche (Innen), Länge 0,5m', price: 22.0, widthCm: 3.5, heightCm: null, lengthCm: 50 },
  { productId: 'FF_31', name: 'Massivholz Handlauf Ø35mm Eiche (Innen), Länge 1,0m', price: 42.0, widthCm: 3.5, heightCm: null, lengthCm: 100 },
  { productId: 'FF_31a', name: 'Massivholz Handlauf Ø35mm Eiche (Innen), Länge 0,5m', price: 24.0, widthCm: 3.5, heightCm: null, lengthCm: 50 },
  { productId: 'FF_32', name: 'Massivholz Handlauf Ø35mm Ahorn (Innen), Länge 1,0m', price: 42.0, widthCm: 3.5, heightCm: null, lengthCm: 100 },
  { productId: 'FF_33', name: 'Massivholz Handlauf Ø35mm Mahagoni (Innen), Länge 1,0m', price: 42.0, widthCm: 3.5, heightCm: null, lengthCm: 100 },

  // Handlaufhalter (Innen)
  { productId: 'FF_H02', name: 'Handlaufhalter (Innen) Schwarz', price: 12.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_H03', name: 'Handlaufhalter (Innen) Chrom glanz', price: 12.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_H04', name: 'Handlaufhalter (Innen) Chrom matt', price: 12.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_H05', name: 'Handlaufhalter (Innen) Messing brüniert', price: 15.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_H06', name: 'Handlaufhalter (Innen) Weiß', price: 12.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_H09', name: 'Handlaufhalter (Innen) Messing hochglanz', price: 15.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_H10', name: 'Handlaufhalter (Innen) Anthrazit', price: 12.5, widthCm: null, heightCm: null, lengthCm: null },

  // Wandabschlussbogen (Innen)
  { productId: 'FF_W02', name: 'Wandabschlussbogen (Innen) Schwarz', price: 19.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_W03', name: 'Wandabschlussbogen (Innen) Chrom glanz', price: 19.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_W04', name: 'Wandabschlussbogen (Innen) Chrom matt', price: 19.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_W05', name: 'Wandabschlussbogen (Innen) Messing brüniert', price: 23.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_W06', name: 'Wandabschlussbogen (Innen) Weiß', price: 19.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_W09', name: 'Wandabschlussbogen (Innen) Messing hochglanz', price: 23.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_W10', name: 'Wandabschlussbogen (Innen) Anthrazit', price: 19.0, widthCm: null, heightCm: null, lengthCm: null },

  // Flexo-Gelenk (Innen)
  { productId: 'FF_F02', name: 'Flexo-Gelenk (Innen) Schwarz', price: 23.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_F03', name: 'Flexo-Gelenk (Innen) Chrom glanz', price: 23.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_F04', name: 'Flexo-Gelenk (Innen) Chrom matt', price: 23.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_F05', name: 'Flexo-Gelenk (Innen) Messing brüniert', price: 25.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_F06', name: 'Flexo-Gelenk (Innen) Weiß', price: 23.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_F09', name: 'Flexo-Gelenk (Innen) Messing hochglanz', price: 25.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_F10', name: 'Flexo-Gelenk (Innen) Anthrazit', price: 23.0, widthCm: null, heightCm: null, lengthCm: null },

  // Decken-/Wand-/Bodenplatte (Innen)
  { productId: 'FF_D02', name: 'Decken-/Wand-/Bodenplatte (Innen) Schwarz', price: 12.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_D03', name: 'Decken-/Wand-/Bodenplatte (Innen) Chrom glanz', price: 12.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_D04', name: 'Decken-/Wand-/Bodenplatte (Innen) Chrom matt', price: 12.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_D05', name: 'Decken-/Wand-/Bodenplatte (Innen) Messing brüniert', price: 13.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_D06', name: 'Decken-/Wand-/Bodenplatte (Innen) Weiß', price: 12.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_D09', name: 'Decken-/Wand-/Bodenplatte (Innen) Messing hochglanz', price: 13.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_D10', name: 'Decken-/Wand-/Bodenplatte (Innen) Anthrazit', price: 12.5, widthCm: null, heightCm: null, lengthCm: null },

  // T-Bogen (Innen)
  { productId: 'FF_T02', name: 'T-Bogen (Innen) Schwarz', price: 22.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_T03', name: 'T-Bogen (Innen) Chrom glanz', price: 22.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_T04', name: 'T-Bogen (Innen) Chrom matt', price: 22.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_T05', name: 'T-Bogen (Innen) Messing brüniert', price: 23.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_T06', name: 'T-Bogen (Innen) Weiß', price: 22.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_T09', name: 'T-Bogen (Innen) Messing hochglanz', price: 23.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_T10', name: 'T-Bogen (Innen) Anthrazit', price: 22.5, widthCm: null, heightCm: null, lengthCm: null },

  // 90-Grad-Bogen (Innen)
  { productId: 'FF_B02', name: '90-Grad-Bogen (Innen) Schwarz', price: 13.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_B03', name: '90-Grad-Bogen (Innen) Chrom glanz', price: 13.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_B04', name: '90-Grad-Bogen (Innen) Chrom matt', price: 13.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_B05', name: '90-Grad-Bogen (Innen) Messing brüniert', price: 15.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_B06', name: '90-Grad-Bogen (Innen) Weiß', price: 13.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_B09', name: '90-Grad-Bogen (Innen) Messing hochglanz', price: 15.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_B10', name: '90-Grad-Bogen (Innen) Anthrazit', price: 13.0, widthCm: null, heightCm: null, lengthCm: null },

  // Sonderabschluss (Innen)
  { productId: 'FF_S02', name: 'Sonderabschluss (Innen) Schwarz', price: 11.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_S03', name: 'Sonderabschluss (Innen) Chrom glanz', price: 11.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_S04', name: 'Sonderabschluss (Innen) Chrom matt', price: 11.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_S05', name: 'Sonderabschluss (Innen) Messing brüniert', price: 13.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_S06', name: 'Sonderabschluss (Innen) Weiß', price: 11.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_S09', name: 'Sonderabschluss (Innen) Messing hochglanz', price: 13.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_S10', name: 'Sonderabschluss (Innen) Anthrazit', price: 11.5, widthCm: null, heightCm: null, lengthCm: null },

  // Aluminiumrohr 35mm (Innen/Außen) — Rohrlänge = 6m, Preis pro lfm
  { productId: 'FF_50', name: 'Aluminiumrohr 35mm Weiß (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_51', name: 'Aluminiumrohr 35mm Schwarz (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_52', name: 'Aluminiumrohr 35mm Stahlblau (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_53', name: 'Aluminiumrohr 35mm Aluminiumoptik (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_54', name: 'Aluminiumrohr 35mm Dunkelgrau (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_55', name: 'Aluminiumrohr 35mm Anthrazitgrau (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_56', name: 'Aluminiumrohr 35mm Rost (Rustic Steel) (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_57', name: 'Aluminiumrohr 35mm Golden Oak (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_59', name: 'Aluminiumrohr 35mm Balsamico (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_60', name: 'Aluminiumrohr 35mm Mahagoni (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_61', name: 'Aluminiumrohr 35mm Nussbaum (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_62', name: 'Aluminiumrohr 35mm Mooreiche (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_64', name: 'Aluminiumrohr 35mm Rot (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_65', name: 'Aluminiumrohr 35mm Gelb (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_66', name: 'Aluminiumrohr 35mm Birke (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_71', name: 'Aluminiumrohr 35mm Eiche Schokolade (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_72', name: 'Aluminiumrohr 35mm Eiche Polar (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_73', name: 'Aluminiumrohr 35mm Eiche Rauch (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_74', name: 'Aluminiumrohr 35mm Betongrau (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_75', name: 'Aluminiumrohr 35mm Schiefer (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_76', name: 'Aluminiumrohr 35mm Vitriolgrün (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_77', name: 'Aluminiumrohr 35mm Dunkelgrün (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_82', name: 'Aluminiumrohr 35mm Hammerschlag Anthrazit (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_83', name: 'Aluminiumrohr 35mm Rubinrot (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_84', name: 'Aluminiumrohr 35mm Irish Oak (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },
  { productId: 'FF_85', name: 'Aluminiumrohr 35mm Oak Khaki (Innen/Außen), Preis pro lfm, Rohrlänge 6m', price: 29.0, widthCm: 3.5, heightCm: null, lengthCm: 600 },

  { productId: 'FF_69', name: 'Edelstahl-Rohr / Deco-Rohr TIG geschweißt 320 Korn (Innen/Außen), Preis pro lfm', price: 39.0, widthCm: 3.5, heightCm: null, lengthCm: null },

  // Material in Edelstahl (Außenbereich) inkl. Standardschrauben + Dübel
  { productId: 'FF_E01', name: 'Edelstahlstütze betonieren (120 cm), mit Gewindebohrung', price: 40.0, widthCm: null, heightCm: 120, lengthCm: null },
  { productId: 'FF_E02', name: 'Edelstahlstütze betonieren (150 cm), mit Gewindebohrung', price: 45.0, widthCm: null, heightCm: 150, lengthCm: null },
  { productId: 'FF_E05', name: 'Edelstahlstütze Bodenbefestigung mit Schrauben', price: 54.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_E08', name: 'Abdeckrosette (halbrund)', price: 11.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_E11', name: 'Edelstahlstütze seitl. Befestigung (20 mm)', price: 65.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_E12', name: 'Edelstahlstütze seitl. Befestigung (40 mm)', price: 65.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_E22c', name: 'Auflage waagrecht lang', price: 24.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_E22d', name: 'Auflage flexibel lang', price: 25.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_E27', name: 'Handlaufhalter 7,5 cm bis Handlaufmitte', price: 20.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_E28', name: 'Handlaufhalter 10 cm bis Handlaufmitte', price: 21.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_E29', name: 'Handlaufhalter 12,5 cm bis Handlaufmitte', price: 23.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_E30', name: 'Handlaufhalter 15 cm bis Handlaufmitte', price: 26.0, widthCm: null, heightCm: null, lengthCm: null },

  { productId: 'FF_KE04B', name: 'Überschubendkugel zum Kleben (Kleber nicht im Preis enthalten)', price: 22.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_KFS12', name: 'Abschlusskappe flach Außenbefestigung zum Kleben (Kleber nicht im Preis enthalten)', price: 21.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_KFS13', name: 'Abschlusskappe flach Innenbefestigung zum Kleben (Kleber nicht im Preis enthalten)', price: 22.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_A06', name: 'Wandanschluss gerade Außenbefestigung', price: 22.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_S0001', name: 'Wandanschluss schräg für 35 mm Rohr mit Kugelverbindung', price: 95.0, widthCm: null, heightCm: null, lengthCm: null },

  // Beschläge in Edelstahl (Außenbereich) — 6 cm bis Handlaufmitte
  { productId: 'FF_H07', name: 'Handlaufhalter Standard 6 cm bis Handlaufmitte (Edelstahl gebürstet)', price: 21.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_W07', name: 'Wandabschlussbogen Edelstahl gebürstet', price: 28.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_F07', name: 'Flexo-Gelenk Edelstahl gebürstet', price: 32.0, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_D07', name: 'Decken-/Wand-/Boden-Platte Edelstahl gebürstet', price: 21.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_B07', name: '90 Grad-Bogen Edelstahl gebürstet', price: 21.5, widthCm: null, heightCm: null, lengthCm: null },
  { productId: 'FF_S07', name: 'Sonderabschluss Edelstahl gebürstet', price: 15.0, widthCm: null, heightCm: null, lengthCm: null }
];

(async () => {
  try {
    if (!MONGODB_URI) throw new Error('Missing MONGODB_URI in environment');

    await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
    console.log('Connected for seeding:', MONGODB_DB);

    const ops = products.map((p) => ({
      updateOne: {
        filter: { productId: p.productId },
        update: {
          $set: {
            productId: p.productId,
            name: p.name,
            price: Number(p.price),
            widthCm: p.widthCm ?? null,
            heightCm: p.heightCm ?? null,
            lengthCm: p.lengthCm ?? null,
            source: 'flexofit'
          }
        },
        upsert: true
      }
    }));

    const result = await Product.bulkWrite(ops, { ordered: false });
    console.log('Seed result:', {
      upserted: result.upsertedCount,
      modified: result.modifiedCount,
      matched: result.matchedCount
    });
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();