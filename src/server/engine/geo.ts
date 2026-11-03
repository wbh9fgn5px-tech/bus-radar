/**
 * Rattachement géographique des sources dont le catalogue ne déclare
 * qu'une EPCI (sans département) : géocodage inverse IGN (Géoplateforme)
 * de la position médiane des véhicules. Résultat mis en cache disque.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.ts";
import { fetchJson, createLimiter } from "../http.ts";
import type { GeoScope } from "../../lib/types.ts";
import { DEPARTEMENTS, departementFromCommune, regionOfDepartement } from "../../lib/geo-ref.ts";

const limit = createLimiter(1);
let cache: Record<string, GeoScope> | null = null;
const file = () => path.join(config.dataDir, "geo-cache.json");

async function loadCache() {
  if (!cache) cache = JSON.parse(await fs.readFile(file(), "utf8").catch(() => "{}"));
  return cache!;
}

export function resolveGeo(sourceId: string, lat: number, lon: number): Promise<GeoScope | undefined> {
  return limit(async () => {
    const c = await loadCache();
    if (c[sourceId]) return c[sourceId];
    try {
      const res = await fetchJson<{ features?: { properties: { citycode?: string; city?: string } }[] }>(
        `${config.geocoderUrl}/reverse?lon=${lon}&lat=${lat}&index=address&limit=1`,
        10000,
      );
      const p = res.features?.[0]?.properties;
      const dep = p?.citycode ? departementFromCommune(p.citycode) : undefined;
      if (!dep) return undefined;
      const region = regionOfDepartement(dep);
      const geo: GeoScope = {
        regions: region ? [region] : [],
        departements: [{ code: dep, name: DEPARTEMENTS[dep][0] }],
        communes: p?.city ? [p.city] : [],
        basis: "reverse_geocoding",
      };
      c[sourceId] = geo;
      await fs.mkdir(config.dataDir, { recursive: true });
      await fs.writeFile(file(), JSON.stringify(c));
      await new Promise((r) => setTimeout(r, 250)); // politesse envers le service
      return geo;
    } catch {
      return undefined;
    }
  });
}
