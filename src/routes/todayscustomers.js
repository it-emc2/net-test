import express from "express";

const router = express.Router();

const N8N_TODAYS_CUSTOMERS_URL =
  process.env.N8N_TODAYS_CUSTOMERS_URL ||
  "https://fly-n8n-1.fly.dev/webhook/8cfd4000-61f1-4a74-a9d6-f7ec2fddc653";

router.get("/bitrix/kundendaten", async (req, res) => {
  try {
    const stageId = String(req.query.stageId || "C72:UC_YOESDE").trim();

    const upstream = await fetch(N8N_TODAYS_CUSTOMERS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ stageId }),
    });

    const contentType = upstream.headers.get("content-type") || "";
    const text = await upstream.text();

    // Debug log on server
    console.log("N8N status:", upstream.status);
    console.log("N8N content-type:", contentType);
    console.log("N8N raw response:", text.slice(0, 5000));

    // If n8n did not return JSON, return raw text so you can inspect it
    if (!contentType.includes("application/json")) {
      return res.status(upstream.status).json({
        ok: upstream.ok,
        status: upstream.status,
        contentType,
        raw: text,
      });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: "Failed to parse n8n JSON",
        raw: text,
      });
    }

    // IMPORTANT:
    // return EXACTLY what n8n sends, no reshaping
    return res.status(upstream.status).json(data);
  } catch (err) {
    console.error("GET /api/bitrix/kundendaten failed:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || String(err),
    });
  }
});

export default router;