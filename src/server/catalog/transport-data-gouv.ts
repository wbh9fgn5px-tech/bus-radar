/**
 * Connecteur catalogue : Point d'Accès National transport.data.gouv.fr.
 *
 * Construit automatiquement la liste des sources à partir du catalogue
 * national (licences, éditeurs, zones couvertes, flux GTFS / GTFS-RT).
 * Le catalogue est mis en cache sur disque pour résister à une indisponibilité.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.ts";
import { fetchJson } from "../http.ts";
import type { FeedKind, GeoScope, NetworkCategory, SourceFeed } from "../../lib/types.ts";
import { DEPARTEMENTS, REGIONS, departementFromCommune, regionOfDepartement } from "../../lib/geo-ref.ts";
import { detectOperatorGroups } from "./operators.ts";

interface PanResource {
  id: number;
  format?: string;
  url: string;
  original_url?: string;
  title?: string;
  features?: string[];
  is_available?: boolean;
  updated?: string;
  type?: string;
}

interface PanDataset {
  id: string;
  datagouv_id: string;
  slug: string;
  title: string;
  type: string;
  sub_types?: string[];
  licence?: string;
  page_url?: string;
  publisher?: { name?: string };
  covered_area?: { type: string; nom: string; insee?: string }[];
  offers?: { nom_commercial?: string; nom_aom?: string; type_transport?: string }[];
  legal_owners?: unknown[];
  resources: PanResource[];
}

/** Description statique d'une source, issue du catalogue. */
export interface SourceDescriptor {
  id: string;
  title: string;
  networkNames: string[];
  authority?: string;
  publisher: string;
  operatorGroups: string[];
  category: NetworkCategory;
  categoryBasis: "catalogue" | "unknown";
  geo: GeoScope;
  licence: string;
  pageUrl?: string;
  feeds: SourceFeed[];
  hasRealtimePositions: boolean;
  hasTripUpdates: boolean;
  staticGtfsUrls: string[];
}

const LICENCES: Record<string, string> = {
  "odc-odbl": "ODbL",
  "fr-lo": "Licence Ouverte",
  lov2: "Licence Ouverte v2.0",
  "mobility-licence": "Licence Mobilités",
  "cc-by": "CC-BY",
  notspecified: "Non précisée",
};

const FEED_KINDS: FeedKind[] = ["vehicle_positions", "trip_updates", "service_alerts"];

function categorize(ds: PanDataset): { category: NetworkCategory; basis: "catalogue" | "unknown" } {
  const sub = new Set(ds.sub_types ?? []);
  const types = new Set((ds.offers ?? []).map((o) => o.type_transport));
  const area = ds.covered_area ?? [];
  if (area.some((a) => a.type === "pays") || /européen|national|longue distance/i.test(ds.title)) {
    return { category: "longue_distance", basis: "catalogue" };
  }
  if (sub.has("urban") || types.has("Transport collectif urbain")) return { category: "urbain", basis: "catalogue" };
  if (types.has("Transport collectif régional")) return { category: "regional", basis: "catalogue" };
  if (sub.has("intercity")) return { category: "interurbain", basis: "catalogue" };
  if (sub.has("school")) return { category: "scolaire", basis: "catalogue" };
  return { category: "inconnu", basis: "unknown" };
}

function geoFromCatalogue(ds: PanDataset): GeoScope {
  const regions = new Map<string, string>();
  const deps = new Map<string, string>();
  const communes: string[] = [];
  for (const a of ds.covered_area ?? []) {
    if (a.type === "region" && a.insee && REGIONS[a.insee]) regions.set(a.insee, REGIONS[a.insee]);
    if (a.type === "departement" && a.insee && DEPARTEMENTS[a.insee]) {
      deps.set(a.insee, DEPARTEMENTS[a.insee][0]);
      const r = regionOfDepartement(a.insee);
      if (r) regions.set(r.code, r.name);
    }
    if (a.type === "commune" && a.insee) {
      communes.push(a.nom);
      const d = departementFromCommune(a.insee);
      if (d) {
        deps.set(d, DEPARTEMENTS[d][0]);
        const r = regionOfDepartement(d);
        if (r) regions.set(r.code, r.name);
      }
    }
    if (a.type === "epci") communes.push(a.nom);
  }
  const known = regions.size > 0 || deps.size > 0;
  return {
    regions: [...regions].map(([code, name]) => ({ code, name })),
    departements: [...deps].map(([code, name]) => ({ code, name })),
    communes,
    basis: known ? "catalogue" : "unknown",
  };
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24)
    .replace(/-$/, "");
}

