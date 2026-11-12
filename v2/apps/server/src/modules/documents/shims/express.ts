// The ported legacy routers define Express handlers (optionally with middleware such as an
// upload parser); this stand-in only records them so v2 can run the very same chain under
// Fastify (documents/express-adapter.ts).
export type LegacyHandler = (req: any, res: any, next?: (err?: unknown) => void) => unknown;
export class CapturingRouter {
  readonly routes = new Map<string, LegacyHandler[]>();
  get(path: string, ...h: LegacyHandler[]) { this.routes.set(`GET ${path}`, h); }
  post(path: string, ...h: LegacyHandler[]) { this.routes.set(`POST ${path}`, h); }
  use() { /* legacy router-level middleware is not ported */ }
}
export default { Router: () => new CapturingRouter() };
