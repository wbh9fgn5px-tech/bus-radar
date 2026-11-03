"use client";
/**
 * Store client : état temps réel (alimenté par SSE) + état d'interface.
 *
 * Les véhicules vivent hors de React (Map mutable) ; la carte s'abonne
 * aux changements fins, les listes React à un signal limité à ~1/s.
 */
import { useSyncExternalStore } from "react";
import type { MapVehicle, NetworkCategory, SourceInfo, Stats, StreamEvent, VehicleMode } from "@/lib/types";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
export const LIVE_MAX_AGE_SEC = 180;

export type ConnectionState = "connecting" | "open" | "reconnecting";

export interface Filters {
  /** null = toutes les sources */
  sources: Set<string> | null;
  groups: Set<string>;
  category: NetworkCategory | null;
  region: string | null;
  departement: string | null;
  /** Tram, métro, train, bateau… (hors bus/car) */
  otherModes: boolean;
  /** Véhicules dont le mode n'est pas connu (GTFS statique absent ou non rapproché) */
  unknownMode: boolean;
}

export interface Layers {
  vehicles: boolean;
  lines: boolean;
  stops: boolean;
}

export type MapCommand =
  | { type: "fly"; lon: number; lat: number; zoom?: number }
  | { type: "fit"; bbox: [number, number, number, number] }
  | { type: "france" }
  | { type: "zoom"; delta: number }
  | { type: "locate" };

export type PanelTab = "vehicles" | "operators" | "lines" | "stops";

const BUS_MODES: VehicleMode[] = ["bus", "coach", "trolleybus"];

type Listener = () => void;

class RadarStore {
  vehicles = new Map<string, MapVehicle>();
  sources = new Map<string, SourceInfo>();
  stats: Stats | null = null;
  connection: ConnectionState = "connecting";
  lastMessageAt = 0;

  selectedKey: string | null = null;
  follow = false;
  selectedRoute: { sourceId: string; routeId: string } | null = null;
  selectedStop: { sourceId: string; stopId: string; name: string } | null = null;
  tab: PanelTab = "vehicles";
  panelOpen = true;
  bounds: [number, number, number, number] | null = null;
  zoom = 5;
  filters: Filters = {
    sources: null,
    groups: new Set(),
    category: null,
    region: null,
    departement: null,
    otherModes: false,
    unknownMode: true,
  };
  layers: Layers = { vehicles: true, lines: false, stops: false };
  /** Ligne mise en évidence sur la carte (onglet Lignes). */
  highlight: { shapes: [number, number][][]; color?: string } | null = null;

  private allowed: Set<string> | null = null;
  private uiListeners = new Set<Listener>();
  private vehicleListeners = new Set<(changed: Set<string> | "all") => void>();
  private commandListeners = new Set<(c: MapCommand) => void>();
  private uiVersion = 0;
  private uiTimer: ReturnType<typeof setTimeout> | null = null;
  private es: EventSource | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  // ───────── abonnements ─────────
  subscribeUi = (l: Listener) => {
    this.uiListeners.add(l);
    return () => this.uiListeners.delete(l);
  };
  getUiVersion = () => this.uiVersion;
  onVehicles(l: (changed: Set<string> | "all") => void) {
    this.vehicleListeners.add(l);
    return () => this.vehicleListeners.delete(l);
  }
  onCommand(l: (c: MapCommand) => void) {
    this.commandListeners.add(l);
    return () => this.commandListeners.delete(l);
  }
  command(c: MapCommand) {
    this.commandListeners.forEach((l) => l(c));
  }

  /** Notification immédiate (interaction utilisateur). */
  notify() {
    if (this.uiTimer) {
      clearTimeout(this.uiTimer);
      this.uiTimer = null;
    }
    this.uiVersion++;
    this.uiListeners.forEach((l) => l());
  }
  /** Notification groupée (flux de données). */
  private notifySoon() {
    if (this.uiTimer) return;
    this.uiTimer = setTimeout(() => {
      this.uiTimer = null;
      this.uiVersion++;
      this.uiListeners.forEach((l) => l());
    }, 1000);
  }
  private emitVehicles(changed: Set<string> | "all") {
    this.vehicleListeners.forEach((l) => l(changed));
  }

  // ───────── connexion temps réel ─────────
  connect() {
    if (this.es) return;
    this.open();
    this.watchdog = setInterval(() => {
      // Le serveur envoie des statistiques toutes les 5 s : 40 s de silence = connexion morte.
      if (this.lastMessageAt && Date.now() - this.lastMessageAt > 40_000) {
        this.es?.close();
        this.es = null;
        this.connection = "reconnecting";
        this.notify();
        this.open();
      }
    }, 10_000);
  }

  disconnect() {
    this.es?.close();
    this.es = null;
    if (this.watchdog) clearInterval(this.watchdog);
  }

  private open() {
    const es = new EventSource(`${API_BASE}/api/stream`);
    this.es = es;
    es.onopen = () => {
      this.connection = "open";
      this.notify();
    };
    es.onerror = () => {
      // EventSource se reconnecte seul (directive retry du serveur).
      this.connection = "reconnecting";
      this.notify();
    };
    es.onmessage = (m) => {
      this.lastMessageAt = Date.now();
      try {
        this.handle(JSON.parse(m.data) as StreamEvent);
      } catch (e) {
        console.warn("Message SSE invalide", e);
      }
    };
  }

