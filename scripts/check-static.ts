/**
 * Vérifie l'import GTFS statique d'une ou plusieurs sources.
 *   node scripts/check-static.ts <motif-de-titre>
 */
import { loadCatalog } from "../src/server/catalog/transport-data-gouv.ts";
import { loadGtfs } from "../src/server/static/gtfs.ts";

const pattern = new RegExp(process.argv[2] || "TBM", "i");
const { sources } = await loadCatalog();
const targets = sources.filter((s) => pattern.test(s.title) && s.hasRealtimePositions).slice(0, 3);
if (!targets.length) console.log("Aucune source correspondante");
for (const s of targets) {
  for (const url of s.staticGtfsUrls) {
    const t0 = Date.now();
    const m0 = process.memoryUsage().heapUsed;
    try {
      const g = await loadGtfs(url);
      const active = [...g.trips.values()].filter((t) => t.stStart >= 0).length;
      console.log(
        `${s.title} | ${url}\n  ${Date.now() - t0} ms, +${Math.round((process.memoryUsage().heapUsed - m0) / 1e6)} Mo heap` +
          ` | tz ${g.tz} | agences ${[...g.agencies.values()].join(", ")}\n  routes ${g.routes.size} | trips ${g.trips.size} (actives ${active})` +
          ` | stops ${g.stopIds.length} | stop_times ${g.stStop.length} | shapes ${g.shapes.size} | notes ${g.notes.join("; ") || "-"}`,
      );
    } catch (e) {
      console.log(`${s.title} | ${url}\n  ERREUR ${(e as Error).message}`);
    }
  }
}
