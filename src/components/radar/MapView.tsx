"use client";
/**
 * Carte radar MapLibre.
 *
 *  - Zoom < 11 : source GeoJSON "clusterisée" avec tous les véhicules filtrés.
 *  - Zoom ≥ 11 : source non clusterisée limitée à la vue, avec icônes orientées
 *    et interpolation visuelle ENTRE deux positions réellement reçues
 *    (jamais d'extrapolation au-delà de la dernière position).
 */
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Map as MlMap, Marker, setWorkerUrl, type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import { API_BASE, LIVE_MAX_AGE_SEC, ageSec, store } from "@/lib/client/store";
import { drawVehicleIcon, iconName } from "@/lib/client/icons";
import { FRANCE_BOUNDS } from "@/lib/geo-ref";
import type { MapVehicle, VehicleDetail } from "@/lib/types";

const STYLE_LIGHT = process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT || "https://tiles.openfreemap.org/styles/positron";
const STYLE_DARK = process.env.NEXT_PUBLIC_MAP_STYLE_DARK || "https://tiles.openfreemap.org/styles/dark";
const DETAIL_ZOOM = 11;
const ANIM_MS = 2200;
const MAX_LIVE_FEATURES = 4000;

type Anim = { fx: number; fy: number; tx: number; ty: number; fb?: number; tb?: number; start: number };
const empty: FeatureCollection = { type: "FeatureCollection", features: [] };

setWorkerUrl("/maplibre-gl-worker.mjs");

const isDark = () => document.documentElement.classList.contains("dark");

