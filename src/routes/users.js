// src/routes/users.js — selectable user list for the Ansprechpartner dropdown.
// Gated by authGate (requires a logged-in user); no signature data exposed here.
import express from "express";
import User from "../models/User.js";

const router = express.Router();

function displayName(u) {
  const full = `${u.firstName || ""} ${u.lastName || ""}`.trim();
  return full || u.name || u.email;
}

// GET /api/users — active users, for choosing an Ansprechpartner.
router.get("/", async (req, res) => {
  try {
    const users = await User.find({ active: true })
      .sort({ firstName: 1, lastName: 1, email: 1 })
      .lean();
    res.json(
      users.map((u) => ({
        email: u.email,
        firstName: u.firstName || "",
        lastName: u.lastName || "",
        name: displayName(u),
        hasSignature: !!u.signatureDataUrl,
      })),
    );
  } catch (err) {
    console.error("GET /api/users failed:", err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
