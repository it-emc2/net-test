# Adding products to the WC section (BU Konfigurator → Optional → WC)

The WC panel (`menu_WC`) has **no HTML tiles**. Every product is one entry in the
`WC_WALL_PRODUCTS` array inside `wireWcMenu()` in `src/public/script.js`
(`grep -n "const WC_WALL_PRODUCTS" src/public/script.js`). The tiles, groups,
auto-selection, the cat_WC badge/chip lists and the saved-offer restore are all
derived from that array.

**Adding a product = 3 steps:**

1. Get it into the `Products` collection (price) + an image into `src/public/assets/`.
2. Add one array entry.
3. Check it in the browser.

No HTML, no kid lists, no restore list, no PDF/DOCX changes.

---

## 1. Price + image

```bash
node scripts/add-product.mjs WWCAG90          # Vigor article number
node scripts/add-product.mjs WWCAG90 --dry    # look only, no writes
```

- Upserts `{ productId, name, price: <Vigor netPrice> }` into `Products`
  (the app prices from there, never live from Vigor).
- Downloads `images[0]` to `src/public/assets/<ID>.jpg`.
- **Many Vigor items have no image** (the script then says
  "falls back to vk-brutto.jpg" — ignore that, it is an unrelated product photo).
  Get a product photo elsewhere and save it as `src/public/assets/<ID>.jpg`
  (convert PNG: `sips -s format jpeg in.png --out src/public/assets/<ID>.jpg`).
  The same file is used by the tile and by the "Produktbilder-PDF" email attachment.
- Not in Vigor at all: `node scripts/add-product.mjs --id=XY01 --name="…" --price=12.34 --image=<url|file>`.

Without step 1 the tile shows `fallbackName` and **prices at 0 €**.

---

## 2. The array entry

```js
{
  productId: "WWCAG90",                 // = Products.productId, becomes opt_/qty_WWCAG90
  image: "./assets/WWCAG90.jpg",        // or images: [a, b, c] → carousel
  fallbackName: "Wand-WC-Anschlussgarnitur PE d:90mm", // shown until the DB name loads
  category: "accessory",                // see table below
  montage: "both",                      // "Wandmontage" (default) | "Bodenmontage" | "both"
  // category "wc" only:
  // seatId: "CLSIAS",                  // seat tile paired with this WC
  // requiredSeatHeight: "erhoeht",     // Wand only: tile visible for that Sitzhöhe only
}
```

### `category` — what kind of product

