/**
 * Types partagés client / serveur.
 *
 * Règle d'or : chaque champ optionnel n'est renseigné QUE s'il provient
 * d'une donnée source (flux GTFS-RT, GTFS statique, catalogue national).
 * Aucune valeur n'est inventée ; un champ absent reste `undefined`.
 */

/** Fraîcheur d'une source de données. */
export type SourceStatus =
  | "live" // positions reçues récemment
  | "lagging" // flux joignable mais positions anciennes
  | "offline" // flux injoignable / en erreur
  | "static" // horaires théoriques uniquement (aucun flux de positions)
  | "pending" // pas encore interrogé
  | "disabled"; // connecteur nécessitant une clé non configurée

export type NetworkCategory =
  | "urbain"
  | "interurbain"
  | "regional"
  | "longue_distance"
  | "scolaire"
  | "inconnu";

/** Mode déduit du route_type GTFS (jamais deviné). */
export type VehicleMode =
  | "bus"
  | "coach"
  | "trolleybus"
  | "tram"
  | "metro"
  | "rail"
  | "ferry"
  | "cable"
  | "other"
  | "unknown";

export type FeedKind = "vehicle_positions" | "trip_updates" | "service_alerts";

export interface GeoScope {
  regions: { code: string; name: string }[];
  departements: { code: string; name: string }[];
  communes: string[];
  /** Comment la zone a été déterminée. */
  basis: "catalogue" | "reverse_geocoding" | "unknown";
}

export interface SourceFeed {
  kind: FeedKind[];
  url: string;
  title?: string;
}

/** Une source = un jeu de données du catalogue (ou un connecteur manuel). */
export interface SourceInfo {
  id: string;
  connector: "gtfs-rt" | "siri-lite" | "prim-idfm";
  title: string;
  /** Nom(s) commercial(aux) déclarés au catalogue (offers.nom_commercial). */
  networkNames: string[];
  /** Autorité organisatrice déclarée (offers.nom_aom). */
  authority?: string;
  publisher: string;
  /** Groupes détectés dans les données (agency.txt, éditeur, titre). */
  operatorGroups: string[];
  /** agency_name issus du GTFS statique, si chargé. */
  agencies: string[];
  category: NetworkCategory;
  categoryBasis: "catalogue" | "unknown";
  geo: GeoScope;
  licence: string;
  pageUrl?: string;
  feeds: SourceFeed[];
  hasRealtimePositions: boolean;
  status: SourceStatus;
  statusDetail?: string;
  lastFetchAt?: number;
  lastSuccessAt?: number;
  /** Timestamp de l'en-tête du flux GTFS-RT (ms). */
  lastFeedTimestamp?: number;
  lastError?: string;
  vehicleCount: number;
  liveVehicleCount: number;
  staticState: "none" | "pending" | "loading" | "ready" | "error" | "skipped";
  staticDetail?: string;
  routeCount: number;
  stopCount: number;
  pollIntervalSec: number;
  bbox?: [number, number, number, number];
}

/** Véhicule normalisé, version complète (fiche détail). */
export interface Vehicle {
  key: string;
  sourceId: string;
  vehicleId?: string;
  label?: string;
  licensePlate?: string;
  lat: number;
  lon: number;
  bearing?: number;
  bearingSource?: "feed" | "computed";
  speedKmh?: number;
  /** Horodatage de la position (ms). */
  timestamp: number;
  timestampSource: "vehicle" | "feed_header";
  /** Réception par notre serveur (ms). */
  receivedAt: number;
  tripId?: string;
  routeId?: string;
  directionId?: number;
  startDate?: string;
  startTime?: string;
  stopId?: string;
  currentStatus?: "INCOMING_AT" | "STOPPED_AT" | "IN_TRANSIT_TO";
  currentStopSequence?: number;
  occupancyStatus?: string;
  // Enrichissement GTFS statique
  routeShortName?: string;
  routeLongName?: string;
  routeColor?: string;
  routeTextColor?: string;
  mode: VehicleMode;
  headsign?: string;
  agencyName?: string;
  // Enrichissement TripUpdates
  delaySec?: number;
}

