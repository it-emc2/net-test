// Centralised, validated environment access.
import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export const env = {
  mongoUri: required("MONGODB_URI"),
  mongoDb: process.env.MONGODB_DB || "KonfiguratorDB",
  authSecret:
    process.env.AUTH_SECRET ||
    process.env.ADMIN_SECRET ||
    process.env.ADMIN_PASSWORD ||
    "insecure-fallback",
  port: Number(process.env.PORT || 4000),
  corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  isProduction: process.env.NODE_ENV === "production",
} as const;