  private handle(ev: StreamEvent) {
    if (this.connection !== "open") {
      this.connection = "open";
      this.notifySoon();
    }
    switch (ev.type) {
      case "snapshot": {
        this.vehicles = new Map(ev.vehicles.map((v) => [v.k, v]));
        this.sources = new Map(ev.sources.map((s) => [s.id, s]));
        this.stats = ev.stats;
        this.recomputeAllowed();
        this.emitVehicles("all");
        this.notify();
        break;
      }
      case "source-delta": {
        const prevSource = this.sources.get(ev.sourceId);
        if (ev.source && prevSource) this.sources.set(ev.sourceId, { ...prevSource, ...ev.source });
        const changed = new Set<string>();
        for (const k of ev.removed) if (this.vehicles.delete(k)) changed.add(k);
        for (const v of ev.upserts) {
          this.vehicles.set(v.k, v);
          changed.add(v.k);
        }
        if (this.selectedKey && !this.vehicles.has(this.selectedKey)) this.follow = false;
        if (changed.size) this.emitVehicles(changed);
        this.notifySoon();
        break;
      }
      case "sources":
        this.sources = new Map(ev.sources.map((s) => [s.id, s]));
        this.recomputeAllowed();
        this.emitVehicles("all");
        this.notifySoon();
        break;
      case "stats":
        this.stats = ev.stats;
        this.notifySoon();
        break;
    }
  }

  // ───────── filtres ─────────
  private recomputeAllowed() {
    const f = this.filters;
    const restricted = f.sources || f.groups.size || f.category || f.region || f.departement;
    if (!restricted) {
      this.allowed = null;
      return;
    }
    const out = new Set<string>();
    for (const s of this.sources.values()) if (this.sourceMatchesScope(s) && (!f.sources || f.sources.has(s.id))) out.add(s.id);
    this.allowed = out;
  }

  /** Filtres géographiques / catégorie / groupe (hors sélection manuelle). */
  sourceMatchesScope(s: SourceInfo): boolean {
    const f = this.filters;
    if (f.groups.size && !s.operatorGroups.some((g) => f.groups.has(g))) return false;
    if (f.category && s.category !== f.category) return false;
    if (f.region && !s.geo.regions.some((r) => r.code === f.region)) return false;
    if (f.departement && !s.geo.departements.some((d) => d.code === f.departement)) return false;
    return true;
  }

  isSourceAllowed(id: string) {
    return !this.allowed || this.allowed.has(id);
  }

  isVisible(v: MapVehicle): boolean {
    if (!this.isSourceAllowed(v.s)) return false;
    if (v.m === "unknown") return this.filters.unknownMode;
    if (BUS_MODES.includes(v.m)) return true;
    return this.filters.otherModes;
  }

  setFilters(patch: Partial<Filters>) {
    this.filters = { ...this.filters, ...patch };
    this.recomputeAllowed();
    this.emitVehicles("all");
    this.notify();
  }

  toggleSource(id: string) {
    const all = [...this.sources.values()].filter((s) => s.hasRealtimePositions).map((s) => s.id);
    const cur = new Set(this.filters.sources ?? all);
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    this.setFilters({ sources: cur.size === all.length ? null : cur });
  }

  // ───────── sélection ─────────
  select(key: string | null, opts: { fly?: boolean } = {}) {
    this.selectedKey = key;
    if (!key) this.follow = false;
    const v = key ? this.vehicles.get(key) : undefined;
    if (v && opts.fly) this.command({ type: "fly", lon: v.x, lat: v.y, zoom: Math.max(this.zoom, 15) });
    this.emitVehicles("all");
    this.notify();
  }

  setFollow(on: boolean) {
    this.follow = on;
    const v = this.selectedKey ? this.vehicles.get(this.selectedKey) : undefined;
    if (on && v) this.command({ type: "fly", lon: v.x, lat: v.y, zoom: Math.max(this.zoom, 15) });
    this.notify();
  }

  set<K extends "tab" | "panelOpen" | "selectedRoute" | "selectedStop">(k: K, v: RadarStore[K]) {
    (this as RadarStore)[k] = v;
    this.notify();
  }

  setHighlight(h: RadarStore["highlight"]) {
    this.highlight = h;
    this.notify();
  }

  /** Zones de la carte masquées par les panneaux (px). */
  insets = { top: 0, right: 0, bottom: 0, left: 0 };
  setInsets(i: RadarStore["insets"]) {
    const c = this.insets;
    if (c.top === i.top && c.right === i.right && c.bottom === i.bottom && c.left === i.left) return;
    this.insets = i;
    this.notify();
  }

  setLayers(patch: Partial<Layers>) {
    this.layers = { ...this.layers, ...patch };
    this.notify();
  }

  setViewport(bounds: [number, number, number, number], zoom: number) {
    this.bounds = bounds;
    this.zoom = zoom;
    this.notifySoon();
  }

  visibleInViewport(limit = 300): MapVehicle[] {
    const b = this.bounds;
    const out: MapVehicle[] = [];
    for (const v of this.vehicles.values()) {
      if (!this.isVisible(v)) continue;
      if (b && (v.x < b[0] || v.x > b[2] || v.y < b[1] || v.y > b[3])) continue;
      out.push(v);
      if (out.length >= limit) break;
    }
    return out;
  }
}

export const store = new RadarStore();

/** Ré-rendu React à chaque changement d'état d'interface. */
export function useRadar<T>(selector: (s: RadarStore) => T): T {
  useSyncExternalStore(store.subscribeUi, store.getUiVersion, store.getUiVersion);
  return selector(store);
}

export function ageSec(v: { t: number }, now = Date.now()) {
  return Math.max(0, Math.round(now / 1000 - v.t));
}
