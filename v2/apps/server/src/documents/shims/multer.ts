// legacy multer({ dest, limits }).single(field) → Fastify multipart: the uploaded file is
// written to `dest` and exposed as req.file { path, originalname, mimetype, size, fieldname }
// (same shape the legacy handler reads). Other fields land in req.body.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

export default function multer(opts: { dest?: string; limits?: { fileSize?: number } } = {}) {
  return {
    single: (field: string) => async (req: any, _res: any, next: (err?: unknown) => void) => {
      try {
        const fr = req._fastify;
        if (!fr?.isMultipart?.()) return next();
        const body: Record<string, unknown> = {};
        for await (const part of fr.parts({ limits: { fileSize: opts.limits?.fileSize } })) {
          if (part.type === "file") {
            const buf: Buffer = await part.toBuffer();
            if (part.fieldname !== field) continue;
            const p = path.join(opts.dest || os.tmpdir(), randomBytes(16).toString("hex"));
            await fs.writeFile(p, buf);
            req.file = { fieldname: part.fieldname, originalname: part.filename, mimetype: part.mimetype, path: p, size: buf.length };
          } else body[part.fieldname] = part.value;
        }
        req.body = { ...(req.body || {}), ...body };
        next();
      } catch (err) { next(err); }
    },
  };
}
