import { engine, json, parseBbox } from "@/server/api.ts";

/** Tracés de lignes (shapes.txt) intersectant l'emprise, en GeoJSON. */
export async function GET(req: Request) {
  const bbox = parseBbox(new URL(req.url).searchParams.get("bbox"));
  if (!bbox) return json({ error: "Paramètre bbox invalide ou trop étendu" }, { status: 400 });
  const e = await engine();
  return json({
    type: "FeatureCollection",
    features: e.getShapesInBbox(bbox).map((f) => ({
      type: "Feature",
      properties: { sourceId: f.sourceId, routeId: f.routeId, color: f.color ? `#${f.color}` : null, name: f.name },
      geometry: { type: "LineString", coordinates: f.coords },
    })),
  });
}
