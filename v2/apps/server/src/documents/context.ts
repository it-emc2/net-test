// Runtime context for the ported legacy document modules (documents/ported/*). The ported
// code imports small shims instead of legacy modules; the shims read this context, which
// registerDocuments() sets once at startup. Lazy on purpose: the ported module creates its
// pricing engine at import time, before the app is configured.
export interface DocumentsContext {
  businessConfig: { get(key: string, fallback?: unknown): any };
  fetchVigourNetPrices: (ids: string[]) => Promise<Map<string, number>>;
  /** vigor DB (read-only supplier data) */
  vigorUri: string;
  /** directory that holds src/templates (legacy layout) */
  root: string;
  log: { debug(o: object, m: string): void; warn(o: object, m: string): void; error(o: object, m: string): void };
  pdf: { docxToPdf(docx: Buffer): Promise<Buffer>; htmlToPdf(html: string, opts?: Record<string, unknown>): Promise<Buffer> };
}

let ctx: DocumentsContext | null = null;
export function configureDocuments(c: DocumentsContext) { ctx = c; }
export function documentsContext(): DocumentsContext {
  if (!ctx) throw new Error("documents not configured (registerDocuments not called)");
  return ctx;
}
