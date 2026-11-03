import { engine, json } from "@/server/api.ts";

/** Prochains passages. `basis` distingue temps réel (TripUpdates) et théorique. */
export async function GET(_req: Request, ctx: RouteContext<"/api/stops/[sourceId]/[stopId]">) {
  const { sourceId, stopId } = await ctx.params;
  const e = await engine();
  const source = e.getSource(decodeURIComponent(sourceId));
  if (!source) return json({ error: "Source inconnue" }, { status: 404 });
  return json({
    generatedAt: Date.now(),
    source: { id: source.id, title: source.title, status: source.status },
    departures: e.getDepartures(source.id, decodeURIComponent(stopId)),
  });
}
