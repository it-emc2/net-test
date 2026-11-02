// routes/room3d.js — the customer's bathroom from magicplan, for the 3D view.
// GET /api/room3d/:dealId → { plan, room, spots }. The plan is found by the deal ID
// (project external_reference_id, or a name starting with "<dealId>-" as the
// Bitrix automation creates it). Read-only; geometry only, no photos, no address.
import { Router } from "express";
import { parsePlan, showerSpots } from "../logic/room-plan.js";

const r = Router();
const BASE = "https://cloud.magicplan.app/api/v2/";

async function mp(path) {
  const res = await fetch(BASE + path, {
    headers: { key: process.env.MAGICPLAN_KEY || "", customer: process.env.MAGICPLAN_CUSTOMER_ID || "", accept: "application/json" },
  });
  if (!res.ok) throw Object.assign(new Error(`magicplan ${res.status}`), { status: res.status });
  return res.json();
}

const cache = new Map(); // dealId → { at, data }
const TTL_MS = 10 * 60 * 1000;

async function loadRoom(dealId) {
  const list = await mp(`projects?name=${encodeURIComponent(dealId)}&page_size=50&sort=Projects.user_modified&direction=desc`);
  const project = (list.data || []).find(
    (p) => !p.archived_at && (String(p.external_reference_id || "") === dealId || String(p.name || "").startsWith(`${dealId}-`)),
  );
  if (!project) return null;
  const plan = (await mp(`projects/${project.id}/plan`)).data;
  const names = {};
  for (const f of plan?.plan_data?.floors || [])
    for (const room of f.rooms || []) {
      names[room.uid] = room.name;
      for (const o of room.objects || []) names[o.uid] = o.name;
    }
  const xml = (await mp(`plans/get/${plan.id}`)).data?.plan_detail?.magicplan_format_xml;
  const room = parsePlan(xml, names);
  const measured = !!room?.rooms?.length;
  return {
    plan: { id: plan.id, name: project.name, modified: plan.user_modified, measured },
    room: measured ? room : null,
    spots: measured ? showerSpots(room).map((s) => ({ kind: s.kind, situation: s.situation, object: s.object, sides: s.sides.map((x) => ({ a: x.a, b: x.b, wall: x.wall })) })) : [],
  };
}

r.get("/:dealId", async (req, res) => {
  const dealId = String(req.params.dealId || "").trim();
  if (!/^\d{3,8}$/.test(dealId)) return res.status(400).json({ error: "Deal-ID ungültig" });
  if (!process.env.MAGICPLAN_KEY) return res.status(503).json({ error: "magicplan nicht konfiguriert" });
  try {
    const hit = cache.get(dealId);
    if (hit && Date.now() - hit.at < TTL_MS && req.query.fresh !== "1") return res.json(hit.data);
    const data = await loadRoom(dealId);
    if (!data) return res.status(404).json({ error: `Kein magicplan-Plan zu Deal ${dealId} gefunden` });
    cache.set(dealId, { at: Date.now(), data });
    res.json(data);
  } catch (e) {
    console.error("[room3d]", dealId, e.message);
    res.status(502).json({ error: "magicplan nicht erreichbar" });
  }
});

export default r;
