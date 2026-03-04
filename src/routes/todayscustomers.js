import express from "express";
import { getKundendatenForStage } from "../services/todaysCustomersService.js";

const router = express.Router();

router.get("/bitrix/kundendaten", async (req, res) => {
  try {
    const stageId = String(req.query.stageId || "C72:UC_YOESDE");
    const data = await getKundendatenForStage(stageId);

    res.json({
      ok: true,
      count: data.length,
      items: data,
    });
  } catch (err) {
    console.error("GET /bitrix/kundendaten failed:", err);
    res.status(500).json({
      ok: false,
      error: err?.message || String(err),
    });
  }
});

export default router;