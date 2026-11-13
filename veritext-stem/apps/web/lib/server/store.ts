// Small key-value store for word usage, license cache and cost stats.
// Production: Upstash Redis over REST (works on serverless, free tier is enough to start).
// Without Upstash configured: an in-memory map, good for local development and tests only.
import { config } from "./config";

export interface Store {
  kind: "upstash" | "memory";
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  /** Atomic add (may be negative). Returns the new value. */
  incrBy(key: string, by: number, ttlSeconds?: number): Promise<number>;
  mget(keys: string[]): Promise<(string | null)[]>;
}

export class MemoryStore implements Store {
  kind = "memory" as const;
  private data = new Map<string, { v: string; exp: number }>();
  constructor(private now: () => number = Date.now) {}
  private live(key: string) {
    const e = this.data.get(key);
    if (e && e.exp && e.exp <= this.now()) {
      this.data.delete(key);
      return undefined;
    }
    return e;
  }
  async get(key: string) {
    return this.live(key)?.v ?? null;
  }
  async set(key: string, value: string, ttlSeconds?: number) {
    this.data.set(key, { v: value, exp: ttlSeconds ? this.now() + ttlSeconds * 1000 : 0 });
  }
  async incrBy(key: string, by: number, ttlSeconds?: number) {
    const e = this.live(key);
    const next = Number(e?.v ?? 0) + by;
    this.data.set(key, { v: String(next), exp: e?.exp || (ttlSeconds ? this.now() + ttlSeconds * 1000 : 0) });
    return next;
  }
  async mget(keys: string[]) {
    return keys.map((k) => this.live(k)?.v ?? null);
  }
}

export class UpstashStore implements Store {
  kind = "upstash" as const;
  constructor(
    private url: string,
    private token: string,
    private fetcher: typeof fetch = fetch,
  ) {}
  private async pipeline(commands: (string | number)[][]): Promise<unknown[]> {
    const res = await this.fetcher(`${this.url}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify(commands),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Usage store error (HTTP ${res.status})`);
    const body = (await res.json()) as { result?: unknown; error?: string }[];
    return body.map((r) => {
      if (r.error) throw new Error(`Usage store error: ${r.error}`);
      return r.result;
    });
  }
  async get(key: string) {
    const [v] = await this.pipeline([["GET", key]]);
    return v == null ? null : String(v);
  }
  async set(key: string, value: string, ttlSeconds?: number) {
    await this.pipeline([ttlSeconds ? ["SET", key, value, "EX", ttlSeconds] : ["SET", key, value]]);
  }
  async incrBy(key: string, by: number, ttlSeconds?: number) {
    const cmds: (string | number)[][] = [["INCRBY", key, Math.trunc(by)]];
    // NX: only set the expiry the first time, so a counter keeps its original window.
    if (ttlSeconds) cmds.push(["EXPIRE", key, ttlSeconds, "NX"]);
    const [v] = await this.pipeline(cmds);
    return Number(v);
  }
  async mget(keys: string[]) {
    if (!keys.length) return [];
    const [v] = await this.pipeline([["MGET", ...keys]]);
    return (v as (string | number | null)[]).map((x) => (x == null ? null : String(x)));
  }
}

let singleton: Store | null = null;

export function getStore(): Store {
  if (!singleton) {
    const c = config();
    singleton = c.upstashUrl && c.upstashToken ? new UpstashStore(c.upstashUrl, c.upstashToken) : new MemoryStore();
  }
  return singleton;
}

/** Tests only. */
export function setStore(store: Store | null) {
  singleton = store;
}
