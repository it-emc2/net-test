// Endpoints retired in v2 (ADR 020, owner decision 2026-11-06): Adobe PDF Services export,
// LaTeX PDF export, and /pdf-template (always failed in legacy). Gotenberg (ADR 008) makes the
// offer DOCX/PDF. They answer 410 Gone with a plain German hint, so an old client gets a clear
// message instead of a bare 404; every call is logged to see whether anyone still uses them.
import type { FastifyInstance } from "fastify";

export const RETIRED_ROUTES: Array<[method: "GET" | "POST", url: string]> = [
  ["GET", "/api/adobe-pdf/status"], ["POST", "/api/adobe-pdf/docx"], ["POST", "/api/adobe-pdf/pdf"],
  ["POST", "/api/adobe-pdf/batch"], ["POST", "/api/adobe-pdf/document-merge"],
  ["POST", "/latex-template/pdf"], ["POST", "/pdf-template"],
];
export const RETIRED_MESSAGE = "Diese Exportfunktion gibt es nicht mehr. Bitte nutzen Sie „PDF herunterladen“ oder „Word herunterladen“.";

export async function registerRetired(app: FastifyInstance) {
  for (const [method, url] of RETIRED_ROUTES) {
    app.route({
      method, url,
      handler: async (req, reply) => {
        req.log.warn({ retired: url, user: req.user?.email }, "retired endpoint called (ADR 020)");
        return reply.status(410).send({ error: { code: "RETIRED", message: RETIRED_MESSAGE, requestId: req.id } });
      },
    });
  }
}
