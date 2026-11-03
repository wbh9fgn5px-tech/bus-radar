/**
 * Import GTFS statique (horaires THÉORIQUES).
 *
 * - Téléchargement avec cache disque et requêtes conditionnelles.
 * - Lecture en flux, sans charger les fichiers en entier.
 * - Les stop_times ne sont conservés que pour les courses circulant
 *   hier / aujourd'hui / demain (selon calendar + calendar_dates) :
 *   l'empreinte mémoire reste compatible avec une couverture nationale.
 *
 * Ces données servent UNIQUEMENT à enrichir les positions temps réel
 * (nom de ligne, destination, arrêts) et à afficher des horaires
 * explicitement marqués comme théoriques.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.ts";
import { fetchBinary } from "../http.ts";
import type { VehicleMode } from "../../lib/types.ts";
import { localDate, parseGtfsTime, shiftDate, weekday } from "./time.ts";
import { openZip } from "./zip-csv.ts";

export interface RouteInfo {
  id: string;
  agencyId?: string;
  shortName?: string;
  longName?: string;
  color?: string;
  textColor?: string;
  type: number;
  mode: VehicleMode;
}

export interface TripInfo {
  routeId: string;
  serviceId: string;
  headsign?: string;
  directionId?: number;
  shapeId?: string;
  /** Index de début dans les tableaux stop_times, -1 si non chargé. */
  stStart: number;
  stLen: number;
}

export function modeFromRouteType(t: number): VehicleMode {
  if (t === 3 || (t >= 700 && t < 800)) return "bus";
  if (t >= 200 && t < 300) return "coach";
  if (t === 11 || t === 800) return "trolleybus";
  if (t === 0 || (t >= 900 && t < 1000)) return "tram";
  if (t === 1 || (t >= 400 && t < 500)) return "metro";
  if (t === 2 || (t >= 100 && t < 200)) return "rail";
  if (t === 4 || (t >= 1000 && t < 1300)) return "ferry";
  if (t === 5 || t === 6 || t === 7 || (t >= 1300 && t < 1500)) return "cable";
  return t >= 0 ? "other" : "unknown";
}

class GrowInt32 {
  data = new Int32Array(1 << 16);
  length = 0;
  push(v: number) {
    if (this.length === this.data.length) {
      const n = new Int32Array(this.data.length * 2);
      n.set(this.data);
      this.data = n;
    }
    this.data[this.length++] = v;
  }
  trim(): Int32Array {
    return this.data.slice(0, this.length);
  }
}

const color = (c?: string) => (c && /^[0-9a-f]{6}$/i.test(c) ? c.toUpperCase() : undefined);

export class GtfsIndex {
  url = "";
  tz = "Europe/Paris";
  agencies = new Map<string, string>();
  routes = new Map<string, RouteInfo>();
  trips = new Map<string, TripInfo>();
  stopIds: string[] = [];
  stopIndex = new Map<string, number>();
  stopNames: string[] = [];
  stopLat = new Float64Array(0);
  stopLon = new Float64Array(0);
  /** stop_times compacts des courses actives. */
  stStop = new Int32Array(0);
  stTime = new Int32Array(0);
  stSeq = new Int32Array(0);
  /** ligne stop_times → index dans activeTripIds. */
  stTrip = new Int32Array(0);
  activeTripIds: string[] = [];
  /** gare/station parente → arrêts enfants. */
  children = new Map<number, number[]>();
  shapes = new Map<string, Float32Array>();
  /** routeId → shapes distincts (courses actives). */
  routeShapes = new Map<string, Set<string>>();
  routeHeadsigns = new Map<string, Set<string>>();
  /** index d'arrêt → routes desservies (courses actives). */
  stopRoutes = new Map<number, Set<string>>();
  /** date "YYYYMMDD" → services actifs. */
  activeServices = new Map<string, Set<string>>();
  windowDates: string[] = [];
  loadedAt = 0;
  stopTimesLoaded = false;
  notes: string[] = [];
  bbox?: [number, number, number, number];

  stopOf(id: string | undefined): number {
    return id === undefined ? -1 : (this.stopIndex.get(id) ?? -1);
  }
}

function cacheName(url: string) {
  return crypto.createHash("sha1").update(url).digest("hex").slice(0, 16);
}

