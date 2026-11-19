// The winwall decors offered as tiles, as in today's UI (written from the recording of today's
// page: test/fixtures/wandverkleidung.json → `decors`; the test compares this list with it).
export const WW_DECORS: readonly { value: string; caption: string }[] = [
  { value: "WS000", caption: "weiß" },
  { value: "WS243", caption: "Beton weiß" },
  { value: "WS503", caption: "Beton gespachtelt light" },
  { value: "WS228", caption: "Struktur hellgrau" },
  { value: "WS229", caption: "Struktur steingrau" },
  { value: "WS227", caption: "Struktur anthrazit" },
  { value: "WS203", caption: "Marmor weiß" },
  { value: "WS219", caption: "Sandstein geschliffen" },
  { value: "NW220", caption: "Limestone ivory" },
  { value: "NW222", caption: "Limestone pearl" },
  { value: "WS225", caption: "Kalkstein beige" },
  { value: "NW215", caption: "Marble Pur" },
  { value: "NW216", caption: "Marble Alabaster" },
  { value: "WS210", caption: "Feinsteinzeug" },
  { value: "WS290", caption: "Eiche hell" },
];

// winwall decors we have a swatch picture for (assets/winwall/<code>.jpg) — today's list of the
// Wandverkleidung simple view (script.js initWvSimple `IMGS`); other decors show their number on a plain tile.
export const WW_SWATCHES: ReadonlySet<string> = new Set(["NW215", "NW216", "NW218", "NW220", "NW221", "NW222", "NW230", "WS000", "WS002", "WS004", "WS005", "WS023", "WS046", "WS047", "WS081", "WS101", "WS110", "WS120", "WS121", "WS130", "WS132", "WS140", "WS151", "WS160", "WS170", "WS202", "WS203", "WS204", "WS210", "WS212", "WS213", "WS214", "WS219", "WS225", "WS226", "WS227", "WS228", "WS229", "WS232", "WS233", "WS234", "WS240", "WS241", "WS242", "WS243", "WS247", "WS248", "WS251", "WS254", "WS257", "WS258", "WS260", "WS261", "WS270", "WS271", "WS280", "WS281", "WS282", "WS289", "WS290", "WS291", "WS292", "WS293", "WS294", "WS296", "WS297", "WS298", "WS299", "WS301", "WS302", "WS309", "WS330", "WS332", "WS350", "WS351", "WS401", "WS402", "WS403", "WS405", "WS406", "WS407", "WS408", "WS409", "WS410", "WS411", "WS501", "WS502", "WS503", "WS504"]);
