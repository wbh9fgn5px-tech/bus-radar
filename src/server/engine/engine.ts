/**
 * Moteur d'ingestion temps réel.
 *
 *  Catalogue national → Connecteurs (GTFS-RT) → Normalisation → État mémoire
 *  → API / flux SSE → Carte.
 *
 * - Chaque flux est interrogé à son rythme, avec backoff exponentiel en cas
 *   d'erreur et respect de Retry-After (HTTP 429).
 * - Les requêtes conditionnelles évitent de retransférer un flux inchangé.
 * - Les positions ne sont JAMAIS extrapolées : un véhicule absent du dernier
 *   flux disparaît ; un véhicule trop ancien n'est plus affiché.
 * - Le GTFS statique n'enrichit que les champs descriptifs.
 */
import { EventEmitter } from "node:events";
import { config } from "../config.ts";
import { createLimiter, fetchBinary, type ConditionalState } from "../http.ts";
import { loadCatalog, type SourceDescriptor } from "../catalog/transport-data-gouv.ts";
import { detectOperatorGroups, operatorOverrides } from "../catalog/operators.ts";
import { decodeFeed, type RawTripUpdate, type RawVehicle } from "../connectors/gtfs-rt.ts";
import { decodeSiriLiteVM } from "../connectors/siri-lite.ts";
import { loadCredentialedSources } from "../catalog/credentialed.ts";
import { loadGtfs, type GtfsIndex } from "../static/gtfs.ts";
import { localDate } from "../static/time.ts";
import { agencyName, buildTripStops, delayFromTripUpdate, departuresAt, lookup, tripTerminus } from "./static-queries.ts";
import { resolveGeo } from "./geo.ts";
import { createHistoryStore } from "./history.ts";
import type {
  Departure,
  MapVehicle,
  RouteSummary,
  SourceInfo,
  Stats,
  StopSummary,
  Vehicle,
  VehicleDetail,
} from "../../lib/types.ts";

interface FeedRuntime {
  url: string;
  kinds: string[];
  cond: ConditionalState;
  failures: number;
  nextAt: number;
  inFlight: boolean;
  lastError?: string;
  lastSuccessAt?: number;
  vehicles: RawVehicle[];
  tripUpdates: RawTripUpdate[];
  headerTs?: number;
  decoder: "gtfs-rt" | "siri-lite-vm";
  /** En-têtes d'authentification (sources à identifiants) — jamais exposés au client. */
  headers?: Record<string, string>;
}

interface SourceRuntime {
  desc: SourceDescriptor;
  info: SourceInfo;
  feeds: FeedRuntime[];
  vehicles: Map<string, Vehicle>;
  tripUpdates: Map<string, RawTripUpdate>;
  indexes: GtfsIndex[];
  isAggregate: boolean;
  staticDate?: string;
  staleExcluded: number;
}

const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const bearingBetween = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const toRad = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * toRad) * Math.cos(lat2 * toRad);
  const x =
    Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
    Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lon2 - lon1) * toRad);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

