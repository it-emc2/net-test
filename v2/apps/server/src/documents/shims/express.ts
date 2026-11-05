// The ported legacy router defines Express handlers; this stand-in only records them so v2
// can run the very same handler under Fastify (documents/express-adapter.ts).
export type LegacyHandler = (req: any, res: any) => unknown;
export class CapturingRouter {
  readonly routes = new Map<string, LegacyHandler>();
  get(path: string, h: LegacyHandler) { this.routes.set(`GET ${path}`, h); }
  post(path: string, h: LegacyHandler) { this.routes.set(`POST ${path}`, h); }
  use() { /* legacy middleware is not ported */ }
}
export default { Router: () => new CapturingRouter() };
