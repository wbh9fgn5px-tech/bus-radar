import { engine, json } from "@/server/api.ts";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const e = await engine();
  return json({
    routes: e.getRoutes({
      q: u.searchParams.get("q") ?? undefined,
      sourceId: u.searchParams.get("sourceId") ?? undefined,
      limit: Math.min(Number(u.searchParams.get("limit") || 100), 500),
    }),
  });
}