export function datasetToDescriptor(ds: PanDataset): SourceDescriptor | null {
  if (ds.type !== "public-transit") return null;
  const rt = ds.resources.filter((r) => (r.format || "").toLowerCase() === "gtfs-rt");
  const feeds: SourceFeed[] = [];
  const seen = new Set<string>();
  for (const r of rt) {
    // L'URL `url` du PAN pointe souvent vers le proxy transport.data.gouv.fr,
    // conçu pour mutualiser les appels et protéger les producteurs.
    const url = r.url || r.original_url;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const kinds = (r.features ?? []).filter((f): f is FeedKind => FEED_KINDS.includes(f as FeedKind));
    feeds.push({ url, kind: kinds, title: r.title });
  }
  const gtfs = ds.resources
    .filter((r) => r.format === "GTFS" && r.is_available !== false)
    .sort((a, b) => (b.updated || "").localeCompare(a.updated || ""))
    .slice(0, 3)
    .map((r) => r.url);
  if (feeds.length === 0 && gtfs.length === 0) return null;

  const networkNames = [...new Set((ds.offers ?? []).map((o) => o.nom_commercial).filter(Boolean) as string[])];
  const authority = (ds.offers ?? []).find((o) => o.nom_aom)?.nom_aom;
  const publisher = ds.publisher?.name || "Éditeur non précisé";
  const { category, basis } = categorize(ds);
  // Un flux sans "features" déclarées est sondé : on ne sait pas d'avance ce qu'il contient.
  const hasRealtimePositions = feeds.some((f) => f.kind.includes("vehicle_positions") || f.kind.length === 0);
  return {
    id: `pan-${slugify(ds.slug || ds.title)}-${ds.id.slice(-6)}`,
    title: ds.title,
    networkNames,
    authority,
    publisher,
    operatorGroups: detectOperatorGroups([ds.title, publisher, authority, ...networkNames]),
    category,
    categoryBasis: basis,
    geo: geoFromCatalogue(ds),
    licence: LICENCES[ds.licence || ""] || ds.licence || "Non précisée",
    pageUrl: ds.page_url,
    feeds,
    hasRealtimePositions,
    hasTripUpdates: feeds.some((f) => f.kind.includes("trip_updates")),
    staticGtfsUrls: gtfs,
  };
}

const cacheFile = () => path.join(config.dataDir, "catalog.json");

/**
 * Charge le catalogue national. En cas d'échec réseau, retombe sur la
 * dernière copie disque (et le signale dans `fromCache`).
 */
export async function loadCatalog(): Promise<{ sources: SourceDescriptor[]; fetchedAt: number; fromCache: boolean }> {
  let raw: PanDataset[] | undefined;
  let fetchedAt = Date.now();
  let fromCache = false;
  try {
    const stat = await fs.stat(cacheFile()).catch(() => null);
    if (stat && Date.now() - stat.mtimeMs < config.catalogRefreshHours * 3600_000) {
      raw = JSON.parse(await fs.readFile(cacheFile(), "utf8"));
      fetchedAt = stat.mtimeMs;
      fromCache = true;
    }
  } catch {
    raw = undefined;
  }
  if (!raw) {
    try {
      raw = await fetchJson<PanDataset[]>(config.catalogUrl, 60000);
      await fs.mkdir(config.dataDir, { recursive: true });
      await fs.writeFile(cacheFile(), JSON.stringify(raw));
    } catch (e) {
      const stale = await fs.readFile(cacheFile(), "utf8").catch(() => null);
      if (!stale) throw new Error(`Catalogue national indisponible : ${(e as Error).message}`);
      raw = JSON.parse(stale);
      fromCache = true;
      fetchedAt = (await fs.stat(cacheFile())).mtimeMs;
    }
  }
  const sources = (raw ?? []).map(datasetToDescriptor).filter((s): s is SourceDescriptor => s !== null);
  // Garde d'unicité des identifiants (deux slugs tronqués identiques).
  const seen = new Map<string, number>();
  for (const s of sources) {
    const n = seen.get(s.id) ?? 0;
    seen.set(s.id, n + 1);
    if (n > 0) s.id = `${s.id}-${n}`;
  }
  return { sources, fetchedAt, fromCache };
}
