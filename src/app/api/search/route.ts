/**
 * Recherche globale : villes (géocodage IGN Géoplateforme, mis en cache),
 * réseaux, lignes, arrêts, véhicules et destinations.
 */
import { engine, json } from "@/server/api.ts";
import { normalize } from "@/server/engine/engine.ts";
import { config } from "@/server/config.ts";
import { fetchJson } from "@/server/http.ts";
import type { SearchResult } from "@/lib/types.ts";

const geoCache = new Map<string, { at: number; results: SearchResult[] }>();

async function searchCities(q: string): Promise<SearchResult[]> {
  const key = normalize(q);
  const hit = geoCache.get(key);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.results;
  try {
    const res = await fetchJson<{
      features: { geometry: { coordinates: [number, number] }; properties: { label: string; citycode: string; context?: string; population?: number } }[];
    }>(`${config.geocoderUrl}/search?q=${encodeURIComponent(q)}&type=municipality&limit=5&index=address`, 5000);
    const results = res.features.map<SearchResult>((f) => ({
      type: "city",
      id: f.properties.citycode,
      label: f.properties.label,
      sublabel: f.properties.context,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    }));
    if (geoCache.size > 2000) geoCache.clear();
    geoCache.set(key, { at: Date.now(), results });
    return results;
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return json({ results: [] });
  const e = await engine();
  const nq = normalize(q);
  const cities = searchCities(q);

  const operators: SearchResult[] = e
    .getSources()
    .filter((s) =>
      [s.title, s.publisher, s.authority, ...s.networkNames, ...s.operatorGroups, ...s.agencies].some((t) => t && normalize(t).includes(nq)),
    )
    .sort((a, b) => b.liveVehicleCount - a.liveVehicleCount)
    .slice(0, 6)
    .map((s) => ({
      type: "operator",
      id: s.id,
      label: s.networkNames[0] ?? s.title,
      sublabel: `${s.publisher} · ${s.liveVehicleCount} véhicule(s) en direct`,
      sourceId: s.id,
      bbox: s.bbox,
    }));

  const routes: SearchResult[] = e.getRoutes({ q, limit: 6 }).map((r) => ({
    type: "route",
    id: `${r.sourceId}|${r.routeId}`,
    label: `Ligne ${r.shortName ?? r.routeId}${r.longName ? ` — ${r.longName}` : ""}`,
    sublabel: `${e.getSource(r.sourceId)?.networkNames[0] ?? e.getSource(r.sourceId)?.title ?? ""} · ${r.liveVehicles} en circulation`,
    sourceId: r.sourceId,
  }));

  const stops: SearchResult[] = e.searchStops(q, 5).map((s) => ({
    type: "stop",
    id: `${s.sourceId}|${s.stopId}`,
    label: s.name,
    sublabel: e.getSource(s.sourceId)?.networkNames[0] ?? e.getSource(s.sourceId)?.title,
    lat: s.lat,
    lon: s.lon,
    sourceId: s.sourceId,
  }));

  const vehicles = e.findVehicles(q, 8);
  const vehicleResults: SearchResult[] = vehicles
    .filter((v) => !(v.headsign && normalize(v.headsign).includes(nq)) || normalize(v.label ?? v.vehicleId ?? "") === nq)
    .slice(0, 4)
    .map((v) => ({
      type: "vehicle",
      id: v.key,
      label: `Véhicule ${v.label ?? v.vehicleId}`,
      sublabel: [v.routeShortName && `Ligne ${v.routeShortName}`, v.headsign].filter(Boolean).join(" → "),
      lat: v.lat,
      lon: v.lon,
      sourceId: v.sourceId,
    }));
  const destinations: SearchResult[] = vehicles
    .filter((v) => v.headsign && normalize(v.headsign).includes(nq))
    .slice(0, 4)
    .map((v) => ({
      type: "destination",
      id: v.key,
      label: `→ ${v.headsign}`,
      sublabel: [v.routeShortName && `Ligne ${v.routeShortName}`, e.getSource(v.sourceId)?.networkNames[0]].filter(Boolean).join(" · "),
      lat: v.lat,
      lon: v.lon,
      sourceId: v.sourceId,
    }));

  return json({ results: [...(await cities), ...operators, ...routes, ...stops, ...vehicleResults, ...destinations] });
}