function lerpAngle(a: number, b: number, t: number) {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

export function MapView({ detail }: { detail: VehicleDetail | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const detailRef = useRef<VehicleDetail | null>(null);
  const applyDetailRef = useRef<() => void>(() => {});
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const map = new MlMap({
      container,
      style: isDark() ? STYLE_DARK : STYLE_LIGHT,
      bounds: FRANCE_BOUNDS,
      fitBoundsOptions: { padding: 40 },
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      maxZoom: 19,
      minZoom: 3,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    if (process.env.NODE_ENV !== "production") (window as unknown as { __map?: MlMap }).__map = map; // inspection en dev

    // Icônes générées à la demande pour chaque couleur de ligne.
    map.setMissingStyleImageResolver((id) => {
      if (!id.startsWith("v|")) return;
      const img = drawVehicleIcon(id);
      if (img && !map.hasImage(id)) map.addImage(id, img, { pixelRatio: 2 });
    });

    // ───────── état d'animation ─────────
    const displayed = new Map<string, { x: number; y: number; b?: number }>();
    const anims = new Map<string, Anim>();
    let liveKeys = new Set<string>();
    let raf = 0;
    let clusterTimer: ReturnType<typeof setTimeout> | null = null;
    let ready = false;

    const vehicleFeature = (v: MapVehicle, pos: { x: number; y: number; b?: number }, now: number): Feature<Point> => {
      const stale = ageSec(v, now) > LIVE_MAX_AGE_SEC;
      const hasB = pos.b !== undefined;
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [pos.x, pos.y] },
        properties: {
          k: v.k,
          r: v.r ?? "",
          b: hasB ? pos.b : 0,
          icon: iconName(v.c, hasB, stale),
          stale: stale ? 1 : 0,
          sel: v.k === store.selectedKey ? 1 : 0,
          c: v.c ? `#${v.c}` : "#3478F6",
        },
      };
    };

    const computeLiveKeys = () => {
      const next = new Set<string>();
      if (map.getZoom() >= DETAIL_ZOOM - 0.5 && store.layers.vehicles) {
        const b = map.getBounds();
        const padX = (b.getEast() - b.getWest()) * 0.25;
        const padY = (b.getNorth() - b.getSouth()) * 0.25;
        const w = b.getWest() - padX, e = b.getEast() + padX, s = b.getSouth() - padY, n = b.getNorth() + padY;
        for (const v of store.vehicles.values()) {
          if (v.x < w || v.x > e || v.y < s || v.y > n || !store.isVisible(v)) continue;
          next.add(v.k);
          if (next.size >= MAX_LIVE_FEATURES) break;
        }
      }
      liveKeys = next;
    };

    const renderLive = () => {
      const src = map.getSource<GeoJSONSource>("vehicles-live");
      if (!src) return;
      const now = Date.now();
      const features: Feature<Point>[] = [];
      let animating = false;
      for (const k of liveKeys) {
        const v = store.vehicles.get(k);
        if (!v) continue;
        let pos = displayed.get(k) ?? { x: v.x, y: v.y, b: v.b };
        const a = anims.get(k);
        if (a) {
          const t = Math.min(1, (now - a.start) / ANIM_MS);
          const e = 1 - Math.pow(1 - t, 3);
          pos = {
            x: a.fx + (a.tx - a.fx) * e,
            y: a.fy + (a.ty - a.fy) * e,
            b: a.tb === undefined ? undefined : a.fb === undefined ? a.tb : lerpAngle(a.fb, a.tb, e),
          };
          if (t >= 1) anims.delete(k);
          else animating = true;
        }
        displayed.set(k, pos);
        features.push(vehicleFeature(v, pos, now));
      }
      src.setData({ type: "FeatureCollection", features });
      // Suivi du véhicule sélectionné.
      if (store.follow && store.selectedKey) {
        const p = displayed.get(store.selectedKey);
        if (p && !map.isMoving()) map.jumpTo({ center: [p.x, p.y] });
      }
      if (store.selectedKey) {
        const p = displayed.get(store.selectedKey) ?? (() => {
          const v = store.vehicles.get(store.selectedKey!);
          return v ? { x: v.x, y: v.y } : undefined;
        })();
        map.getSource<GeoJSONSource>("selected")?.setData(
          p ? { type: "Feature", geometry: { type: "Point", coordinates: [p.x, p.y] }, properties: {} } : empty,
        );
      }
      raf = animating ? requestAnimationFrame(renderLive) : 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(renderLive);
    };

    const renderClusters = () => {
      clusterTimer = null;
      const src = map.getSource<GeoJSONSource>("vehicles-cluster");
      if (!src) return;
      const now = Date.now();
      const features: Feature<Point>[] = [];
      if (store.layers.vehicles)
        for (const v of store.vehicles.values()) {
          if (!store.isVisible(v)) continue;
          features.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [v.x, v.y] },
            properties: { k: v.k, c: v.c ? `#${v.c}` : "#3478F6", stale: ageSec(v, now) > LIVE_MAX_AGE_SEC ? 1 : 0 },
          });
        }
      src.setData({ type: "FeatureCollection", features });
    };
    const scheduleClusters = (delay = 1500) => {
      if (!clusterTimer) clusterTimer = setTimeout(renderClusters, delay);
    };

    const onVehicles = (changed: Set<string> | "all") => {
      if (!ready) return;
      const now = Date.now();
      if (changed === "all") {
        computeLiveKeys();
        if (clusterTimer) clearTimeout(clusterTimer);
        clusterTimer = null;
        renderClusters();
      } else {
        for (const k of changed) {
          const v = store.vehicles.get(k);
          if (!v) {
            displayed.delete(k);
            anims.delete(k);
            liveKeys.delete(k);
            continue;
          }
          if (!liveKeys.has(k)) continue;
          const cur = displayed.get(k);
          if (cur) {
            // Saut > 2 km : pas d'animation (changement de course, recalage GPS).
            const far = Math.abs(cur.x - v.x) > 0.03 || Math.abs(cur.y - v.y) > 0.02;
            if (!far && (cur.x !== v.x || cur.y !== v.y || cur.b !== v.b))
              anims.set(k, { fx: cur.x, fy: cur.y, tx: v.x, ty: v.y, fb: cur.b, tb: v.b, start: now });
            else displayed.set(k, { x: v.x, y: v.y, b: v.b });
          }
        }
        scheduleClusters();
      }
      kick();
    };

    // ───────── couches ─────────
    const addLayers = () => {
      const dark = isDark();
      const halo = dark ? "#101827" : "#ffffff";
      map.addSource("lines", { type: "geojson", data: empty });
      map.addLayer({
        id: "lines",
        type: "line",
        source: "lines",
        minzoom: 10,
        layout: { "line-cap": "round", "line-join": "round", visibility: store.layers.lines ? "visible" : "none" },
        paint: { "line-color": ["coalesce", ["get", "color"], "#3478F6"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 16, 3.5], "line-opacity": 0.55 },
      });
      map.addSource("route-highlight", { type: "geojson", data: empty });
      map.addLayer({
        id: "route-highlight-casing",
        type: "line",
        source: "route-highlight",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": halo, "line-width": 8 },
      });
      map.addLayer({
        id: "route-highlight",
        type: "line",
        source: "route-highlight",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 4.5 },
      });
      map.addSource("selected-trip", { type: "geojson", data: empty });
      map.addLayer({
        id: "selected-trip-casing",
        type: "line",
        source: "selected-trip",
        filter: ["==", ["get", "kind"], "shape"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": halo, "line-width": 7, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "selected-trip",
        type: "line",
        source: "selected-trip",
        filter: ["==", ["get", "kind"], "shape"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 4 },
      });
      map.addLayer({
        id: "selected-history",
        type: "line",
        source: "selected-trip",
        filter: ["==", ["get", "kind"], "history"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#29C7C9", "line-width": 3, "line-dasharray": [1, 1.5] },
      });
      map.addLayer({
        id: "selected-stops",
        type: "circle",
        source: "selected-trip",
        filter: ["==", ["get", "kind"], "stop"],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2.5, 16, 5],
          "circle-color": ["case", ["==", ["get", "passed"], 1], dark ? "#22324d" : "#E8EDF4", halo],
          "circle-stroke-color": ["get", "color"],
          "circle-stroke-width": 2,
        },
      });

      map.addSource("stops", { type: "geojson", data: empty });
      map.addLayer({
        id: "stops",
        type: "circle",
        source: "stops",
        minzoom: 14,
        layout: { visibility: store.layers.stops ? "visible" : "none" },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 3, 18, 6],
          "circle-color": halo,
          "circle-stroke-color": dark ? "#a3afc2" : "#5b6678",
          "circle-stroke-width": 1.5,
        },
      });
      map.addLayer({
        id: "stops-label",
        type: "symbol",
        source: "stops",
        minzoom: 16,
        layout: {
          visibility: store.layers.stops ? "visible" : "none",
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: { "text-color": dark ? "#a3afc2" : "#5b6678", "text-halo-color": halo, "text-halo-width": 1.5 },
      });

      map.addSource("vehicles-cluster", { type: "geojson", data: empty, cluster: true, clusterMaxZoom: DETAIL_ZOOM - 1, clusterRadius: 46 });
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "vehicles-cluster",
        maxzoom: DETAIL_ZOOM,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": dark ? "#172A46" : "#ffffff",
          "circle-stroke-color": ["step", ["get", "point_count"], "#29C7C9", 50, "#3478F6", 250, "#20B879"],
          "circle-stroke-width": 2.5,
          "circle-radius": ["step", ["get", "point_count"], 13, 20, 16, 100, 20, 400, 25],
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "vehicles-cluster",
        maxzoom: DETAIL_ZOOM,
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-allow-overlap": true },
        paint: { "text-color": dark ? "#F7F9FC" : "#101827" },
      });
      map.addLayer({
        id: "vehicle-dots",
        type: "circle",
        source: "vehicles-cluster",
        maxzoom: DETAIL_ZOOM,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 3, 10, 5],
          "circle-color": ["case", ["==", ["get", "stale"], 1], "#8A94A6", ["get", "c"]],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.2,
        },
      });

      map.addSource("selected", { type: "geojson", data: empty });
      map.addLayer({
        id: "selected-halo",
        type: "circle",
        source: "selected",
        paint: { "circle-radius": 20, "circle-color": "#29C7C9", "circle-opacity": 0.18, "circle-stroke-color": "#29C7C9", "circle-stroke-width": 2 },
      });

      map.addSource("vehicles-live", { type: "geojson", data: empty });
      map.addLayer({
        id: "vehicles",
        type: "symbol",
        source: "vehicles-live",
        minzoom: DETAIL_ZOOM,
        layout: {
          "icon-image": ["get", "icon"],
          "icon-rotate": ["get", "b"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-size": ["interpolate", ["linear"], ["zoom"], DETAIL_ZOOM, 0.6, 14, 0.85, 17, 1.05],
          "symbol-sort-key": ["get", "sel"],
        },
      });
      map.addLayer({
        id: "vehicle-labels",
        type: "symbol",
        source: "vehicles-live",
        minzoom: 13,
        layout: {
          "text-field": ["get", "r"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 11,
          "text-offset": [1.35, 0],
          "text-anchor": "left",
          "text-optional": true,
        },
        paint: { "text-color": dark ? "#F7F9FC" : "#101827", "text-halo-color": halo, "text-halo-width": 1.6 },
      });
    };

    const onStyle = () => {
      addLayers();
      ready = true;
      onVehicles("all");
      applyDetailRef.current();
      applyHighlight();
      refreshAux();
    };
    map.on("style.load", onStyle);
    map.once("idle", () => setMapReady(true));

    // ───────── données auxiliaires (lignes / arrêts) ─────────
    let auxAbort: AbortController | null = null;
    const refreshAux = async () => {
      if (!ready) return;
      auxAbort?.abort();
      auxAbort = new AbortController();
      const b = map.getBounds();
      const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((x) => x.toFixed(4)).join(",");
      const z = map.getZoom();
      try {
        if (store.layers.lines && z >= 10) {
          const r = await fetch(`${API_BASE}/api/shapes?bbox=${bbox}`, { signal: auxAbort.signal });
          if (r.ok) map.getSource<GeoJSONSource>("lines")?.setData(await r.json());
        }
        if (store.layers.stops && z >= 14) {
          const r = await fetch(`${API_BASE}/api/stops?bbox=${bbox}`, { signal: auxAbort.signal });
          if (r.ok) {
            const { stops } = (await r.json()) as { stops: { sourceId: string; stopId: string; name: string; lat: number; lon: number }[] };
            map.getSource<GeoJSONSource>("stops")?.setData({
              type: "FeatureCollection",
              features: stops.map((s) => ({
                type: "Feature",
                geometry: { type: "Point", coordinates: [s.lon, s.lat] },
                properties: { sourceId: s.sourceId, stopId: s.stopId, name: s.name },
              })),
            });
          }
        }
      } catch {
        /* requête annulée ou réseau indisponible : la couche reste en l'état */
      }
    };

    // ───────── interactions ─────────
    let auxTimer: ReturnType<typeof setTimeout> | null = null;
    map.on("moveend", () => {
      const b = map.getBounds();
      store.setViewport([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], map.getZoom());
      computeLiveKeys();
      kick();
      if (auxTimer) clearTimeout(auxTimer);
      auxTimer = setTimeout(refreshAux, 250);
    });
    map.on("dragstart", () => {
      if (store.follow) store.setFollow(false);
    });

    const pick = (e: MapLayerMouseEvent) => e.features?.[0]?.properties as Record<string, unknown> | undefined;
    map.on("click", "vehicles", (e) => {
      const p = pick(e);
      if (p?.k) store.select(String(p.k));
    });
    map.on("click", "vehicle-dots", (e) => {
      const p = pick(e);
      if (!p?.k) return;
      store.select(String(p.k), { fly: true });
    });
    map.on("click", "clusters", async (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const zoom = await map.getSource<GeoJSONSource>("vehicles-cluster")!.getClusterExpansionZoom(f.properties!.cluster_id);
      map.easeTo({ center: (f.geometry as Point).coordinates as [number, number], zoom: Math.min(zoom + 0.5, 16) });
    });
    map.on("click", "stops", (e) => {
      const p = pick(e);
      if (!p) return;
      store.selectedStop = { sourceId: String(p.sourceId), stopId: String(p.stopId), name: String(p.name) };
      store.tab = "stops";
      store.panelOpen = true;
      store.notify();
    });
    map.on("click", (e) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: ["vehicles", "vehicle-dots", "clusters", "stops"].filter((l) => map.getLayer(l)) });
      if (!hits.length && store.selectedKey) store.select(null);
    });
    for (const l of ["vehicles", "vehicle-dots", "clusters", "stops"]) {
      map.on("mouseenter", l, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", l, () => (map.getCanvas().style.cursor = ""));
    }

    // ───────── commandes ─────────
    let userMarker: Marker | null = null;
    const offCommand = store.onCommand((c) => {
      if (c.type === "fly") map.flyTo({ center: [c.lon, c.lat], zoom: c.zoom ?? Math.max(map.getZoom(), 13), speed: 1.6 });
      if (c.type === "fit") map.fitBounds([[c.bbox[0], c.bbox[1]], [c.bbox[2], c.bbox[3]]], { padding: 60, maxZoom: 14 });
      if (c.type === "zoom") map.easeTo({ zoom: map.getZoom() + c.delta, duration: 250 });
      if (c.type === "france") map.fitBounds(FRANCE_BOUNDS, { padding: 40 });
      if (c.type === "locate") {
        navigator.geolocation?.getCurrentPosition(
          (pos) => {
            const ll: [number, number] = [pos.coords.longitude, pos.coords.latitude];
            if (!userMarker) {
              const el = document.createElement("div");
              el.className = "size-4 rounded-full bg-electric border-2 border-white shadow-float animate-pulse-ring";
              userMarker = new Marker({ element: el });
            }
            userMarker.setLngLat(ll).addTo(map);
            map.flyTo({ center: ll, zoom: 14 });
          },
          () => alert("Position indisponible : autorisez la géolocalisation dans votre navigateur."),
          { enableHighAccuracy: true, timeout: 10000 },
        );
      }
    });
    const offVehicles = store.onVehicles(onVehicles);

    // Couches activables + rafraîchissement de l'état "ancien" des positions.
    let lastInsets = store.insets;
    map.setPadding(lastInsets);
    let lastLayers = store.layers;
    let lastHighlight: typeof store.highlight = null;
    const applyHighlight = () => {
      lastHighlight = store.highlight;
      const h = store.highlight;
      map.getSource<GeoJSONSource>("route-highlight")?.setData(
        h
          ? {
              type: "FeatureCollection",
              features: h.shapes.map((c) => ({ type: "Feature", geometry: { type: "LineString", coordinates: c }, properties: { color: h.color ? `#${h.color}` : "#3478F6" } })),
            }
          : empty,
      );
    };
    const offUi = store.subscribeUi(() => {
      if (store.highlight !== lastHighlight && ready) applyHighlight();
      if (store.insets !== lastInsets) {
        lastInsets = store.insets;
        map.easeTo({ padding: lastInsets, duration: 300 });
      }
      if (store.layers !== lastLayers && ready) {
        const L = store.layers;
        if (L.lines !== lastLayers.lines) map.setLayoutProperty("lines", "visibility", L.lines ? "visible" : "none");
        if (L.stops !== lastLayers.stops) {
          map.setLayoutProperty("stops", "visibility", L.stops ? "visible" : "none");
          map.setLayoutProperty("stops-label", "visibility", L.stops ? "visible" : "none");
        }
        const vehiclesChanged = L.vehicles !== lastLayers.vehicles;
        lastLayers = L;
        if (vehiclesChanged) onVehicles("all");
        refreshAux();
      }
    });
    const staleTimer = setInterval(() => {
      if (!ready) return;
      renderClusters();
      kick();
    }, 15000);

    // Changement de thème : nouveau fond de carte, couches recréées.
    // (on ignore les mutations sans changement réel, ex. hydratation React de <html>)
    let appliedDark = isDark();
    const observer = new MutationObserver(() => {
      if (isDark() === appliedDark) return;
      appliedDark = isDark();
      ready = false;
      map.setStyle(appliedDark ? STYLE_DARK : STYLE_LIGHT);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container);

    applyDetailRef.current = () => {
      const d = detailRef.current;
      const src = map.getSource<GeoJSONSource>("selected-trip");
      if (!src) return;
      if (!d) {
        src.setData(empty);
        map.getSource<GeoJSONSource>("selected")?.setData(empty);
        return;
      }
      const color = d.vehicle.routeColor ? `#${d.vehicle.routeColor}` : "#3478F6";
      const features: Feature[] = [];
      if (d.shape?.length) features.push({ type: "Feature", geometry: { type: "LineString", coordinates: d.shape } as LineString, properties: { kind: "shape", color } });
      if (d.history.length > 1)
        features.push({ type: "Feature", geometry: { type: "LineString", coordinates: d.history.map((h) => [h[0], h[1]]) }, properties: { kind: "history" } });
      for (const s of d.stops ?? [])
        if (s.lat !== undefined && s.lon !== undefined)
          features.push({ type: "Feature", geometry: { type: "Point", coordinates: [s.lon, s.lat] }, properties: { kind: "stop", color, passed: s.state === "passed" ? 1 : 0 } });
      src.setData({ type: "FeatureCollection", features });
      kick();
    };

    return () => {
      cancelAnimationFrame(raf);
      if (clusterTimer) clearTimeout(clusterTimer);
      clearInterval(staleTimer);
      offCommand();
      offVehicles();
      offUi();
      observer.disconnect();
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    detailRef.current = detail;
    applyDetailRef.current();
  }, [detail]);

  // Conteneur positionné séparé : la CSS de MapLibre impose position:relative à .maplibregl-map.
  return (
    <div className="absolute inset-0">
      <div ref={ref} className="h-full w-full" aria-label="Carte des véhicules en temps réel" role="application" />
      {!mapReady && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="glass flex items-center gap-2 rounded-full border border-line px-3.5 py-2 text-xs font-medium text-fg-muted shadow-float">
            <Loader2 className="size-3.5 animate-spin" /> Chargement du fond de carte…
          </span>
        </div>
      )}
    </div>
  );
}