/** Télécharge (ou réutilise) l'archive GTFS. Renvoie le chemin local. */
export async function downloadGtfs(url: string): Promise<string> {
  const dir = path.join(config.dataDir, "gtfs");
  await fs.mkdir(dir, { recursive: true });
  const base = path.join(dir, cacheName(url));
  const zipFile = `${base}.zip`;
  const metaFile = `${base}.json`;
  const meta = JSON.parse(await fs.readFile(metaFile, "utf8").catch(() => "{}")) as {
    etag?: string;
    lastModified?: string;
    fetchedAt?: number;
  };
  const exists = await fs.stat(zipFile).then(() => true, () => false);
  if (exists && meta.fetchedAt && Date.now() - meta.fetchedAt < config.staticRefreshHours * 3600_000) return zipFile;

  const r = await fetchBinary(url, {
    cond: exists ? meta : undefined,
    timeoutMs: 180_000,
    maxBytes: config.staticMaxZipMb * 1024 * 1024,
    headers: { Accept: "application/zip, */*" },
  });
  if (r.kind === "not_modified") {
    await fs.writeFile(metaFile, JSON.stringify({ ...meta, fetchedAt: Date.now() }));
    return zipFile;
  }
  if (r.kind === "error") {
    if (exists) return zipFile; // on garde l'ancienne version plutôt que rien
    throw new Error(r.error);
  }
  if (r.body[0] !== 0x50 || r.body[1] !== 0x4b) throw new Error("La ressource n'est pas une archive ZIP");
  await fs.writeFile(zipFile, r.body);
  await fs.writeFile(metaFile, JSON.stringify({ etag: r.etag, lastModified: r.lastModified, fetchedAt: Date.now() }));
  return zipFile;
}

