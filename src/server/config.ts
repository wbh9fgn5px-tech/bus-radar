/**
 * Configuration serveur. Toutes les clés/secrets restent côté serveur :
 * aucune variable ici n'est préfixée NEXT_PUBLIC_.
 */
import path from "node:path";

function num(name: string, def: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function bool(name: string, def: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return def;
  return v === "1" || v.toLowerCase() === "true";
}

export const config = {
  /** Répertoire de cache disque (catalogue, GTFS zip, géocodage). */
  dataDir: process.env.DATA_DIR || path.join(process.cwd(), ".data"),
  catalogUrl: process.env.CATALOG_URL || "https://transport.data.gouv.fr/api/datasets",
  catalogRefreshHours: num("CATALOG_REFRESH_HOURS", 6),
  userAgent:
    process.env.HTTP_USER_AGENT ||
    "BusRadarFrance/0.1 (+https://github.com/; open-data GTFS-RT aggregator)",

  /** Intervalle d'interrogation par défaut d'un flux GTFS-RT (s). */
  pollIntervalSec: num("POLL_INTERVAL_SEC", 20),
  /** Intervalle minimum autorisé, pour ne pas surcharger les producteurs. */
  minPollIntervalSec: num("MIN_POLL_INTERVAL_SEC", 10),
  maxBackoffSec: num("MAX_BACKOFF_SEC", 600),
  fetchTimeoutMs: num("FETCH_TIMEOUT_MS", 15000),
  fetchConcurrency: num("FETCH_CONCURRENCY", 8),
  maxFeedBytes: num("MAX_FEED_MB", 25) * 1024 * 1024,

  /** Âge max (s) pour considérer une position "en direct". */
  liveMaxAgeSec: num("LIVE_MAX_AGE_SEC", 180),
  /** Âge max (s) au-delà duquel un véhicule n'est plus affiché. */
  dropAfterSec: num("DROP_AFTER_SEC", 900),

  /** GTFS statique */
  loadStatic: bool("LOAD_STATIC_GTFS", true),
  staticMaxZipMb: num("STATIC_MAX_ZIP_MB", 80),
  staticRefreshHours: num("STATIC_REFRESH_HOURS", 24),
  staticConcurrency: num("STATIC_CONCURRENCY", 2),

  /** Historique de positions conservé en mémoire par véhicule. */
  historyPoints: num("HISTORY_POINTS", 60),

  /** Filtre optionnel : ne charger que certaines sources (ids séparés par virgules). */
  onlySources: (process.env.ONLY_SOURCES || "").split(",").map((s) => s.trim()).filter(Boolean),

  geocoderUrl: process.env.GEOCODER_URL || "https://data.geopf.fr/geocodage",

  /** Persistance optionnelle de l'historique (PostgreSQL + PostGIS, voir db/schema.sql). */
  databaseUrl: process.env.DATABASE_URL || "",
};
