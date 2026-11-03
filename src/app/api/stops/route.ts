import { engine, json, parseBbox } from "@/server/api.ts";

/** ?bbox=minLon,minLat,maxLon,maxLat  ou  ?q=nom */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const e = await engine();
  const q = u.searchParams.get("q");
  if (q) return json({ stops: e.searchStops(q, 30) });
  const bbox = parseBbox(u.searchParams.get("bbox"));
  if (!bbox) return json({ error: "Paramètre bbox invalide ou trop étendu" }, { status: 400 });
  return json({ stops: e.getStopsInBbox(bbox) });
}
