import express, { type Application, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import { env } from "./config/env.js";
import authRouter from "./routes/auth.js";
import adminRouter from "./routes/admin.js";

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true, // allow the session cookie across the dev-server origin
    }),
  );
  app.use(compression());
  if (!env.isProduction) app.use(morgan("dev"));
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true, db: env.mongoDb, time: new Date().toISOString() });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);

  // 404 for unknown API routes.
  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}
