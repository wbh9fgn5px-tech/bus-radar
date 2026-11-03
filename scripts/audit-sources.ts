/**
 * Audit réel des flux GTFS-RT référencés sur transport.data.gouv.fr.
 * Interroge chaque flux une fois, décode le protobuf et mesure son contenu.
 *
 *   npm run audit:sources
 *
 * Produit docs/audit/gtfs-rt-audit.json et docs/audit/gtfs-rt-audit.md
 */
import fs from "node:fs/promises";
import path from "node:path";
import { loadCatalog } from "../src/server/catalog/transport-data-gouv.ts";
import { decodeFeed } from "../src/server/connectors/gtfs-rt.ts";
import { createLimiter, fetchBinary } from "../src/server/http.ts";

interface FeedAudit {
  sourceId: string;
  source: string;
  publisher: string;
  category: string;
  declared: string[];
  url: string;
  ok: boolean;
  error?: string;
  httpStatus?: number;
  bytes?: number;
  ms?: number;
  headerAgeSec?: number;
  entities?: number;
  vehicles?: number;
  freshVehicles?: number;
  withBearing?: number;
  withSpeed?: number;
  withTrip?: number;
  withRoute?: number;
  tripUpdates?: number;
  alerts?: number;
  rejected?: number;
}

const limit = createLimiter(10);
const { sources, fromCache } = await loadCatalog();
const withRt = sources.filter((s) => s.feeds.length > 0);
console.log(`Catalogue : ${sources.length} sources (${fromCache ? "cache disque" : "réseau"}), ${withRt.length} avec GTFS-RT`);

const jobs: Promise<FeedAudit>[] = [];
for (const src of withRt) {
  for (const feed of src.feeds) {
    jobs.push(
      limit(async () => {
        const base: FeedAudit = {
          sourceId: src.id,
          source: src.title,
          publisher: src.publisher,
          category: src.category,
          declared: feed.kind,
          url: feed.url,
          ok: false,
        };
        const t0 = Date.now();
        const r = await fetchBinary(feed.url, { timeoutMs: 20000 });
        base.ms = Date.now() - t0;
        if (r.kind !== "ok") return { ...base, error: r.kind === "error" ? r.error : "304", httpStatus: r.status };
        base.httpStatus = r.status;
        base.bytes = r.body.length;
        try {
          const d = decodeFeed(r.body);
          const now = Date.now();
          const ts = (v: { timestamp?: number }) => v.timestamp ?? d.headerTimestamp;
          return {
            ...base,
            ok: true,
            headerAgeSec: d.headerTimestamp ? Math.round((now - d.headerTimestamp) / 1000) : undefined,
            entities: d.entityCount,
            vehicles: d.vehicles.length,
            freshVehicles: d.vehicles.filter((v) => {
              const t = ts(v);
              return t !== undefined && now - t < 180_000;
            }).length,
            withBearing: d.vehicles.filter((v) => v.bearing !== undefined).length,
            withSpeed: d.vehicles.filter((v) => v.speedKmh !== undefined).length,
            withTrip: d.vehicles.filter((v) => v.tripId).length,
            withRoute: d.vehicles.filter((v) => v.routeId).length,
            tripUpdates: d.tripUpdates.length,
            alerts: d.alertCount,
            rejected: d.rejectedPositions,
          };
        } catch (e) {
          return { ...base, error: `Protobuf invalide : ${(e as Error).message.slice(0, 80)}` };
        }
      }),
    );
  }
}

const results = await Promise.all(jobs);
const outDir = path.join(process.cwd(), "docs", "audit");
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(
  path.join(outDir, "gtfs-rt-audit.json"),
  JSON.stringify({ auditedAt: new Date().toISOString(), results }, null, 2),
);

const ok = results.filter((r) => r.ok);
const withVehicles = ok.filter((r) => (r.vehicles ?? 0) > 0);
const fresh = ok.filter((r) => (r.freshVehicles ?? 0) > 0);
const sum = (a: FeedAudit[], k: keyof FeedAudit) => a.reduce((acc, r) => acc + ((r[k] as number) || 0), 0);
const errors = new Map<string, number>();
for (const r of results.filter((x) => !x.ok)) errors.set(r.error || "?", (errors.get(r.error || "?") || 0) + 1);

const lines = [
  `# Audit des flux GTFS-RT — ${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}`,
  "",
  `Source : catalogue transport.data.gouv.fr (${sources.length} jeux de transport public exploitables, ${withRt.length} avec GTFS-RT).`,
  "",
  "| Indicateur | Valeur |",
  "|---|---|",
  `| Flux GTFS-RT interrogés | ${results.length} |`,
  `| Flux joignables et décodables | ${ok.length} |`,
  `| Flux contenant des positions de véhicules | ${withVehicles.length} |`,
  `| Flux avec positions < 3 min | ${fresh.length} |`,
  `| Véhicules positionnés (total) | ${sum(ok, "vehicles")} |`,
  `| Véhicules avec position < 3 min | ${sum(ok, "freshVehicles")} |`,
  `| … avec cap (bearing) | ${sum(ok, "withBearing")} |`,
  `| … avec vitesse | ${sum(ok, "withSpeed")} |`,
  `| … rattachés à une course (trip_id) | ${sum(ok, "withTrip")} |`,
  `| Positions rejetées (invalides) | ${sum(ok, "rejected")} |`,
  "",
  "## Erreurs",
  "",
  ...[...errors].sort((a, b) => b[1] - a[1]).map(([e, c]) => `- ${e} : ${c}`),
  "",
  "## Flux avec positions (triés par nombre de véhicules frais)",
  "",
  "| Source | Éditeur | Véhicules | < 3 min | Cap | Vitesse | trip_id | Âge en-tête |",
  "|---|---|---:|---:|---:|---:|---:|---:|",
  ...withVehicles
    .sort((a, b) => (b.freshVehicles ?? 0) - (a.freshVehicles ?? 0))
    .map(
      (r) =>
        `| ${r.source} | ${r.publisher} | ${r.vehicles} | ${r.freshVehicles} | ${r.withBearing} | ${r.withSpeed} | ${r.withTrip} | ${r.headerAgeSec ?? "?"} s |`,
    ),
];
await fs.writeFile(path.join(outDir, "gtfs-rt-audit.md"), lines.join("\n") + "\n");
console.log(lines.slice(0, 22).join("\n"));
