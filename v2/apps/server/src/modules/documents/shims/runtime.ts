// process.cwd() / console / LibreOffice in the ported code → v2 context
import { documentsContext } from "../context.js";
export const docsRoot = () => documentsContext().root;
const fmt = (a: unknown[]) => a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ").slice(0, 2000);
export const docsLog = {
  log: (...a: unknown[]) => documentsContext().log.debug({}, fmt(a)),
  info: (...a: unknown[]) => documentsContext().log.debug({}, fmt(a)),
  debug: (...a: unknown[]) => documentsContext().log.debug({}, fmt(a)),
  warn: (...a: unknown[]) => documentsContext().log.warn({}, fmt(a)),
  error: (...a: unknown[]) => documentsContext().log.error({}, fmt(a)),
};
export const pdfEngine = () => documentsContext().pdf;