/**
 * Version compacte envoyée en masse vers la carte (SSE / snapshot).
 * Clés courtes pour limiter la bande passante.
 */
export interface MapVehicle {
  k: string; // key
  s: string; // sourceId
  y: number; // lat
  x: number; // lon
  b?: number; // bearing
  t: number; // timestamp (s)
  r?: string; // route short name or route id
  c?: string; // route color (hex sans #)
  m: VehicleMode;
  h?: string; // headsign
  l?: string; // vehicle label / id
  d?: number; // delay (s), issu des TripUpdates
}

export interface StopTimeInfo {
  stopId: string;
  stopName?: string;
  lat?: number;
  lon?: number;
  sequence: number;
  /** Horaire théorique (secondes depuis minuit du jour de service). */
  scheduledSec?: number;
  /** Horaire temps réel (epoch ms), si TripUpdates. */
  realtimeMs?: number;
  delaySec?: number;
  state: "passed" | "current" | "upcoming" | "unknown";
}

export interface VehicleDetail {
  vehicle: Vehicle;
  source: Pick<SourceInfo, "id" | "title" | "networkNames" | "publisher" | "operatorGroups" | "licence" | "pageUrl" | "status" | "lastSuccessAt">;
  /** Arrêts du trajet si le GTFS statique contient la course. */
  stops?: StopTimeInfo[];
  progress?: { passed: number; total: number; basis: "current_stop_sequence" | "stop_id" | "trip_updates" };
  nextStop?: { stopId: string; name?: string; basis: "vehicle_position" | "trip_updates" | "static_sequence" };
  /** Historique réellement enregistré par ce serveur. */
  history: [number, number, number][]; // [lon, lat, ts(ms)]
  shape?: [number, number][];
}

export interface Stats {
  vehiclesTracked: number;
  vehiclesLive: number;
  sourcesConnected: number;
  sourcesWithPositions: number;
  sourcesTotal: number;
  routesAvailable: number;
  networksCovered: number;
  generatedAt: number;
}

export interface RouteSummary {
  sourceId: string;
  routeId: string;
  shortName?: string;
  longName?: string;
  color?: string;
  textColor?: string;
  mode: VehicleMode;
  agencyName?: string;
  terminals: string[];
  liveVehicles: number;
}

export interface StopSummary {
  sourceId: string;
  stopId: string;
  name: string;
  lat: number;
  lon: number;
  routes: { routeId: string; shortName?: string; color?: string }[];
}

export interface Departure {
  routeId: string;
  routeShortName?: string;
  routeColor?: string;
  headsign?: string;
  tripId: string;
  scheduledMs: number;
  realtimeMs?: number;
  /** "realtime" seulement si un TripUpdate a fourni l'horaire. */
  basis: "realtime" | "scheduled";
}

export interface SearchResult {
  type: "city" | "stop" | "route" | "operator" | "vehicle" | "destination";
  id: string;
  label: string;
  sublabel?: string;
  lat?: number;
  lon?: number;
  sourceId?: string;
  bbox?: [number, number, number, number];
}

/** Champs d'une source susceptibles d'évoluer en cours de fonctionnement. */
export type SourcePatch = Pick<
  SourceInfo,
  | "status"
  | "statusDetail"
  | "vehicleCount"
  | "liveVehicleCount"
  | "lastSuccessAt"
  | "lastFeedTimestamp"
  | "lastError"
  | "staticState"
  | "staticDetail"
  | "routeCount"
  | "stopCount"
  | "agencies"
  | "operatorGroups"
  | "bbox"
  | "geo"
>;

/** Messages SSE serveur → client. */
export type StreamEvent =
  | { type: "snapshot"; vehicles: MapVehicle[]; sources: SourceInfo[]; stats: Stats }
  /** Delta par connexion : véhicules nouveaux/modifiés et clés disparues. */
  | { type: "source-delta"; sourceId: string; upserts: MapVehicle[]; removed: string[]; source?: SourcePatch }
  | { type: "sources"; sources: SourceInfo[] }
  | { type: "stats"; stats: Stats };
