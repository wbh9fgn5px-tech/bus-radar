import { config } from "./config.ts";

export interface ConditionalState {
  etag?: string;
  lastModified?: string;
}

export type FetchResult =
  | { kind: "ok"; body: Buffer; status: number; etag?: string; lastModified?: string; contentType?: string; finalUrl: string }
  | { kind: "not_modified"; status: 304 }
  | { kind: "error"; status?: number; error: string };

/**
 * GET binaire avec timeout, taille maximale, et requêtes conditionnelles
 * (If-None-Match / If-Modified-Since) pour éviter les transferts inutiles.
 */
export async function fetchBinary(
  url: string,
  opts: { cond?: ConditionalState; timeoutMs?: number; maxBytes?: number; headers?: Record<string, string> } = {},
): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? config.fetchTimeoutMs);
  const headers: Record<string, string> = {
    "User-Agent": config.userAgent,
    Accept: "application/x-protobuf, application/octet-stream, */*",
    ...opts.headers,
  };
  if (opts.cond?.etag) headers["If-None-Match"] = opts.cond.etag;
  if (opts.cond?.lastModified) headers["If-Modified-Since"] = opts.cond.lastModified;
  try {
    const res = await fetch(url, { headers, redirect: "follow", signal: controller.signal });
    if (res.status === 304) return { kind: "not_modified", status: 304 };
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return { kind: "error", status: res.status, error: `HTTP ${res.status}` };
    }
    const maxBytes = opts.maxBytes ?? config.maxFeedBytes;
    const declared = Number(res.headers.get("content-length") || 0);
    if (declared > maxBytes) {
      await res.body?.cancel().catch(() => {});
      return { kind: "error", status: res.status, error: `Réponse trop volumineuse (${declared} o)` };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          return { kind: "error", status: res.status, error: `Réponse trop volumineuse (> ${maxBytes} o)` };
        }
        chunks.push(value);
      }
    }
    return {
      kind: "ok",
      body: Buffer.concat(chunks),
      status: res.status,
      etag: res.headers.get("etag") ?? undefined,
      lastModified: res.headers.get("last-modified") ?? undefined,
      contentType: res.headers.get("content-type") ?? undefined,
      finalUrl: res.url,
    };
  } catch (e) {
    const err = e as Error;
    const msg = err.name === "AbortError" ? "Délai dépassé" : (err.cause as Error)?.message || err.message;
    return { kind: "error", error: msg };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, timeoutMs = 30000, maxBytes = 50 * 1024 * 1024): Promise<T> {
  const r = await fetchBinary(url, { timeoutMs, maxBytes, headers: { Accept: "application/json" } });
  if (r.kind !== "ok") throw new Error(r.kind === "error" ? r.error : "304 inattendu");
  return JSON.parse(r.body.toString("utf8")) as T;
}

/** Limiteur de concurrence minimaliste. */
export function createLimiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= max) return;
    const fn = queue.shift();
    if (fn) {
      active++;
      fn();
    }
  };
  return function limit<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}
