// Draft/offer names are stored ASCII-slugified (see slugifyPart in
// DraftsManager.js): "Müller" is saved as "Muller". A raw /Müller/i can
// therefore never match, so fold the query the same way and let each base
// letter match its accented variants too — covers both the slugified names
// and any hand-typed "Save as" name that kept its umlauts.
const VARIANTS = {
  a: "aàáâãäå",
  c: "cç",
  e: "eèéêë",
  i: "iìíîï",
  n: "nñ",
  o: "oòóôõö",
  s: "sš",
  u: "uùúûü",
  y: "yýÿ",
};

export function foldName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss");
}

export function nameSearchRegex(q) {
  const body = foldName(String(q).trim())
    // Escape before expanding, otherwise a typed "(" is a 500.
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/[a-z]/gi, (c) => {
      const set = VARIANTS[c.toLowerCase()];
      return set ? `[${set}]` : c;
    });
  return new RegExp(body, "i");
}
