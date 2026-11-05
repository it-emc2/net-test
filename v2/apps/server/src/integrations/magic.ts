// Magic API client — port of legacy src/external/magicApi.js. Same requests: login
// POST {base}/api/auth/login {email,password} (10 s), token cached 50 min (refreshed 1 min
// early), then calls with "Authorization: Bearer <token>" (15 s). axios is kept on purpose so
// query strings are serialized exactly like legacy (arrays as a[]=1&a[]=2).
// Difference: the cache lives in the instance, not the module; a missing base URL fails
// with a clear message instead of calling "undefined/api/...".
import axios, { type AxiosInstance } from "axios";

export interface MagicConfig {
  baseUrl?: string | undefined; user?: string | undefined; password?: string | undefined;
  http?: AxiosInstance; now?: () => number;
}

export class MagicApi {
  private token: string | null = null;
  private expiresAt = 0;
  private readonly http: AxiosInstance;
  private readonly now: () => number;
  constructor(private readonly c: MagicConfig) {
    this.http = c.http ?? axios.create();
    this.now = c.now ?? Date.now;
  }

  private base(): string {
    if (!this.c.baseUrl) throw new Error("EXTERNAL_API_BASE not configured");
    return this.c.baseUrl;
  }

  private async login(): Promise<string> {
    const res = await this.http.post(`${this.base()}/api/auth/login`, { email: this.c.user, password: this.c.password }, { timeout: 10_000 });
    this.token = res.data?.token;
    this.expiresAt = this.now() + 50 * 60 * 1000;
    return this.token as string;
  }

  private async getToken(): Promise<string> {
    if (this.token && this.now() < this.expiresAt - 60 * 1000) return this.token;
    return this.login();
  }

  async call(method: "get" | "post", path: string, opts: { params?: unknown; data?: unknown } = {}): Promise<unknown> {
    const token = await this.getToken();
    const res = await this.http.request({
      method, url: `${this.base()}${path}`, params: opts.params, data: opts.data,
      headers: { Authorization: `Bearer ${token}` }, timeout: 15_000,
    });
    return res.data;
  }
}
