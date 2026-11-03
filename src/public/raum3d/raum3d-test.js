// raum3d-test.js — the stand-alone test page (/raum3d.html?deal=…).
import { createViewer } from "./raum3d.js";

const viewer = createViewer(document.body);
const form = document.getElementById("load");
const open = (deal) => {
  history.replaceState(null, "", `?deal=${encodeURIComponent(deal)}`);
  viewer.load(deal);
};
form.addEventListener("submit", (e) => { e.preventDefault(); open(form.deal.value.trim()); });
const q = new URLSearchParams(location.search).get("deal");
if (q) { form.deal.value = q; open(q); }
