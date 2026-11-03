import { engine, json } from "@/server/api.ts";

export async function GET() {
  const e = await engine();
  return json({
    catalog: { fetchedAt: e.catalogFetchedAt, fromCache: e.catalogFromCache, error: e.catalogError },
    sources: e.getSources(),
  });
}
