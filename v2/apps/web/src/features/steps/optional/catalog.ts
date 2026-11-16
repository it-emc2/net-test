// The categories and products of "Optionale Produkte" (Badumbau) as today's page has them:
// article, the field group and the value the offer stores for a ticked product, the caption,
// the picture and the label of the quantity. Generated from src/public/index.html
// (#page-Optional) — today the products are part of the page, not catalogue data.
export interface Product {
  /** article number as today's fields use it (`qty_<id>`) */
  id: string;
  /** the stored list a ticked product is in, e.g. "optGrab[]" */
  group: string;
  /** what that list holds for this product */
  value: string;
  name: string;
  img: string;
  qtyLabel: string;
  /** shower systems: fits a tap directly below the rail, or one that is offset */
  mount?: "versetzt" | "direkt";
  /** accessories that come with a product of their category */
  block?: "tap" | "basin" | "wesgh";
  tags?: readonly string[];
}
export interface Category { id: string; name: string; img: string; products: readonly Product[] }

export const CATEGORIES: readonly Category[] = [
 { "id": "SHOWER", "name": "Auswechseln des Duschsystems", "img": "/assets/cbad82d117faadf930fcafe8273ddc83.jpg",
  "products": [
   { "id": "V22WS1R", "group": "optShower[]", "value": "Wannenset individual 2.2 m.Wandhalter Schlauch u.HB 1-str. rund verchr. VIGOUR V22WS1R", "name": "Wannenset individual 2.2 m.Wandhalter Schlauch u.HB 1-str. rund verchr. V22WS1R", "img": "/assets/V22WS1R.jpg", "qtyLabel": "Menge V22WS1R", "mount": "versetzt" },
   { "id": "TEMPDSU250", "group": "optShower[]", "value": "Duschsystem Tempesta Flex verchromt m.Umstellung KB 210mm Brausegarn. Große TEMPDSU250", "name": "Duschsystem Tempesta Flex verchromt m.Umstellung KB 210mm Brausegarn. Große TEMPDSU250", "img": "/assets/cbad82d117faadf930fcafe8273ddc83.jpg", "qtyLabel": "Menge TEMPDSU250", "mount": "versetzt" },
   { "id": "DESIBS160", "group": "optShower[]", "value": "Design-Brauseschlauch V3 1/2\"x1/2\"x160cm verdrehsicher verchromt VIGOUR DESIBS160", "name": "Design-Brauseschlauch V3 160 cm verdrehsicher verchromt DESIBS160", "img": "/assets/DESIBS160.jpg", "qtyLabel": "Menge DESIBS160", "mount": "versetzt" },
   { "id": "V22BG903R", "group": "optShower[]", "value": "Brausegarnitur individ.2.2 m.Stange 90cm Schlauch u.HB 3-str. rund verchr. VIGOUR V22BG903R", "name": "Brausegarnitur individ.2.2 m.Stange 90cm Schlauch u.HB 3-str. rund verchr. V22BG903R", "img": "/assets/V22BG903R.jpg", "qtyLabel": "Menge V22BG903R", "mount": "versetzt" },
   { "id": "V12DS250E", "group": "optShower[]", "value": "Duschsystem V1 Thermostat KB 250mm edge HB V1 5-fach u. Schlauch verchr. VIGOUR V12DS250E", "name": "Duschsystem V1 Thermostat KB 250mm edge HB V1 5-fach u. Schlauch verchr. V12DS250E", "img": "/assets/v12ds250e.jpg", "qtyLabel": "Menge V12DS250E", "mount": "direkt" },
   { "id": "STRAYT", "group": "optShower[]", "value": "Duschsäule m.Thermostat Strayt STRAYT", "name": "Duschsäule m.Thermostat Strayt Chrom Poliert", "img": "/assets/STRAYT.jpg", "qtyLabel": "Menge STRAYT", "mount": "direkt" }
  ] },
 { "id": "GRAB", "name": "Anbringen zusätzlicher Haltegriffe", "img": "/assets/CLPESG60.jpg",
  "products": [
   { "id": "CLPESG30", "group": "optGrab[]", "value": "Haltegriff clivia V2 plus 300mm m. Ros. Edelstahl glatt poliert,VIGOUR CLPESG30", "name": "Haltegriff clivia V2 plus 300mm m. Ros. Edelstahl glatt poliert CLPESG30", "img": "/assets/5b817c33100c0121ede70f11e341601c.jpg", "qtyLabel": "Menge CLPESG30" },
   { "id": "CLPESG40", "group": "optGrab[]", "value": "Haltegriff clivia plus 32/400mm Edelstahl poliert VIGOUR CLPESG40", "name": "Haltegriff clivia plus 32/400mm Edelstahl poliert CLPESG40", "img": "/assets/5b817c33100c0121ede70f11e341601c.jpg", "qtyLabel": "Menge CLPESG40" },
   { "id": "CLPESG60", "group": "optGrab[]", "value": "Haltegriff clivia plus 32/600mm Edelstahl poliert VIGOUR CLPESG60", "name": "Haltegriff clivia plus 32/600mm Edelstahl poliert CLPESG60", "img": "/assets/CLPESG60.jpg", "qtyLabel": "Menge CLPESG60" },
   { "id": "CLPESG80", "group": "optGrab[]", "value": "Haltegriff clivia plus 32/800mm Edelstahl poliert VIGOUR CLPESG80", "name": "Haltegriff clivia plus 32/800mm Edelstahl poliert CLPESG80", "img": "/assets/CLPESG80.jpg", "qtyLabel": "Menge CLPESG80" }
  ] },
 { "id": "FOLD", "name": "Anbringen zusätzlicher Stützklappgriffe", "img": "/assets/DEPSKG60.jpg",
  "products": [
   { "id": "DEPSKG60", "group": "optFold[]", "value": "Stützklappgriff derby plus 600mm verchromt VIGOUR DEPSKG60", "name": "Stützklappgriff derby plus 600mm verchromt DEPSKG60 max. Belastung: 100 kg", "img": "/assets/DEPSKG60.jpg", "qtyLabel": "Menge DEPSKG60" },
   { "id": "DEPSKG85", "group": "optFold[]", "value": "Stützklappgriff derby plus 850mm verchromt VIGOUR DEPSKG85", "name": "Stützklappgriff derby plus 850mm verchromt DEPSKG85 max. Belastung: 100 kg", "img": "/assets/DEPSKG85.jpg", "qtyLabel": "Menge DEPSKG85" }
  ] },
 { "id": "BASIN", "name": "Auswechseln eines Waschtisches ohne Unterschrank", "img": "/assets/CL60.jpg",
  "products": [
   { "id": "CL60", "group": "optBasin[]", "value": "Waschtisch clivia 60x48 cm weiß VIGOUR CL60", "name": "Waschtisch clivia 60x48 cm weiß CL60", "img": "/assets/CL60.jpg", "qtyLabel": "Menge CL60" },
   { "id": "CL65", "group": "optBasin[]", "value": "Waschtisch clivia 65x48 cm weiß VIGOUR CL65", "name": "Waschtisch clivia 65x48 cm weiß CL65", "img": "/assets/CL60.jpg", "qtyLabel": "Menge CL65" },
   { "id": "CL55", "group": "optBasin[]", "value": "Waschtisch clivia 55x48 cm weiß VIGOUR CL55", "name": "Waschtisch clivia 55x48 cm weiß CL55", "img": "/assets/CL60.jpg", "qtyLabel": "Menge CL55" },
   { "id": "ON35", "group": "optBasin[]", "value": "Handwaschbecken one V1 35 x 28cm weiß VIGOUR ON35", "name": "Handwaschbecken one V1 35 x 28cm weiß ON35", "img": "/assets/Washbecken/ON35.jpg", "qtyLabel": "Menge ON35" },
   { "id": "COAIR40", "group": "optBasin[]", "value": "Handwaschbecken Connect Air 40x35 cm 1 Hahnloch mit Überlauf weiß Ideal Standard COAIR40", "name": "Handwaschbecken Connect Air 40x35 cm weiß COAIR40", "img": "/assets/COAIR40.jpg", "qtyLabel": "Menge COAIR40" },
   { "id": "DEP65U", "group": "optBasin[]", "value": "Waschtisch derby plus care 65x55 cm unterfahrbar weiss VIGOUR DEP65U", "name": "Waschtisch derby plus care 65x55 cm DEP65U", "img": "/assets/DEP65U.jpg", "qtyLabel": "Menge DEP65U" },
   { "id": "BASIN_SONDER", "group": "optBasin[]", "value": "Sonderprodukt (freier Posten)", "name": "Sonderprodukt (freier Posten)", "img": "", "qtyLabel": "" },
   { "id": "WTBF", "group": "optBasinAcc[]", "value": "Befestigungssatz Fischer WST 10x140 2 Stk. / Waschtisch WTBF", "name": "Befestigungssatz Fischer WST 10x140 2 Stk. / Waschtisch WTBF", "img": "/assets/WTBF.jpg", "qtyLabel": "Menge", "block": "basin", "tags": ["Automatisch hinzugefügt", "Zwingend erforderlich"] },
   { "id": "RSL", "group": "optBasinAcc[]", "value": "Waschtisch-Röhrensiphon 1 1/4\"G mit Verstellrohr 120mm TRINNITY RSL", "name": "Waschtisch-Röhrensiphon 1 1/4\"G mit Verstellrohr 120mm RSL", "img": "/assets/51bbb10784d76d7201b75bfdf7af1b4b.jpg", "qtyLabel": "Menge", "block": "basin", "tags": ["Automatisch hinzugefügt", "Zwingend erforderlich"] },
   { "id": "EV", "group": "optBasinAcc[]", "value": "SCHELL Eckventil COMFORT regulierbar ASAG 1/2\" chrom EV", "name": "SCHELL Eckventil COMFORT regulierbar ASAG 1/2\" chrom EV", "img": "/assets/5916012808665944212.jpg", "qtyLabel": "Menge", "block": "basin", "tags": ["Automatisch hinzugefügt", "Optional · abwählbar"] }
  ] },
 { "id": "BASIN_TAP", "name": "Einbau einer Einhand‑Waschtischbatterie", "img": "/assets/DEPOH.jpg",
  "products": [
   { "id": "CL_BASIN", "group": "optBasinTap[]", "value": "Einhand-Waschtischbatterie clivia mit Ablaufgarnitur verchromt VIGOUR CL", "name": "Einhand-Waschtischbatterie clivia mit Ablaufgarnitur verchromt CL", "img": "/assets/CL.jpg", "qtyLabel": "Menge CL" },
   { "id": "DEPOH", "group": "optBasinTap[]", "value": "Einhand-Waschtischbatterie derby plus mit Hebel offen m.Ablg. verchromt VIGOUR DEPOH", "name": "Einhand-Waschtischbatterie derby plus mit Hebel offen m.Ablg. verchromt DEPOH", "img": "/assets/DEPOH.jpg", "qtyLabel": "Menge DEPOH" },
   { "id": "ONSHB", "group": "optBasinTap[]", "value": "Einhand-Spültischbatterie one V1 mit schwenkb. Gussausl. und herausziehb.Handbrause VIGOUR ONSHB", "name": "Einhand-Spültischbatterie one V1 mit schwenkb. Gussausl. und herausziehb.Handbrause VIGOUR ONSHB", "img": "/assets/ONSHB.jpg", "qtyLabel": "Menge ONSHB" },
   { "id": "YNORGH21825", "group": "optBasinTapAcc[]", "value": "Abdeckrosette one verchromt VIGOUR YNORGH21825", "name": "Abdeckrosette one verchromt VIGOUR YNORGH21825", "img": "/assets/Abdeckrosette .png", "qtyLabel": "Menge YNORGH21825", "block": "tap" }
  ] },
 { "id": "THERMO", "name": "Austausch eines Thermostates", "img": "/assets/591601280866594421.jpg",
  "products": [
   { "id": "CLTB", "group": "optThermo[]", "value": "AP-Brause-Thermostat clivia, ohne Brausegarnitur CLTB", "name": "AP-Brause-Thermostat clivia, ohne Brausegarnitur CLTB", "img": "/assets/5916012808665944211.jpg", "qtyLabel": "Menge CLTB" },
   { "id": "DEPTB", "group": "optThermo[]", "value": "AP-Brause-Thermostat derby plus m.therm. Desinfektion Safe-Tec verchromt VIGOUR DEPTB", "name": "AP-Brause-Thermostat derby plus m.therm. Desinfektion Safe-Tec verchromt DEPTB", "img": "/assets/DEPTB.png", "qtyLabel": "Menge DEPTB" },
   { "id": "CLB", "group": "optThermo[]", "value": "Einhand-Aufputz-Brausebatterie clivia ohne Brausegarnitur verchromt VIGOUR CLB", "name": "Einhand-Aufputz-Brausebatterie clivia ohne Brausegarnitur verchromt CLB", "img": "/assets/Einhand-Aufputz-Brausebatterie-clivia-ohne-Brausegarnitur-verchromt-VIGOUR.jpg", "qtyLabel": "Menge CLB" }
  ] },
 { "id": "SEAT", "name": "Duschhocker", "img": "/assets/78090000.jpg",
  "products": [
   { "id": "DEPKS", "group": "optSeat[]", "value": "Klappsitz derby plus 362x91x381mm bis 110kg verchromt VIGOUR DEPKS", "name": "Klappsitz derby plus 362x91x381mm bis 110kg verchromt DEPKS", "img": "/assets/DEPKS.jpg", "qtyLabel": "Menge DEPKS" },
   { "id": "78090000", "group": "optSeat[]", "value": "Duschhocker mit Soft-Drehsitz und Ablage, Wendig unter der Dusche", "name": "Duschhocker mit Soft-Drehsitz und Ablage, Wendig unter der Dusche, Max 150 kg", "img": "/assets/78090000.jpg", "qtyLabel": "Menge 78090000" },
   { "id": "CLPESDH", "group": "optSeat[]", "value": "Duschhocker clivia V2 plus Sitzfläche we geschäumt.Edelstahl glatt poliert,VIGOUR", "name": "Duschhocker clivia V2 plus Sitzfläche we geschäumt.Edelstahl glatt poliert Max 200 kg CLPESDH", "img": "/assets/CLPESDH.jpg", "qtyLabel": "Menge CLPESDH" }
  ] },
 { "id": "METER", "name": "Abdichtung Rohrmanschette", "img": "/assets/TECEADS.jpg",
  "products": [
   { "id": "TECEADS", "group": "optMeter[]", "value": "TECE ADS Abdichtung/Verlegung pro Meter TECEADS", "name": "Tece Seal System Abdichtungsset für Wanddurchführungen", "img": "/assets/TECEADS.jpg", "qtyLabel": "Menge TECEADS" }
  ] },
 { "id": "REHA", "name": "REHA-Team", "img": "/assets/reha-team.png",
  "products": [
   { "id": "24081000", "group": "optReha[]", "value": "VitaL Hüftkissen schwarz 24081000", "name": "VitaL Hüftkissen schwarz 24081000", "img": "/assets/24081000.jpg", "qtyLabel": "Menge 24081000" },
   { "id": "24081100", "group": "optReha[]", "value": "VitaL Hüftkissen blau 24081100", "name": "VitaL Hüftkissen blau 24081100", "img": "/assets/24081100.jpg", "qtyLabel": "Menge 24081100" },
   { "id": "24081500", "group": "optReha[]", "value": "VitaL Steißbeinkissen schwarz 24081500", "name": "VitaL Steißbeinkissen schwarz 24081500", "img": "/assets/24081500.jpg", "qtyLabel": "Menge 24081500" },
   { "id": "24081600", "group": "optReha[]", "value": "VitaL Steißbeinkissen blau 24081600", "name": "VitaL Steißbeinkissen blau 24081600", "img": "/assets/24081600.jpg", "qtyLabel": "Menge 24081600" },
   { "id": "24081005", "group": "optReha[]", "value": "Bezug zu VitaL Hüftkissen schwarz 24081005", "name": "Bezug zu VitaL Hüftkissen schwarz 24081005", "img": "/assets/24081005.jpg", "qtyLabel": "Menge 24081005" },
   { "id": "24081105", "group": "optReha[]", "value": "Bezug zu VitaL Hüftkissen blau 24081105", "name": "Bezug zu VitaL Hüftkissen blau 24081105", "img": "/assets/24081105.jpg", "qtyLabel": "Menge 24081105" },
   { "id": "24081505", "group": "optReha[]", "value": "Bezug zu VitaL Steißbeinkissen schwarz 24081505", "name": "Bezug zu VitaL Steißbeinkissen schwarz 24081505", "img": "/assets/24081505.jpg", "qtyLabel": "Menge 24081505" },
   { "id": "24081605", "group": "optReha[]", "value": "Bezug zu VitaL Steißbeinkissen blau 24081605", "name": "Bezug zu VitaL Steißbeinkissen blau 24081605", "img": "/assets/24081605.jpg", "qtyLabel": "Menge 24081605" },
   { "id": "25670000", "group": "optReha[]", "value": "RUSSKA Sitzring 25670000", "name": "RUSSKA Sitzring 25670000", "img": "/assets/25670000.jpg", "qtyLabel": "Menge 25670000" },
   { "id": "24081800", "group": "optReha[]", "value": "VitaL Hüftkissen Mobil/Auto 24081800", "name": "VitaL Hüftkissen Mobil/Auto 24081800", "img": "/assets/24081800.jpg", "qtyLabel": "Menge 24081800" },
   { "id": "24096000", "group": "optReha[]", "value": "RUSSKA Komfort-Sitzkissen 24096000", "name": "RUSSKA Komfort-Sitzkissen 24096000", "img": "/assets/24096000.jpg", "qtyLabel": "Menge 24096000" },
   { "id": "24097000", "group": "optReha[]", "value": "RUSSKA Kissen zur Sitzerhöhung 24097000", "name": "RUSSKA Kissen zur Sitzerhöhung 24097000", "img": "/assets/24097000.jpg", "qtyLabel": "Menge 24097000" },
   { "id": "24096240", "group": "optReha[]", "value": "RUSSKA Kissen zur Sitzerhöhung 24096240", "name": "RUSSKA Kissen zur Sitzerhöhung 24096240", "img": "/assets/24096240.jpg", "qtyLabel": "Menge 24096240" },
   { "id": "19034422", "group": "optReha[]", "value": "Lück Rhombo-therm soft Kissen 19034422", "name": "Lück Rhombo-therm soft Kissen 19034422", "img": "/assets/19034422.jpg", "qtyLabel": "Menge 19034422" },
   { "id": "35035200", "group": "optReha[]", "value": "Hepro Haltestange Gripo 35035200", "name": "Hepro Haltestange Gripo 35035200", "img": "/assets/35035200.jpg", "qtyLabel": "Menge 35035200" },
   { "id": "35035145", "group": "optReha[]", "value": "HEPRO Griffbügel Triangel 35035145", "name": "HEPRO Griffbügel Triangel 35035145", "img": "/assets/35035145.jpg", "qtyLabel": "Menge 35035145" },
   { "id": "35035148", "group": "optReha[]", "value": "HEPRO Stützbügel mit Hängegriff 35035148", "name": "HEPRO Stützbügel mit Hängegriff 35035148", "img": "/assets/35035148.jpg", "qtyLabel": "Menge 35035148" },
   { "id": "35035281", "group": "optReha[]", "value": "HEPRO Ringgriff Ø 30 cm 35035281", "name": "HEPRO Ringgriff Ø 30 cm 35035281", "img": "/assets/35035281.jpg", "qtyLabel": "Menge 35035281" },
   { "id": "35035280", "group": "optReha[]", "value": "HEPRO Ringgriff  Ø 40 cm 35035280", "name": "HEPRO Ringgriff Ø 40 cm 35035280", "img": "/assets/35035280.jpg", "qtyLabel": "Menge 35035280" },
   { "id": "78700800", "group": "optReha[]", "value": "RUSSKA laguna Duschhocker mit Hygieneausschnitt 78700800", "name": "RUSSKA laguna Duschhocker mit Hygieneausschnitt 78700800", "img": "/assets/78700800.jpg", "qtyLabel": "Menge 78700800" },
   { "id": "78701700", "group": "optReha[]", "value": "Duschstuhl mit Armlehnen und Rückenlehne 78701700", "name": "Duschstuhl mit Armlehnen und Rückenlehne 78701700", "img": "/assets/78701700.jpg", "qtyLabel": "Menge 78701700" },
   { "id": "78700400", "group": "optReha[]", "value": "RUSSKA laguna Duschstuhl 78700400", "name": "RUSSKA laguna Duschstuhl 78700400", "img": "/assets/78700400.jpg", "qtyLabel": "Menge 78700400" },
   { "id": "78701500", "group": "optReha[]", "value": "Duschstuhl mit Rückenlehne 78701500", "name": "Duschstuhl mit Rückenlehne 78701500", "img": "/assets/78701500.jpg", "qtyLabel": "Menge 78701500" },
   { "id": "78700750", "group": "optReha[]", "value": "Soft-Auflage zu laguna Duschstuhl 78700750", "name": "Soft-Auflage zu laguna Duschstuhl 78700750", "img": "/assets/78700750.jpg", "qtyLabel": "Menge 78700750" },
   { "id": "78700850", "group": "optReha[]", "value": "Soft-Auflage zu laguna Duschhocker und Duschstuhl mit Hygieneausschnitt 78700850", "name": "Soft-Auflage zu laguna Duschhocker und Duschstuhl mit Hygieneausschnitt 78700850", "img": "/assets/78700850.jpg", "qtyLabel": "Menge 78700850" },
   { "id": "11096600", "group": "optReha[]", "value": "RUSSKA Funk-Sensormatte Step Control rechteckig 75 x 55 x 1 cm (ohne Empfänger Plus) 11096600", "name": "RUSSKA Funk-Sensormatte Step Control rechteckig 75 x 55 x 1 cm (ohne Empfänger Plus) 11096600", "img": "/assets/11096600.jpg", "qtyLabel": "Menge 11096600" },
   { "id": "11096610", "group": "optReha[]", "value": " RUSSKA Funk-Sensormatte Step Control halbrund 110 x 70 x 1 cm (ohne Empfänger Plus) 11096610", "name": "RUSSKA Funk-Sensormatte Step Control halbrund 110 x 70 x 1 cm (ohne Empfänger Plus) 11096610", "img": "/assets/11096610.jpg", "qtyLabel": "Menge 11096610" },
   { "id": "11020600", "group": "optReha[]", "value": "RUSSKA Drehsitz Komfort 11020600", "name": "RUSSKA Drehsitz Komfort 11020600", "img": "/assets/11020600.jpg", "qtyLabel": "Menge 11020600" },
   { "id": "11020700", "group": "optReha[]", "value": "RUSSKA Aufstehhilfe: für Körpergewicht 35–105 kg 11020700", "name": "RUSSKA Aufstehhilfe: für Körpergewicht 35–105 kg 11020700", "img": "/assets/11020700.jpg", "qtyLabel": "Menge 11020700" },
   { "id": "11020710", "group": "optReha[]", "value": "Aufstehhilfe: für Körpergewicht 60–180 kg 11020710", "name": "Aufstehhilfe: für Körpergewicht 60–180 kg 11020710", "img": "/assets/11020710.jpg", "qtyLabel": "Menge 11020710" },
   { "id": "11020300", "group": "optReha[]", "value": "RUSSKA Flexibler Drehsitz 11020300", "name": "RUSSKA Flexibler Drehsitz 11020300", "img": "/assets/11020300.jpg", "qtyLabel": "Menge 11020300" },
   { "id": "14661000", "group": "optReha[]", "value": "Greifhilfe Classic 45 cm 14661000", "name": "Greifhilfe Classic 45 cm 14661000", "img": "/assets/14661000.jpg", "qtyLabel": "Menge 14661000" },
   { "id": "14662000", "group": "optReha[]", "value": "Greifhilfe Classic 70 cm 14662000", "name": "Greifhilfe Classic 70 cm 14662000", "img": "/assets/14662000.jpg", "qtyLabel": "Menge 14662000" },
   { "id": "26013000", "group": "optReha[]", "value": "RUSSKA Strumpf-Anziehhilfe aus Frottee 26013000", "name": "RUSSKA Strumpf-Anziehhilfe aus Frottee 26013000", "img": "/assets/26013000.jpg", "qtyLabel": "Menge 26013000" },
   { "id": "26014000", "group": "optReha[]", "value": "Strumpf-Anziehhilfe aus Kunststoff kleine Nuten 26014000", "name": "Strumpf-Anziehhilfe aus Kunststoff kleine Nuten 26014000", "img": "/assets/26014000.jpg", "qtyLabel": "Menge 26014000" },
   { "id": "26014200", "group": "optReha[]", "value": "Strumpf-Anziehhilfe aus Kunststoff große Nuten 26014200", "name": "Strumpf-Anziehhilfe aus Kunststoff große Nuten 26014200", "img": "/assets/26014200.jpg", "qtyLabel": "Menge 26014200" },
   { "id": "091095504", "group": "optReha[]", "value": "homecraft Strumpfhosen-Anziehhilfe Dorking 091095504", "name": "homecraft Strumpfhosen-Anziehhilfe Dorking 091095504", "img": "/assets/091095504.jpg", "qtyLabel": "Menge 091095504" },
   { "id": "10440000", "group": "optReha[]", "value": "RUSSKA Teleskopischer Schuhanzieher 10440000", "name": "RUSSKA Teleskopischer Schuhanzieher 10440000", "img": "/assets/10440000.jpg", "qtyLabel": "Menge 10440000" },
   { "id": "78061000", "group": "optReha[]", "value": "Badebrett Deluxe mit Soft-Drehsitz 78061000", "name": "Badebrett Deluxe mit Soft-Drehsitz 78061000", "img": "/assets/78061000.jpg", "qtyLabel": "Menge 78061000" },
   { "id": "78062300", "group": "optReha[]", "value": "RUSSKA Drehbarer Aluminium-Badewannensitz mit Armlehnen und Rückenlehne 78062300", "name": "RUSSKA Drehbarer Aluminium-Badewannensitz mit Armlehnen und Rückenlehne 78062300", "img": "/assets/78062300.jpg", "qtyLabel": "Menge 78062300" },
   { "id": "78700150", "group": "optReha[]", "value": "Soft-Auflage zu laguna Badewannensitzen hellgrau 78700150", "name": "Soft-Auflage zu laguna Badewannensitzen hellgrau 78700150", "img": "/assets/78700150.jpg", "qtyLabel": "Menge 78700150" },
   { "id": "78058100", "group": "optReha[]", "value": "Badebrett Basic 68 cm 78058100", "name": "Badebrett Basic 68 cm 78058100", "img": "/assets/78058100.jpg", "qtyLabel": "Menge 78058100" },
   { "id": "78059100", "group": "optReha[]", "value": "Badebrett Basic 73 cm 78059100", "name": "Badebrett Basic 73 cm 78059100", "img": "/assets/78059100.jpg", "qtyLabel": "Menge 78059100" },
   { "id": "78700000", "group": "optReha[]", "value": "RUSSKA laguna Badewannensitz ohne Rückenlehne 78700000", "name": "RUSSKA laguna Badewannensitz ohne Rückenlehne 78700000", "img": "/assets/78700000.jpg", "qtyLabel": "Menge 78700000" },
   { "id": "78700100", "group": "optReha[]", "value": "RUSSKA laguna Badewannensitz mit Rückenlehne 78700100", "name": "RUSSKA laguna Badewannensitz mit Rückenlehne 78700100", "img": "/assets/78700100.jpg", "qtyLabel": "Menge 78700100" }
  ] },
 { "id": "RAMPE", "name": "Rampe", "img": "/assets/rampe.jpg",
  "products": [
   { "id": "RAMPE35", "group": "optRampe[]", "value": "Rampe 3.5 cm Hoch", "name": "Rampe 3.5 cm hoch", "img": "/assets/rampe.PNG", "qtyLabel": "Menge Rampe 3.5 cm Hoch" }
  ] },
 { "id": "WANNE", "name": "Wanne", "img": "/assets/wanne.jpg",
  "products": [] },
 { "id": "WC", "name": "WC", "img": "/assets/wc/DERWWCOSVP/DERWWCOSVP-1.jpg",
  "products": [] },
 { "id": "WESGH", "name": "Wandeinbau-Siphon", "img": "/assets/WESGH.jpg",
  "products": [
   { "id": "WESGH", "group": "optWesgh[]", "value": "Wandeinbau-Waschgeraete-Siphon komplett DN 40/50", "name": "Wandeinbau-Waschgeräte-Siphon komplett DN 40/50", "img": "/assets/WESGH.jpg", "qtyLabel": "Menge Wandeinbau-Siphon" },
   { "id": "TRGAVS15", "group": "optWesgh[]", "value": "Geräte-Schrägsitzventil TRINNITY 1/2\" m.Rückflussverh.verchromt TRGAVS15", "name": "Geräte-Schrägsitzventil TRINNITY 1/2\" TRGAVS15", "img": "/assets/TRGAVS15.jpg", "qtyLabel": "Menge TRGAVS15", "block": "wesgh" },
   { "id": "INSTMATROH", "group": "optWesgh[]", "value": "Installations Material Roh INSTMATROH", "name": "Kunstoff Rohr und Kleinmaterial", "img": "", "qtyLabel": "Menge INSTMATROH", "block": "wesgh" }
  ] },
 { "id": "SONDER", "name": "Sonderprodukte", "img": "/assets/sonder.jpg",
  "products": [] },
 { "id": "DUSCHZUB", "name": "Duschzubehör", "img": "/assets/vk-brutto.jpg",
  "products": [
   { "id": "DUSCHKORB01", "group": "optDuschzub[]", "value": "Duschkorb Duschablage ohne Bohren - Shampoohalter zum Kleben aus rostfreiem Edelstahl mit Original 3M-Klebepads, 2 beweglichen Haken, Extra-Rasierhalter (Edelstahl Silber) DUSCHKORB01", "name": "Duschkorb ohne Bohren, Edelstahl Silber DUSCHKORB01", "img": "/assets/vk-brutto.jpg", "qtyLabel": "Menge DUSCHKORB01" }
  ] },
 { "id": "HEBE", "name": "Hebeanlage", "img": "/assets/HEBEFIXMINI.jpg",
  "products": [
   { "id": "HEBEFIXMINI", "group": "optHebe[]", "value": "Schmutzwasserhebeanlage Hebefix Mini Jung Pumpen (TÜV-geprüft nach DIN EN 12050, für Handwaschbecken, Dusche, Bidet, steckerfertig, Q max 4,3 m³/h, H max 5 m) HEBEFIXMINI", "name": "Schmutzwasserhebeanlage Hebefix Mini Jung Pumpen HEBEFIXMINI", "img": "/assets/HEBEFIXMINI.jpg", "qtyLabel": "Menge HEBEFIXMINI" }
  ] }
];
