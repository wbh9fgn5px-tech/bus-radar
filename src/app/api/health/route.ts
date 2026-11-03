import { engine, json } from "@/server/api.ts";

export async function GET() {
  const e = await engine();
  const s = e.getStats();
  return json({
    ok: !e.catalogError,
    uptimeSec: Math.round((Date.now() - e.startedAt) / 1000),
    catalog: { fetchedAt: e.catalogFetchedAt, fromCache: e.catalogFromCache, error: e.catalogError },
    heapMb: Math.round(process.memoryUsage().heapUsed / 1e6),
    stats: s,
  });
}
