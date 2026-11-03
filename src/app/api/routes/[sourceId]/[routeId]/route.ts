import { engine, json } from "@/server/api.ts";

export async function GET(_req: Request, ctx: RouteContext<"/api/routes/[sourceId]/[routeId]">) {
  const { sourceId, routeId } = await ctx.params;
  const e = await engine();
  const d = e.getRouteDetail(decodeURIComponent(sourceId), decodeURIComponent(routeId));
  if (!d) return json({ error: "Ligne inconnue (GTFS non chargé ?)" }, { status: 404 });
  return json(d);
}