export const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export class Engine extends EventEmitter {
  sources = new Map<string, SourceRuntime>();
  history = createHistoryStore();
  catalogFetchedAt = 0;
  catalogFromCache = false;
  catalogError?: string;
  startedAt = Date.now();
  private started = false;
  private timers: NodeJS.Timeout[] = [];
  private fetchLimit = createLimiter(config.fetchConcurrency);
  private staticLimit = createLimiter(config.staticConcurrency);
  /** URL de flux → source propriétaire (un flux partagé n'est interrogé qu'une fois). */
  private feedOwners = new Map<string, string>();

  async start() {
    if (this.started) return;
    this.started = true;
    this.setMaxListeners(0);
    await this.refreshCatalog();
    this.timers.push(setInterval(() => this.tick(), 1000));
    this.timers.push(setInterval(() => this.refreshCatalog(), config.catalogRefreshHours * 3600_000));
    this.timers.push(setInterval(() => this.maintenance(), 60_000));
    this.timers.push(setInterval(() => this.emit("stats", this.getStats()), 5000));
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.started = false;
  }

  // ───────────────────────── Catalogue ─────────────────────────

  async refreshCatalog() {
    try {
      const { sources, fetchedAt, fromCache } = await loadCatalog();
      this.catalogFetchedAt = fetchedAt;
      this.catalogFromCache = fromCache;
      this.catalogError = undefined;
      const keep = new Set<string>();
      const overrides = operatorOverrides();
      for (const desc of sources) {
        if (config.onlySources.length && !config.onlySources.includes(desc.id)) continue;
        keep.add(desc.id);
        const ov = overrides.find((o) => o.sourceId === desc.id);
        if (ov) desc.operatorGroups = [...new Set([...desc.operatorGroups, ...ov.operatorGroups])];
        const existing = this.sources.get(desc.id);
        if (existing) {
          existing.desc = desc;
          Object.assign(existing.info, this.baseInfo(desc), {
            agencies: existing.info.agencies,
            operatorGroups: [...new Set([...desc.operatorGroups, ...existing.info.operatorGroups])],
          });
          continue;
        }
        const feeds: FeedRuntime[] = [];
        if (desc.hasRealtimePositions) {
          for (const f of desc.feeds) {
            const owner = this.feedOwners.get(f.url);
            if (owner && owner !== desc.id) continue;
            this.feedOwners.set(f.url, desc.id);
            feeds.push({
              url: f.url,
              kinds: f.kind,
              cond: {},
              failures: 0,
              nextAt: Date.now() + Math.random() * 5000, // étalement des premiers appels
              inFlight: false,
              vehicles: [],
              tripUpdates: [],
              decoder: "gtfs-rt",
            });
          }
        }
        this.sources.set(desc.id, {
          desc,
          info: this.baseInfo(desc),
          feeds,
          vehicles: new Map(),
          tripUpdates: new Map(),
          indexes: [],
          isAggregate: /agr[ée]gat/i.test(desc.title),
          staleExcluded: 0,
        });
      }
      // Sources à identifiants (config/credentialed-sources.json).
      for (const m of loadCredentialedSources()) {
        keep.add(m.desc.id);
        if (this.sources.has(m.desc.id)) continue;
        const info = this.baseInfo(m.desc);
        info.connector = m.connector === "siri-lite-vm" ? "siri-lite" : "gtfs-rt";
        if (!m.headers) {
          info.status = "disabled";
          info.statusDetail = `Identifiants requis : définir ${m.envVar} (voir docs/SOURCES.md)`;
        }
        this.sources.set(m.desc.id, {
          desc: m.desc,
          info,
          feeds: m.headers
            ? [{ url: m.url, kinds: ["vehicle_positions"], cond: {}, failures: 0, nextAt: Date.now(), inFlight: false, vehicles: [], tripUpdates: [], decoder: m.connector, headers: m.headers }]
            : [],
          vehicles: new Map(),
          tripUpdates: new Map(),
          indexes: [],
          isAggregate: false,
          staleExcluded: 0,
        });
      }
      for (const id of [...this.sources.keys()]) if (!keep.has(id)) this.sources.delete(id);
      this.emit("sources", this.getSources());
    } catch (e) {
      this.catalogError = (e as Error).message;
      console.error("[engine] catalogue :", this.catalogError);
    }
  }

  private baseInfo(desc: SourceDescriptor): SourceInfo {
    return {
      id: desc.id,
      connector: "gtfs-rt",
      title: desc.title,
      networkNames: desc.networkNames,
      authority: desc.authority,
      publisher: desc.publisher,
      operatorGroups: desc.operatorGroups,
      agencies: [],
      category: desc.category,
      categoryBasis: desc.categoryBasis,
      geo: desc.geo,
      licence: desc.licence,
      pageUrl: desc.pageUrl,
      feeds: desc.feeds,
      hasRealtimePositions: desc.hasRealtimePositions,
      status: desc.hasRealtimePositions ? "pending" : "static",
      statusDetail: desc.hasRealtimePositions
        ? undefined
        : desc.hasTripUpdates
          ? "Horaires temps réel publiés, mais aucune position GPS"
          : "Horaires théoriques uniquement : aucun flux de positions publié",
      vehicleCount: 0,
      liveVehicleCount: 0,
      staticState: desc.hasRealtimePositions ? "none" : "skipped",
      routeCount: 0,
      stopCount: 0,
      pollIntervalSec: Math.max(config.pollIntervalSec, config.minPollIntervalSec),
    };
  }

  // ───────────────────────── Interrogation ─────────────────────────

  private tick() {
    const now = Date.now();
    for (const rt of this.sources.values()) {
      for (const feed of rt.feeds) {
        if (feed.inFlight || feed.nextAt > now) continue;
        feed.inFlight = true;
        this.fetchLimit(() => this.pollFeed(rt, feed)).finally(() => {
          feed.inFlight = false;
        });
      }
    }
  }

  private async pollFeed(rt: SourceRuntime, feed: FeedRuntime) {
    const interval = rt.info.pollIntervalSec * 1000;
    rt.info.lastFetchAt = Date.now();
    const r = await fetchBinary(feed.url, { cond: feed.cond, headers: feed.headers });
    if (r.kind === "error") {
      feed.failures++;
      feed.lastError = r.error;
      const backoff = Math.min(interval * 2 ** feed.failures, config.maxBackoffSec * 1000);
      feed.nextAt = Date.now() + (r.status === 429 ? Math.max(backoff, 120_000) : backoff);
      this.updateSourceStatus(rt);
      this.emit("source-update", rt.info.id);
      return;
    }
    feed.failures = 0;
    feed.lastError = undefined;
    feed.lastSuccessAt = Date.now();
    feed.nextAt = Date.now() + interval;
    if (r.kind === "ok") {
      feed.cond = { etag: r.etag, lastModified: r.lastModified };
      try {
        const d = feed.decoder === "siri-lite-vm" ? decodeSiriLiteVM(r.body) : decodeFeed(r.body);
        feed.vehicles = d.vehicles;
        feed.tripUpdates = d.tripUpdates;
        feed.headerTs = d.headerTimestamp;
      } catch (e) {
        feed.failures++;
        feed.lastError = `Flux illisible : ${(e as Error).message.slice(0, 100)}`;
        feed.nextAt = Date.now() + Math.min(interval * 2 ** feed.failures, config.maxBackoffSec * 1000);
      }
    }
    this.rebuildSource(rt);
  }

  /** Fusionne les flux d'une source et normalise ses véhicules. */
  private rebuildSource(rt: SourceRuntime) {
    const now = Date.now();
    const tus = new Map<string, RawTripUpdate>();
    for (const f of rt.feeds) for (const tu of f.tripUpdates) if (tu.tripId) tus.set(tu.tripId, tu);
    rt.tripUpdates = tus;

    const next = new Map<string, Vehicle>();
    let stale = 0;
    for (const f of rt.feeds) {
      for (const raw of f.vehicles) {
        const ts = raw.timestamp ?? f.headerTs;
        if (!ts) continue; // sans horodatage, impossible d'en garantir la fraîcheur
        if (now - ts > config.dropAfterSec * 1000) {
          stale++;
          continue;
        }
        const ident = raw.vehicleId ?? (raw.tripId ? `trip:${raw.tripId}` : `e:${raw.entityId}`);
        const key = `${rt.info.id}:${ident}`;
        const dup = next.get(key);
        if (dup && dup.timestamp >= ts) continue;
        next.set(key, this.normalizeVehicle(rt, key, raw, ts, raw.timestamp ? "vehicle" : "feed_header", now));
      }
    }
    rt.vehicles = next;
    rt.staleExcluded = stale;
    for (const v of next.values()) this.history.record(v);
    this.updateSourceStatus(rt);
    if (next.size && rt.info.staticState === "none" && config.loadStatic) this.queueStatic(rt);
    if (next.size && rt.info.geo.basis === "unknown") this.queueGeo(rt);
    this.emit("source-update", rt.info.id);
  }

  private normalizeVehicle(
    rt: SourceRuntime,
    key: string,
    raw: RawVehicle,
    ts: number,
    tsSource: Vehicle["timestampSource"],
    now: number,
  ): Vehicle {
    const prev = rt.vehicles.get(key);
    let bearing = raw.bearing;
    let bearingSource: Vehicle["bearingSource"] = bearing !== undefined ? "feed" : undefined;
    if (bearing === undefined && prev) {
      // Cap calculé entre deux positions réellement reçues (jamais extrapolé).
      if (haversine(prev.lat, prev.lon, raw.lat, raw.lon) >= 15) {
        bearing = bearingBetween(prev.lat, prev.lon, raw.lat, raw.lon);
        bearingSource = "computed";
      } else if (prev.bearingSource === "computed") {
        bearing = prev.bearing;
        bearingSource = "computed";
      }
    }
    const l = lookup(rt.indexes, raw.tripId, raw.routeId);
    const tu = raw.tripId ? rt.tripUpdates.get(raw.tripId) : undefined;
    return {
      key,
      sourceId: rt.info.id,
      vehicleId: raw.vehicleId,
      label: raw.label,
      licensePlate: raw.licensePlate,
      lat: raw.lat,
      lon: raw.lon,
      bearing,
      bearingSource,
      speedKmh: raw.speedKmh,
      timestamp: ts,
      timestampSource: tsSource,
      receivedAt: now,
      tripId: raw.tripId,
      routeId: raw.routeId ?? l.trip?.routeId,
      directionId: raw.directionId ?? l.trip?.directionId,
      startDate: raw.startDate,
      startTime: raw.startTime,
      stopId: raw.stopId,
      currentStatus: raw.currentStatus,
      currentStopSequence: raw.currentStopSequence,
      occupancyStatus: raw.occupancyStatus,
      routeShortName: l.route?.shortName,
      routeLongName: l.route?.longName,
      routeColor: l.route?.color,
      routeTextColor: l.route?.textColor,
      mode: l.route?.mode ?? "unknown",
      headsign: l.trip?.headsign ?? (l.g && l.trip ? tripTerminus(l.g, l.trip) : undefined),
      agencyName: agencyName(l.g, l.route),
      delaySec: delayFromTripUpdate(tu, now),
    };
  }

  private updateSourceStatus(rt: SourceRuntime) {
    const info = rt.info;
    if (!info.hasRealtimePositions || info.status === "disabled") return;
    const now = Date.now();
    const okFeeds = rt.feeds.filter((f) => f.lastSuccessAt);
    const lastSuccess = Math.max(0, ...rt.feeds.map((f) => f.lastSuccessAt ?? 0));
    const headerTs = Math.max(0, ...rt.feeds.map((f) => f.headerTs ?? 0));
    info.lastSuccessAt = lastSuccess || undefined;
    info.lastFeedTimestamp = headerTs || undefined;
    info.lastError = rt.feeds.find((f) => f.lastError)?.lastError;
    info.vehicleCount = rt.vehicles.size;
    info.liveVehicleCount = [...rt.vehicles.values()].filter((v) => now - v.timestamp <= config.liveMaxAgeSec * 1000).length;
    const failing = rt.feeds.length > 0 && rt.feeds.every((f) => f.failures > 0);
    const silent = !lastSuccess || now - lastSuccess > 5 * info.pollIntervalSec * 1000;

    if (rt.feeds.length === 0) {
      info.status = "offline";
      info.statusDetail = "Flux partagé avec une autre source du catalogue";
    } else if (!okFeeds.length && !failing) {
      info.status = "pending";
      info.statusDetail = "Première interrogation en cours";
    } else if (failing && silent) {
      info.status = "offline";
      info.statusDetail = `Flux indisponible : ${info.lastError ?? "erreur"} — véhicules de cette source non disponibles`;
    } else if (info.liveVehicleCount > 0) {
      info.status = "live";
      info.statusDetail =
        info.liveVehicleCount < info.vehicleCount
          ? `${info.vehicleCount - info.liveVehicleCount} position(s) de plus de ${Math.round(config.liveMaxAgeSec / 60)} min`
          : undefined;
    } else if (info.vehicleCount > 0) {
      info.status = "lagging";
      info.statusDetail = "Positions reçues mais anciennes";
    } else if (headerTs && now - headerTs <= config.liveMaxAgeSec * 1000) {
      info.status = "live";
      info.statusDetail = "Flux actif : aucun véhicule en circulation signalé";
    } else {
      info.status = "lagging";
      info.statusDetail =
        rt.staleExcluded > 0
          ? `${rt.staleExcluded} position(s) trop ancienne(s) ignorée(s)`
          : "Flux joignable mais sans position récente";
    }
    if (rt.vehicles.size) {
      let minX = 180, minY = 90, maxX = -180, maxY = -90;
      for (const v of rt.vehicles.values()) {
        minX = Math.min(minX, v.lon); maxX = Math.max(maxX, v.lon);
        minY = Math.min(minY, v.lat); maxY = Math.max(maxY, v.lat);
      }
      info.bbox = rt.indexes[0]?.bbox ?? [minX, minY, maxX, maxY];
    }
  }

  // ───────────────────────── GTFS statique ─────────────────────────

  private queueStatic(rt: SourceRuntime) {
    if (!rt.desc.staticGtfsUrls.length) {
      rt.info.staticState = "skipped";
      rt.info.staticDetail = "Aucun GTFS statique publié pour ce jeu de données";
      return;
    }
    rt.info.staticState = "pending";
    this.staticLimit(async () => {
      rt.info.staticState = "loading";
      const indexes: GtfsIndex[] = [];
      const errors: string[] = [];
      for (const url of rt.desc.staticGtfsUrls) {
        try {
          indexes.push(await loadGtfs(url));
        } catch (e) {
          errors.push((e as Error).message);
        }
      }
      if (!indexes.length) {
        rt.info.staticState = "error";
        rt.info.staticDetail = errors.join(" ; ").slice(0, 200);
        return;
      }
      rt.indexes = indexes;
      rt.staticDate = indexes[0].windowDates[1];
      rt.info.staticState = "ready";
      rt.info.staticDetail = [...indexes.flatMap((g) => g.notes), ...errors].join(" ; ") || undefined;
      rt.info.agencies = [...new Set(indexes.flatMap((g) => [...g.agencies.values()]))];
      rt.info.operatorGroups = [...new Set([...rt.info.operatorGroups, ...detectOperatorGroups(rt.info.agencies)])];
      rt.info.routeCount = indexes.reduce((a, g) => a + g.routes.size, 0);
      rt.info.stopCount = indexes.reduce((a, g) => a + g.stopRoutes.size, 0);
      this.shapeBboxCache.delete(rt.info.id);
      this.rebuildSource(rt); // ré-enrichit les véhicules courants
    }).catch((e) => console.error("[engine] static", rt.info.id, e));
  }

  private queueGeo(rt: SourceRuntime) {
    if (rt.info.geo.basis !== "unknown" || (rt as { geoQueued?: boolean }).geoQueued) return;
    (rt as { geoQueued?: boolean }).geoQueued = true;
    const vs = [...rt.vehicles.values()];
    const lat = vs.map((v) => v.lat).sort((a, b) => a - b)[vs.length >> 1];
    const lon = vs.map((v) => v.lon).sort((a, b) => a - b)[vs.length >> 1];
    resolveGeo(rt.info.id, lat, lon).then((geo) => {
      if (geo) rt.info.geo = geo;
    });
  }

  private maintenance() {
    const now = Date.now();
    for (const rt of this.sources.values()) {
      // Changement de jour : la fenêtre de courses actives doit être recalculée.
      if (rt.indexes.length && rt.staticDate && localDate(now, rt.indexes[0].tz) !== rt.staticDate) {
        rt.info.staticState = "none";
        this.queueStatic(rt);
      }
      // Les véhicules vieillissent même sans nouveau flux.
      const before = rt.vehicles.size;
      for (const [k, v] of rt.vehicles) if (now - v.timestamp > config.dropAfterSec * 1000) rt.vehicles.delete(k);
      this.updateSourceStatus(rt);
      if (rt.vehicles.size !== before) this.emit("source-update", rt.info.id);
    }
    this.history.prune(now);
  }

  // ───────────────────────── Lecture ─────────────────────────

  toMap(v: Vehicle): MapVehicle {
    return {
      k: v.key,
      s: v.sourceId,
      y: Math.round(v.lat * 1e6) / 1e6,
      x: Math.round(v.lon * 1e6) / 1e6,
      b: v.bearing !== undefined ? Math.round(v.bearing) : undefined,
      t: Math.round(v.timestamp / 1000),
      r: v.routeShortName ?? v.routeId,
      c: v.routeColor,
      m: v.mode,
      h: v.headsign,
      l: v.vehicleId ?? v.label,
      d: v.delaySec,
    };
  }

  /**
   * Doublons : les flux "agrégats" (ex. Normandie) republient des véhicules
   * déjà présents dans les flux des réseaux locaux. Un véhicule d'agrégat
   * situé à moins de 30 m d'un véhicule local, à moins de 90 s d'écart,
   * est masqué.
   */
  private localGrid(): Map<string, Vehicle[]> {
    const grid = new Map<string, Vehicle[]>();
    for (const rt of this.sources.values()) {
      if (rt.isAggregate) continue;
      for (const v of rt.vehicles.values()) {
        const key = `${Math.floor(v.lat / 0.0003)}:${Math.floor(v.lon / 0.0004)}`;
        const a = grid.get(key);
        if (a) a.push(v);
        else grid.set(key, [v]);
      }
    }
    return grid;
  }

  private isDuplicate(v: Vehicle, grid: Map<string, Vehicle[]>): boolean {
    const cy = Math.floor(v.lat / 0.0003);
    const cx = Math.floor(v.lon / 0.0004);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        for (const o of grid.get(`${cy + dy}:${cx + dx}`) ?? [])
          if (Math.abs(o.timestamp - v.timestamp) < 90_000 && haversine(o.lat, o.lon, v.lat, v.lon) < 30) return true;
    return false;
  }

  sourceVehicles(id: string): MapVehicle[] {
    const rt = this.sources.get(id);
    if (!rt) return [];
    const vs = [...rt.vehicles.values()];
    if (!rt.isAggregate) return vs.map((v) => this.toMap(v));
    const grid = this.localGrid();
    return vs.filter((v) => !this.isDuplicate(v, grid)).map((v) => this.toMap(v));
  }

  getSnapshot(): MapVehicle[] {
    const grid = this.localGrid();
    const out: MapVehicle[] = [];
    for (const rt of this.sources.values())
      for (const v of rt.vehicles.values()) if (!rt.isAggregate || !this.isDuplicate(v, grid)) out.push(this.toMap(v));
    return out;
  }

  getSources(): SourceInfo[] {
    return [...this.sources.values()].map((r) => r.info);
  }

  getSource(id: string): SourceInfo | undefined {
    return this.sources.get(id)?.info;
  }

  getStats(): Stats {
    const now = Date.now();
    let tracked = 0;
    let live = 0;
    let routes = 0;
    let covered = 0;
    let connected = 0;
    let withPositions = 0;
    const grid = this.localGrid();
    for (const rt of this.sources.values()) {
      if (rt.info.hasRealtimePositions) withPositions++;
      if (rt.info.status === "live" || rt.info.status === "lagging") connected++;
      routes += rt.info.routeCount;
      let srcLive = 0;
      for (const v of rt.vehicles.values()) {
        if (rt.isAggregate && this.isDuplicate(v, grid)) continue;
        tracked++;
        if (now - v.timestamp <= config.liveMaxAgeSec * 1000) {
          live++;
          srcLive++;
        }
      }
      if (srcLive > 0) covered++;
    }
    return {
      vehiclesTracked: tracked,
      vehiclesLive: live,
      sourcesConnected: connected,
      sourcesWithPositions: withPositions,
      sourcesTotal: this.sources.size,
      routesAvailable: routes,
      networksCovered: covered,
      generatedAt: now,
    };
  }

  getVehicle(key: string): VehicleDetail | undefined {
    const sourceId = key.slice(0, key.indexOf(":"));
    const rt = this.sources.get(sourceId);
    const v = rt?.vehicles.get(key);
    if (!rt || !v) return undefined;
    const now = Date.now();
    const l = lookup(rt.indexes, v.tripId, v.routeId);
    const tu = v.tripId ? rt.tripUpdates.get(v.tripId) : undefined;
    const i = rt.info;
    return {
      vehicle: v,
      source: {
        id: i.id,
        title: i.title,
        networkNames: i.networkNames,
        publisher: i.publisher,
        operatorGroups: i.operatorGroups,
        licence: i.licence,
        pageUrl: i.pageUrl,
        status: i.status,
        lastSuccessAt: i.lastSuccessAt,
      },
      ...buildTripStops(l, v, tu, now),
      history: this.history.get(key),
    };
  }

  /** Lignes des sources dont le GTFS est chargé. */
  getRoutes(filter: { sourceId?: string; q?: string; limit?: number } = {}): RouteSummary[] {
    const q = filter.q ? normalize(filter.q) : "";
    const out: RouteSummary[] = [];
    for (const rt of this.sources.values()) {
      if (filter.sourceId && rt.info.id !== filter.sourceId) continue;
      if (!rt.indexes.length) continue;
      const live = new Map<string, number>();
      for (const v of rt.vehicles.values()) if (v.routeId) live.set(v.routeId, (live.get(v.routeId) ?? 0) + 1);
      for (const g of rt.indexes) {
        for (const r of g.routes.values()) {
          if (q) {
            const sn = normalize(r.shortName ?? "");
            const ln = normalize(r.longName ?? "");
            if (!(sn === q || sn.startsWith(q) || ln.includes(q))) continue;
          }
          out.push({
            sourceId: rt.info.id,
            routeId: r.id,
            shortName: r.shortName,
            longName: r.longName,
            color: r.color,
            textColor: r.textColor,
            mode: r.mode,
            agencyName: agencyName(g, r),
            terminals: [...(g.routeHeadsigns.get(r.id) ?? [])].slice(0, 4),
            liveVehicles: live.get(r.id) ?? 0,
          });
        }
      }
    }
    out.sort((a, b) => b.liveVehicles - a.liveVehicles || (a.shortName ?? "").localeCompare(b.shortName ?? "", "fr", { numeric: true }));
    return out.slice(0, filter.limit ?? 200);
  }

  getRouteDetail(sourceId: string, routeId: string) {
    const rt = this.sources.get(sourceId);
    if (!rt) return undefined;
    for (const g of rt.indexes) {
      const r = g.routes.get(routeId);
      if (!r) continue;
      const shapes: [number, number][][] = [];
      for (const sid of g.routeShapes.get(routeId) ?? []) {
        const s = g.shapes.get(sid);
        if (!s) continue;
        const pts: [number, number][] = [];
        for (let i = 0; i < s.length; i += 2) pts.push([s[i], s[i + 1]]);
        shapes.push(pts);
      }
      const stops = new Map<number, StopSummary>();
      for (const [si, routes] of g.stopRoutes) {
        if (!routes.has(routeId)) continue;
        stops.set(si, { sourceId, stopId: g.stopIds[si], name: g.stopNames[si], lat: g.stopLat[si], lon: g.stopLon[si], routes: [] });
      }
      const vehicles = [...rt.vehicles.values()].filter((v) => v.routeId === routeId).map((v) => this.toMap(v));
      return {
        route: this.getRoutes({ sourceId }).find((x) => x.routeId === routeId),
        shapes,
        shapeBasis: shapes.length ? ("shapes.txt" as const) : ("none" as const),
        stops: [...stops.values()],
        vehicles,
      };
    }
    return undefined;
  }

  private shapeBboxCache = new Map<string, { routeId: string; color?: string; name?: string; bbox: number[]; shape: Float32Array }[]>();

  /** Tracés de lignes intersectant une emprise (couche "lignes"). */
  getShapesInBbox(bbox: [number, number, number, number], limit = 400) {
    const features: { sourceId: string; routeId: string; color?: string; name?: string; coords: [number, number][] }[] = [];
    for (const rt of this.sources.values()) {
      if (!rt.indexes.length) continue;
      let cached = this.shapeBboxCache.get(rt.info.id);
      if (!cached) {
        cached = [];
        for (const g of rt.indexes)
          for (const [routeId, sids] of g.routeShapes) {
            const r = g.routes.get(routeId);
            for (const sid of sids) {
              const s = g.shapes.get(sid);
              if (!s) continue;
              let a = 180, b = 90, c = -180, d = -90;
              for (let i = 0; i < s.length; i += 2) {
                a = Math.min(a, s[i]); c = Math.max(c, s[i]);
                b = Math.min(b, s[i + 1]); d = Math.max(d, s[i + 1]);
              }
              cached.push({ routeId, color: r?.color, name: r?.shortName, bbox: [a, b, c, d], shape: s });
            }
          }
        this.shapeBboxCache.set(rt.info.id, cached);
      }
      for (const e of cached) {
        if (e.bbox[0] > bbox[2] || e.bbox[2] < bbox[0] || e.bbox[1] > bbox[3] || e.bbox[3] < bbox[1]) continue;
        const coords: [number, number][] = [];
        const step = e.shape.length > 4000 ? 4 : 2;
        for (let i = 0; i < e.shape.length; i += step) coords.push([e.shape[i], e.shape[i + 1]]);
        features.push({ sourceId: rt.info.id, routeId: e.routeId, color: e.color, name: e.name, coords });
        if (features.length >= limit) return features;
      }
    }
    return features;
  }

  getStopsInBbox(bbox: [number, number, number, number], limit = 3000): StopSummary[] {
    const out: StopSummary[] = [];
    for (const rt of this.sources.values()) {
      for (const g of rt.indexes) {
        for (const [si, routes] of g.stopRoutes) {
          const lat = g.stopLat[si];
          const lon = g.stopLon[si];
          if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
          out.push({
            sourceId: rt.info.id,
            stopId: g.stopIds[si],
            name: g.stopNames[si],
            lat,
            lon,
            routes: [...routes].slice(0, 12).map((rid) => {
              const r = g.routes.get(rid);
              return { routeId: rid, shortName: r?.shortName, color: r?.color };
            }),
          });
          if (out.length >= limit) return out;
        }
      }
    }
    return out;
  }

  searchStops(q: string, limit = 20): StopSummary[] {
    const nq = normalize(q);
    if (nq.length < 2) return [];
    const out: StopSummary[] = [];
    const seen = new Set<string>();
    for (const rt of this.sources.values())
      for (const g of rt.indexes)
        for (const [si, routes] of g.stopRoutes) {
          const name = g.stopNames[si];
          const key = `${rt.info.id}|${name}`;
          if (seen.has(key) || !normalize(name).includes(nq)) continue;
          seen.add(key);
          out.push({
            sourceId: rt.info.id,
            stopId: g.stopIds[si],
            name,
            lat: g.stopLat[si],
            lon: g.stopLon[si],
            routes: [...routes].slice(0, 8).map((rid) => ({ routeId: rid, shortName: g.routes.get(rid)?.shortName, color: g.routes.get(rid)?.color })),
          });
          if (out.length >= limit) return out;
        }
    return out;
  }

  getDepartures(sourceId: string, stopId: string): Departure[] {
    const rt = this.sources.get(sourceId);
    if (!rt) return [];
    return departuresAt(rt.indexes, stopId, rt.tripUpdates, Date.now());
  }

  findVehicles(q: string, limit = 10): Vehicle[] {
    const nq = normalize(q);
    const out: Vehicle[] = [];
    for (const rt of this.sources.values())
      for (const v of rt.vehicles.values()) {
        if (
          (v.label && normalize(v.label) === nq) ||
          (v.vehicleId && normalize(v.vehicleId) === nq) ||
          (v.licensePlate && normalize(v.licensePlate) === nq) ||
          (nq.length >= 3 && v.headsign && normalize(v.headsign).includes(nq))
        ) {
          out.push(v);
          if (out.length >= limit) return out;
        }
      }
    return out;
  }
}

const g = globalThis as unknown as { __busRadarEngine?: Engine; __busRadarStarting?: Promise<Engine> };

/** Singleton partagé entre toutes les routes du process. */
export function getEngine(): Promise<Engine> {
  if (g.__busRadarEngine) return Promise.resolve(g.__busRadarEngine);
  if (!g.__busRadarStarting) {
    const e = new Engine();
    g.__busRadarStarting = e.start().then(() => {
      g.__busRadarEngine = e;
      return e;
    });
  }
  return g.__busRadarStarting;
}
