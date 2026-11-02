# 3D bathroom visualisation in the offer — research report

Status 2026-11-02 · Basis: our magicplan API (tested live), the mock-up PDF (ANG2026-1001-101833), a Haßmann EPS, and web research across about 100 sources. [V] = verified (own test or source), [A] = assumption/estimate.

## 1. Result in one paragraph

**Doable, reliable and without AI artefacts, if the scene is built deterministically from data.** The magicplan plans already contain everything for a true-to-scale room: walls in metres, room height, doors, windows with sill height, and the existing objects. Our offer contains the products with their dimensions. A small program builds the 3D scene from both. It runs as an interactive view on the iPad (three.js) and produces the still images for the PDF (Blender on the office iMac, optionally). **Generative AI (image editing, "AI remodel") is not suitable** for offer images: it doesn't keep dimensions or product shapes, and that is a sales and legal risk. The bottleneck is not rendering but **the product models**: there are no usable 3D files from VIGOUR or winwall, so we build simple parametric models from our catalogue dimensions ourselves.

## 2. What our magicplan data delivers (tested with the API)

| Check | Result |
|---|---|
| API access with our keys | [V] works (`cloud.magicplan.app/api/v2`, headers `key` + `customer`); 855 plans in the account |
| Plan for deal 66270 ("66270-Paris") | [V] found by name `DealId-Name`; `external_reference_id` = deal ID on the project |
| Geometry | [V] Plan XML (`GET /plans/get/{id}`): wall points (m), room height 2.49 m, wall thickness; doors with width/height/position; **windows incl. sill height** (`wallItemDistanceToFloor` 0.92 m) |
| Existing objects | [V] with names and dimensions: Badewanne 1.62 × 0.65 × 0.60 m, Toilette, Waschbecken (wall-mounted), Schränke, and in the after-room "Rechteckige Dusche" 1.006 × 0.70 × 2.30 m |
| Before/after | [V] **magicplan contains only the current bathroom** (corrected 2026-11-02; there's no time on site to plan the after-state in magicplan, and magicplan has no Nische/Ecke or door-type options). Sample of the 60 newest plans: 43 measured (17 empty, created automatically but not yet measured); **41 of 43 with exactly one room**; existing objects: Badewanne in 32, Rechteckige Dusche in 24, both in 14, **neither in only 1**. 66270-Paris was an exception with a hand-drawn second room. |
| Photos/video | [V] project files (`GET /projects/{id}/files`): 2 JPG + 1 MP4 + thumbnail; URLs are temporary (download straight away) |
| 3D export via API | [V] no direct OBJ/USDZ endpoint in the REST API; OBJ/USDZ/IFC only via the "Custom Export" webhook (file URLs valid for 60 min) |
| magicplan's own 3D view | [V] the public link has a 2D/3D/360° tab; generic objects, not our products |
| Tier | [V] API works with our account; magicplan's pricing pages are contradictory (PRO vs. Enterprise), so ask about rate limits if needed |

### 2a. How the after-state is created (without extra work on site)

magicplan supplies the room **as it is**; **our offer supplies the after-state** — it already knows everything magicplan lacks:

| Information | Source |
|---|---|
| Where the shower goes | the existing **Badewanne** / **Rechteckige Dusche** from magicplan (exact position + size); with both (14 of 43) the "Umbauart" from the offer decides, otherwise one tap |
| Nische / Ecke / Walk-In | **computed from the geometry**: which sides of the bathtub/shower touch a wall (≤ 3 cm) → 3 walls = Nische, 2 = Ecke, 1 = Walk-In; compared with the Einbausituation picked in Duschabtrennung (neu) — mismatch → notice, no guessing |
| Shower tray size, colour | Duschwanne page of the offer |
| Door type (Gleit-, Pendel-, Falttür …), side, widths | Duschabtrennung (neu) configurator |
| Wall cladding (decor, which walls, height) | Wandverkleidung page + calculator (Wand/Ecke/U-Form, widths) |
| Remaining bathtub area | is closed as floor ("Fehlstellen schließen") |
| Grab bars, curtain, WC, washbasin | offer / existing objects stay in place |

**Placement rule:** the shower tray sits in the wall corner of the old bathtub/shower (corner = the walls it touches); a tray smaller than the old bathtub leaves floor area. If no bathtub/shower is in the plan (1 of 43) or the geometry is ambiguous: one tap in a small top view ("Dusche hier").

**Conclusion:** we don't need USDZ meshes. The parametric XML data is better (clean, true to dimensions, walls known as walls, so products can be placed exactly on them).

## 3. Product models — what to show and what not

There are no free or licensed 3D files for VIGOUR or winwall [V]. VIGOUR data exists only inside Palette CAD (the VIGOUR Badplaner is made by Palette CAD) [V]. BIMobject and similar libraries forbid use in a customer-facing service [V]. **So we build simple parametric models from our own catalogue dimensions** (Vigor DB, offer data):

| Product | Model | True to dimensions | Look | Recommendation |
|---|---|---|---|---|
| Shower tray (all lines) | box with rounded corners, drain, CC0 stone/slate texture | high | high | **show** |
| Wall cladding VIGOUR / winwall | wall surface in the exact panel format, decor image as texture, joints/profiles | high | medium (colour on screen) | **show**, with note "colour may vary" |
| Glass enclosure (sliding, pivot, corner, Walk-In) | glass panes + profiles + generic handle from width/height/door type | high | medium (hardware simplified) | **show** |
| Viertelkreis | curved pane | medium–high | medium | show |
| Grab bars, support rails | tubes + rosettes | high | high | **show** |
| Shower curtain + rods | rod path from the configurator, curtain as fabric surface | high | medium | show |
| Thermostat/shower system | simplified (rail, head shower, body) | medium | low | as "symbol image" only |
| WC, washbasin, cabinets (existing) | simple shapes in measured size from magicplan | high | simple | show neutral/grey |
| Taps, glass hardware details, decor colour fidelity | — | — | risky | **don't show in detail** |
| EPS files (Haßmann) | [V] 2D technical drawings (front/side view with dimension lines), **not 3D** | — | — | only internally for dimension checks |

Optional later: ask VIGOUR/GC and winwall in writing for decor scans and, if possible, licensed 3D data.

### 3a. GC Online Plus (Haßmann/VIGOUR wholesale portal) — checked logged in, 2026-11-02

| Place | Content | Usable for 3D? |
|---|---|---|
| Product detail → "Dokumente" (e.g. V2PT90L) | Picture price lists, PDF Montageanleitung, **PDF Explosionszeichnung**, Leistungserklärung, EPS "Unvermaßtes Bild (Strichzeichnung)" | **no 3D/CAD/BIM.** The Explosionszeichnung + Montageanleitung give exact part/profile dimensions → template for our parametric enclosure model |
| "BIBliothek" | catalogue pages (VIGOUR 2025 p. 300, Sanitär 2026) with dimension tables | dimensions/Einbaumaß only |
| Download centre | only your own exports (empty) | no |
| Menu "Mehr …" | Kalkulator, Videos, Finanzbuchhaltung | no |
| Product photos (Vigor DB, e.g. V3WV04 decor) | [V] **284 × 400 px** | too small as a wall texture (blurry at 2.5 m) → for VIGOUR decors ask VIGOUR for scans; winwall shop photos are 2800–5900 px [V] and suitable |

→ Confirms: no 3D data from the wholesaler; parametric models from catalogue dimensions remain the way.

## 4. Rendering — options compared

| Option | Quality | Reliability | Runs where | Verdict |
|---|---|---|---|---|
| **three.js in the browser** | good (glass, chrome, HDRI light) | deterministic | iPad (WebGL2) | **interactive view + MVP images** (screenshot from the iPad, uploaded with the offer) |
| **Blender Cycles (headless)** | photorealistic | deterministic (fixed camera, seed) | office iMac (Metal) | **v2 for PDF images**, est. 0.5–3 min/image [A] |
| three.js headless on fly.io | realtime look | ok | 2 CPU / 2 GB without GPU: slow, tight | fallback only |
| AI image editing (Gemini, OpenAI, RoomGPT …) | looks good | **not true to dimensions, invents details** | cloud | **no** for offers (at most a labelled "mood image") |
| Buy (Palette CAD, ViSoft) | photorealistic | good | desktop, manual | no automation, 30–90 min manual work per bathroom [A] |

**iMac idea:** works, without opening ports. The iMac regularly asks the app "is there a render job?", renders, and uploads the images (pull queue over our existing MongoDB, launchd service, sleep disabled). If the iMac is off, the app falls back to the iPad screenshot. **Claude is not needed in the render loop** (deterministic code is more reliable and costs nothing per image). Claude is useful when building the scripts.

## 5. Easy / hard / error-prone

| Topic | Rating | Why |
|---|---|---|
| Read plan from magicplan (API + XML) | easy | tested, data complete |
| Walls, doors, windows as 3D | easy–medium | walls as extruded shapes with openings, no extra library |
| Place products (tray in the shower area, cladding on the shower walls) | **medium** | needs rules: which wall, which corner; the "Rechteckige Dusche" object from the after-plan gives the position |
| Glass enclosure true to the type | medium | many variants (door type, side, Ecke/Nische/Viertelkreis); we have the data from the configurator |
| Decor colours true to the original | medium–hard | depends on photo quality/screen; a note is needed |
| Photorealism like a catalogue | hard | Blender + materials + light = effort; v2 |
| Plans incomplete or drawn wrongly | **error-prone** | empty plans, wrong room height, missing after-room → show a clear notice instead of guessing |
| Sloped ceilings, shafts, pipe casings | error-prone | not reliably in the plan → shown simplified, note |
| AI-generated images | error-prone | invents dimensions and products → not used |

## 6. Recommended staged plan

| Stage | Content | Effort [A] |
|---|---|---|
| **0 — Proof (2–3 days)** | plan from the API → 3D scene in the browser (walls, door, window, existing objects); auto-detect bathtub/shower + Nische/Ecke; place the offer's shower tray and enclosure there; check with 5–10 real plans | 2–3 days |
| **1 — MVP (≈3–4 weeks)** | new step "3D-Ansicht" after Optionale Produkte: load plan by deal ID; parametric models for tray, cladding, enclosure, grab bars, curtain; before/after toggle; 3 fixed views (front, from the door, top); images are captured on the iPad and go into the PDF | 3–4 weeks |
| **2 — Photo quality (≈3–4 weeks)** | Blender worker on the iMac (pull queue), materials/HDRI, nicer PDF images; fallback stays | 3–4 weeks |
| **3 — Extras** | AR Quick Look on the iPad (product in the real room), decor scans from the manufacturers, optional "mood image" clearly labelled | as needed |

**Rules for reliability:** dimensions only from plan and catalogue data, never adjusted by hand · no plan / incomplete plan → no image, clear notice · fixed note in the PDF: "Visualisierung auf Basis des Aufmaßes; Farben/Oberflächen können abweichen; verbindlich ist das Angebot" (as in the mock-up).

## 7. Open questions

1. ~~After-room in magicplan?~~ → answered: no, only the current state; the after-state comes from the offer (section 2a).
2. ~~3D without a plan?~~ → yes, if possible: simple room from width × depth × height + position of the shower.
3. ~~PDF images?~~ → start with iPad screenshots; iMac (Blender) later, needs a one-off setup (Blender, worker service, power settings, access token).
4. Ask magicplan about API rate limits and the long-term tier (PRO vs. Enterprise)?
5. Ask VIGOUR/GC and winwall in writing for decor scans and 3D data?

## Sources (selection)

magicplan API reference & XML format: apidocs.magicplan.app/reference, …/plan-exchange-xml-format · magicplan export formats: help.magicplan.app/export-formats · Webhook: …/webhook-documentation-project-updated · Apple RoomPlan: developer.apple.com/documentation/roomplan · openPlan3D (RoomPlan → three.js, MIT): github.com/laanlabs/openPlan3D · three.js MeshPhysicalMaterial / USDZExporter / USDLoader: threejs.org/docs · three-gpu-pathtracer: github.com/gkjohnson/three-gpu-pathtracer · Blender headless Metal: projects.blender.org/blender/blender/issues/114326 · BIMobject EULA: business.bimobject.com/terms-of-service-eula · Sketchfab licences: sketchfab.com/licenses · Poly Haven CC0: polyhaven.com/license · VIGOUR Badplaner (Palette CAD): apps.apple.com/de/app/vigour-badplaner/id1518179947 · Palette CAD manufacturer data: palettecad.com/en/manufacturers-distributors · Safari WebGPU: github.com/gpuweb/gpuweb/wiki/Implementation-Status · iOS WebGL memory: bugs.webkit.org/show_bug.cgi?id=232357 · AI interior limits: coohom.com/article/common-problems-with-ai-bathroom-layouts-and-how-to-fix-them
