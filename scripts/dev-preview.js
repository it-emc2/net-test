// scripts/dev-preview.js — UI-only preview without DB/login.
// Serves src/public statically and stubs /api/auth/me so header-auth.js
// doesn't redirect to /login. All other /api calls fail harmlessly, so
// anything data-driven (drafts, products, CRM) stays non-functional.
// Usage: node scripts/dev-preview.js   ->  http://localhost:5050
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "public");
const app = express();

app.get("/api/auth/me", (req, res) => res.json({ user: { name: "UI Preview", email: "preview@local" } }));
app.post("/api/auth/logout", (req, res) => res.json({ ok: true }));
app.use(express.static(pub));
app.get("/", (req, res) => res.sendFile(path.join(pub, "index.html")));

const port = process.env.PORT || 5050;
app.listen(port, () => console.log(`UI preview (no DB, no login): http://localhost:${port}`));