export async function loadGtfs(url: string, now = Date.now()): Promise<GtfsIndex> {
  const file = await downloadGtfs(url);
  const zip = await openZip(file);
  const g = new GtfsIndex();
  g.url = url;
  try {
    if (!zip.has("stops.txt") || !zip.has("routes.txt") || !zip.has("trips.txt")) {
      throw new Error("GTFS incomplet (stops/routes/trips manquants)");
    }

    // agency.txt
    await zip.forEachRow("agency.txt", (r) => {
      const id = r("agency_id") ?? "";
      const name = r("agency_name");
      if (name) g.agencies.set(id, name);
      const tz = r("agency_timezone");
      if (tz && g.agencies.size === 1) g.tz = tz;
    });

    // Fenêtre de service : hier, aujourd'hui, demain (fuseau de l'agence).
    const today = localDate(now, g.tz);
    g.windowDates = [shiftDate(today, -1), today, shiftDate(today, 1)];
    for (const d of g.windowDates) g.activeServices.set(d, new Set());
    const dayCols = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    await zip.forEachRow("calendar.txt", (r) => {
      const sid = r("service_id");
      const start = r("start_date");
      const end = r("end_date");
      if (!sid || !start || !end) return;
      for (const d of g.windowDates) {
        if (d >= start && d <= end && r(dayCols[weekday(d)]) === "1") g.activeServices.get(d)!.add(sid);
      }
    });
    await zip.forEachRow("calendar_dates.txt", (r) => {
      const sid = r("service_id");
      const d = r("date");
      if (!sid || !d || !g.activeServices.has(d)) return;
      if (r("exception_type") === "1") g.activeServices.get(d)!.add(sid);
      else if (r("exception_type") === "2") g.activeServices.get(d)!.delete(sid);
    });
    const windowServices = new Set<string>();
    for (const s of g.activeServices.values()) for (const x of s) windowServices.add(x);
    if (!zip.has("calendar.txt") && !zip.has("calendar_dates.txt")) g.notes.push("Aucun calendrier : courses non filtrées");

    // routes.txt
    await zip.forEachRow("routes.txt", (r) => {
      const id = r("route_id");
      if (!id) return;
      const type = Number(r("route_type") ?? -1);
      g.routes.set(id, {
        id,
        agencyId: r("agency_id"),
        shortName: r("route_short_name"),
        longName: r("route_long_name"),
        color: color(r("route_color")),
        textColor: color(r("route_text_color")),
        type,
        mode: modeFromRouteType(type),
      });
    });

    // trips.txt
    const activeTrip = new Map<string, number>();
    const activeTripIds: string[] = [];
    const noCalendar = windowServices.size === 0 && g.notes.length > 0;
    await zip.forEachRow("trips.txt", (r) => {
      const id = r("trip_id");
      const routeId = r("route_id");
      if (!id || !routeId) return;
      const serviceId = r("service_id") ?? "";
      const dir = r("direction_id");
      const t: TripInfo = {
        routeId,
        serviceId,
        headsign: r("trip_headsign"),
        directionId: dir === undefined ? undefined : Number(dir),
        shapeId: r("shape_id"),
        stStart: -1,
        stLen: 0,
      };
      g.trips.set(id, t);
      if (noCalendar || windowServices.has(serviceId)) {
        activeTrip.set(id, activeTripIds.length);
        activeTripIds.push(id);
        if (t.headsign) {
          let hs = g.routeHeadsigns.get(routeId);
          if (!hs) g.routeHeadsigns.set(routeId, (hs = new Set()));
          if (hs.size < 8) hs.add(t.headsign);
        }
        if (t.shapeId) {
          let rs = g.routeShapes.get(routeId);
          if (!rs) g.routeShapes.set(routeId, (rs = new Set()));
          rs.add(t.shapeId);
        }
      }
    });

    // stops.txt
    const lats: number[] = [];
    const parents: [number, string][] = [];
    const lons: number[] = [];
    let minX = 180, minY = 90, maxX = -180, maxY = -90;
    await zip.forEachRow("stops.txt", (r) => {
      const id = r("stop_id");
      const lat = Number(r("stop_lat"));
      const lon = Number(r("stop_lon"));
      if (!id || !Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return;
      g.stopIndex.set(id, g.stopIds.length);
      g.stopIds.push(id);
      g.stopNames.push(r("stop_name") ?? id);
      const parent = r("parent_station");
      if (parent) parents.push([g.stopIds.length - 1, parent]);
      lats.push(lat);
      lons.push(lon);
      const lt = r("location_type");
      if (!lt || lt === "0") {
        minX = Math.min(minX, lon); maxX = Math.max(maxX, lon);
        minY = Math.min(minY, lat); maxY = Math.max(maxY, lat);
      }
    });
    for (const [child, pid] of parents) {
      const p = g.stopIndex.get(pid);
      if (p === undefined) continue;
      const list = g.children.get(p);
      if (list) list.push(child);
      else g.children.set(p, [child]);
    }
    g.stopLat = Float64Array.from(lats);
    g.stopLon = Float64Array.from(lons);
    if (minX <= maxX) g.bbox = [minX, minY, maxX, maxY];

    // stop_times.txt (courses actives uniquement)
    const stSize = zip.size("stop_times.txt");
    if (stSize > 1.5 * 1024 * 1024 * 1024) {
      g.notes.push("stop_times trop volumineux : arrêts des courses non chargés");
    } else if (zip.has("stop_times.txt")) {
      const tTrip = new GrowInt32();
      const tStop = new GrowInt32();
      const tSeq = new GrowInt32();
      const tTime = new GrowInt32();
      let sorted = true;
      let prevTrip = -1;
      let prevSeq = -1;
      await zip.forEachRow("stop_times.txt", (r) => {
        const ti = activeTrip.get(r("trip_id") ?? "");
        if (ti === undefined) return;
        const si = g.stopOf(r("stop_id"));
        const seq = Number(r("stop_sequence") ?? -1);
        if (ti < prevTrip || (ti === prevTrip && seq < prevSeq)) sorted = false;
        prevTrip = ti;
        prevSeq = seq;
        tTrip.push(ti);
        tStop.push(si);
        tSeq.push(seq);
        tTime.push(parseGtfsTime(r("arrival_time") ?? r("departure_time")));
      });
      const n = tTrip.length;
      let order: Uint32Array | null = null;
      const tripArr = tTrip.data;
      const seqArr = tSeq.data;
      if (!sorted) {
        order = new Uint32Array(n);
        for (let i = 0; i < n; i++) order[i] = i;
        order.sort((a, b) => tripArr[a] - tripArr[b] || seqArr[a] - seqArr[b]);
      }
      g.stStop = new Int32Array(n);
      g.stTime = new Int32Array(n);
      g.stSeq = new Int32Array(n);
      g.stTrip = new Int32Array(n);
      g.activeTripIds = activeTripIds;
      let curTrip = -1;
      let trip: TripInfo | undefined;
      for (let k = 0; k < n; k++) {
        const i = order ? order[k] : k;
        g.stStop[k] = tStop.data[i];
        g.stTime[k] = tTime.data[i];
        g.stSeq[k] = seqArr[i];
        const ti = tripArr[i];
        g.stTrip[k] = ti;
        if (ti !== curTrip) {
          curTrip = ti;
          trip = g.trips.get(activeTripIds[ti])!;
          trip.stStart = k;
          trip.stLen = 0;
        }
        trip!.stLen++;
        const si = tStop.data[i];
        if (si >= 0) {
          let set = g.stopRoutes.get(si);
          if (!set) g.stopRoutes.set(si, (set = new Set()));
          set.add(trip!.routeId);
        }
      }
      g.stopTimesLoaded = true;
    }

    // shapes.txt (tracés utilisés par les courses actives)
    const usedShapes = new Set<string>();
    for (const s of g.routeShapes.values()) for (const x of s) usedShapes.add(x);
    if (usedShapes.size && zip.has("shapes.txt")) {
      const acc = new Map<string, number[]>();
      await zip.forEachRow("shapes.txt", (r) => {
        const id = r("shape_id");
        if (!id || !usedShapes.has(id)) return;
        let a = acc.get(id);
        if (!a) acc.set(id, (a = []));
        a.push(Number(r("shape_pt_sequence")), Number(r("shape_pt_lon")), Number(r("shape_pt_lat")));
      });
      for (const [id, a] of acc) {
        const n = a.length / 3;
        const idx = Array.from({ length: n }, (_, i) => i).sort((x, y) => a[x * 3] - a[y * 3]);
        const out = new Float32Array(n * 2);
        idx.forEach((p, k) => {
          out[k * 2] = a[p * 3 + 1];
          out[k * 2 + 1] = a[p * 3 + 2];
        });
        g.shapes.set(id, out);
      }
    }
    g.loadedAt = Date.now();
    return g;
  } finally {
    zip.close();
  }
}
