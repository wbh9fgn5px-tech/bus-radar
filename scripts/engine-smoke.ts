/**
 * Test de fumée du moteur d'ingestion, hors Next.js.
 *   node scripts/engine-smoke.ts [durée en secondes]
 */
import { Engine } from "../src/server/engine/engine.ts";

const seconds = Number(process.argv[2] || 90);
const e = new Engine();
const t0 = Date.now();
await e.start();
console.log(`catalogue : ${e.sources.size} sources en ${Date.now() - t0} ms`);

const report = () => {
  const s = e.getStats();
  const by: Record<string, number> = {};
  for (const src of e.getSources()) by[src.status] = (by[src.status] ?? 0) + 1;
  const st: Record<string, number> = {};
  for (const src of e.getSources().filter((x) => x.hasRealtimePositions)) st[src.staticState] = (st[src.staticState] ?? 0) + 1;
  console.log(
    `[${Math.round((Date.now() - t0) / 1000)}s] véhicules ${s.vehiclesTracked} (direct ${s.vehiclesLive}) | réseaux couverts ${s.networksCovered} | lignes ${s.routesAvailable}` +
      ` | statuts ${JSON.stringify(by)} | GTFS ${JSON.stringify(st)} | heap ${Math.round(process.memoryUsage().heapUsed / 1e6)} Mo`,
  );
};
const timer = setInterval(report, 15000);
await new Promise((r) => setTimeout(r, seconds * 1000));
clearInterval(timer);
report();

const snap = e.getSnapshot();
const modes: Record<string, number> = {};
for (const v of snap) modes[v.m] = (modes[v.m] ?? 0) + 1;
console.log("modes :", modes, "| avec ligne :", snap.filter((v) => v.r).length, "| avec destination :", snap.filter((v) => v.h).length);
const sample = snap.find((v) => v.h && v.s.includes("tbm")) ?? snap.find((v) => v.h);
if (sample) {
  const d = e.getVehicle(sample.k)!;
  console.log("exemple :", JSON.stringify({ ...d, stops: d.stops?.slice(0, 3), shape: d.shape?.length, history: d.history.length }, null, 1).slice(0, 2500));
}
for (const s of e.getSources().filter((x) => x.status === "offline").slice(0, 8)) console.log("hors ligne :", s.title, "-", s.statusDetail);
e.stop();
process.exit(0);