| `category` | Group title | Behaviour |
|---|---|---|
| `accessory` | *Produkte für {montage}* | **Required.** Pre-checked (qty 1); re-checked every time Montageart switches to its montage. User can still uncheck. |
| `wc` | *WCs für {montage}* | Toilet. Only one WC selectable (others greyed out, across both montages). Checking it auto-selects its `seatId`. |
| `seat` | (inside its WC's pair) | Never shown alone — only next to every WC whose `seatId` points to it. Driven by the WC. |
| `floor` | *Produkte für {montage}*, or *Weitere Produkte für {montage}* if that montage also has required products | **Optional.** Unchecked, user picks. (The name is historical — it works for Wand too.) |

### `montage` — where it shows

| `montage` | Shows when Montageart = |
|---|---|
| omitted / `"Wandmontage"` | Wandmontage |
| `"Bodenmontage"` | Bodenmontage |
| `"both"` | both. Use for `accessory`/`floor` only. It is **one** tile that moves into the visible group — so one `qty_<ID>`, no double pricing. |

**Old offers/drafts are safe:** when a saved WC selection is reopened, any product
missing from it (e.g. added to the array later) restores as unselected. New required
products are only pre-checked for new WC selections.

Groups per montage are rendered in the order *required → WCs → optional*; array
order decides the order inside a group. Switching Montageart unchecks everything
on the hidden side, so nothing invisible is priced.

---

## Recipes

| I want to add… | Entry |
|---|---|
| A required part for Wand (e.g. Spülkasten, Montageelement) | `category: "accessory"` |
| A required part for Boden | `category: "accessory", montage: "Bodenmontage"` |
| A required part for both (like WWCAG90) | `category: "accessory", montage: "both"` |
| An optional extra | `category: "floor"` (+ `montage` as needed) |
| A new wall WC with its own seat | two entries: the seat `{ productId: "SEAT1", category: "seat", … }` and the WC `{ productId: "WC1", category: "wc", seatId: "SEAT1", … }` |
| A new wall WC that reuses an existing seat | only the WC entry, `seatId: "DERSIAS"` (the seat tile is duplicated into its pair automatically) |
| A WC only for erhöhte / normale Sitzhöhe | add `requiredSeatHeight: "erhoeht"` or `"normal"` (Wand only — the Sitzhöhe choice is not shown for Boden) |
| A floor-standing WC with its seat (Stand-WC) | as the wall WC, plus `montage: "Bodenmontage"` on **both** the WC and the seat entry |

Example — a new required Spülkasten for Wand plus a Boden WC with seat:

```js
{ productId: "SPK123", image: "./assets/SPK123.jpg", fallbackName: "Spülkasten …", category: "accessory" },

{ productId: "STSEAT1", image: "./assets/STSEAT1.jpg", fallbackName: "WC-Sitz …",
  category: "seat", montage: "Bodenmontage" },
{ productId: "STWC1", image: "./assets/STWC1.jpg", fallbackName: "Stand-WC …",
  category: "wc", seatId: "STSEAT1", montage: "Bodenmontage" },
```

Note: today's Boden items (`CLPWCF10` Stand-WC, `CLPSSI` seat, `WCBF` Befestigungssatz)
are all `floor` = optional. To make them behave like Wand (WC picks its seat,
Befestigungssatz required), change them to `wc` + `seatId: "CLPSSI"`, `seat`, and
`accessory` respectively. This was tested and works; not switched yet because it changes
what salespeople see.

---

## 3. Check it (browser console, Optional tab open)

```js
// open the WC modal and pick a Montageart
document.getElementById('cat_WC').closest('label.image-check').click();
const m = document.querySelector('#form-optional input[name="wcMontage"][value="Bodenmontage"]');
m.checked = true; m.dispatchEvent(new Event('change', { bubbles: true }));

// the product: checked? qty? in the payload?
document.getElementById('opt_WWCAG90').checked;
formToObject(document.getElementById('form-optional')).qty_WWCAG90;   // "1"
```

- Tile shows the DB name + price → step 1 worked (a tile with only the `fallbackName`
  and no price = missing `Products` row).
- After editing `script.js`, the service worker may keep serving the old file:
  `for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k);` then reload.
- Price check without the UI: `POST /api/price` with
  `{"optional":{"cat_WC":"on","optWcWall[]":["x"],"opt_<ID>":"on","qty_<ID>":"2"}}` —
  the response must contain a line `{ productId: "<ID>", qty: 2, unitPrice: … }`.
  Offer table, PDF and DOCX all use that same output.

---

## Where things live (search by name, line numbers drift)

| Symbol | Purpose |
|---|---|
| `WC_WALL_PRODUCTS` | the product list — the only thing you normally edit |
| `ensureWallProductsRendered()` / `addGroup` | builds the groups and tiles |
| `applySeatVisibility()` | Montageart switch: group visibility, "both" tile move, required re-check |
| `syncSeatSelectionForWc()` / `syncExclusiveWcSelection()` | WC → seat, one-WC-only |
| `syncSeatHeightDependentProducts()` | `requiredSeatHeight` filtering |
| `window.WC_PRODUCT_IDS` | derived id list used by the cat_WC kid lists and `restoreOptionalPage()` |
| `name="wcMontage"` / `name="wcSeatHeight"` radios | in `menu_WC` in `src/public/index.html` |
