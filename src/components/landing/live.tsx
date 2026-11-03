"use client";
/**
 * Îlots temps réel de la page d'accueil. Toutes les valeurs affichées
 * proviennent de l'API (aucun chiffre ni point décoratif inventé).
 */
import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/client/store";
import { nf, relTime } from "@/lib/client/format";
import { useNow } from "@/lib/client/use-now";
import type { MapVehicle, SourceInfo, Stats } from "@/lib/types";
import { cn } from "@/lib/utils";

function usePoll<T>(path: string, everyMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`${API_BASE}${path}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((j) => {
          if (!alive) return;
          setData(j);
          setError(false);
        })
        .catch(() => alive && setError(true));
    load();
    const t = setInterval(load, everyMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [path, everyMs]);
  return { data, error };
}

/* ───────────── Statistiques ───────────── */

export function LiveStats({ className }: { className?: string }) {
  const { data, error } = usePoll<Stats>("/api/stats", 10_000);
  const items: [number | undefined, string, string][] = [
    [data?.vehiclesLive, "véhicules en direct", "Positions GPS de moins de 3 minutes"],
    [data?.networksCovered, "réseaux couverts", "Réseaux avec au moins un véhicule en direct"],
    [data?.sourcesWithPositions, "flux de positions", "Flux GTFS-RT de positions référencés"],
    [data?.routesAvailable, "lignes", "Lignes issues des horaires GTFS chargés"],
  ];
  return (
    <div className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4", className)}>
      {items.map(([v, label, hint], i) => (
        <div key={label} className="bg-surface-solid px-5 py-4" title={hint}>
          <p className="flex items-center gap-2 text-2xl font-semibold tabular-nums tracking-tight text-fg sm:text-3xl">
            {i === 0 && <span className="size-2 rounded-full bg-live animate-pulse-ring" />}
            {v === undefined ? <span className="text-fg-subtle">{error ? "—" : "···"}</span> : nf.format(v)}
          </p>
          <p className="mt-1 text-xs text-fg-muted">{label}</p>
        </div>
      ))}
    </div>
  );
}

/* ───────────── Aperçu : positions réelles sur la France ───────────── */

const LON0 = -5.2;
const LON1 = 9.7;
const LAT0 = 41.3;
const LAT1 = 51.15;
const K = Math.cos((46.2 * Math.PI) / 180);
const W = 1000;
const H = Math.round(((LAT1 - LAT0) / ((LON1 - LON0) * K)) * W);
const px = (lon: number) => ((lon - LON0) * K * W) / ((LON1 - LON0) * K);
const py = (lat: number) => ((LAT1 - lat) / (LAT1 - LAT0)) * H;

// Repères géographiques (positions de villes), pas des données de transport.
const CITIES: [string, number, number][] = [
  ["Paris", 2.35, 48.86],
  ["Lyon", 4.84, 45.76],
  ["Marseille", 5.37, 43.3],
  ["Bordeaux", -0.58, 44.84],
  ["Lille", 3.06, 50.63],
  ["Toulouse", 1.44, 43.6],
  ["Nantes", -1.55, 47.22],
  ["Strasbourg", 7.75, 48.58],
  ["Rennes", -1.68, 48.11],
  ["Nice", 7.26, 43.7],
  ["Montpellier", 3.88, 43.61],
  ["Brest", -4.49, 48.39],
];

export function LivePreview() {
  const { data, error } = usePoll<{ generatedAt: number; vehicles: MapVehicle[] }>("/api/vehicles", 20_000);
  const now = useNow();
  const dots = (data?.vehicles ?? []).filter((v) => v.x >= LON0 && v.x <= LON1 && v.y >= LAT0 && v.y <= LAT1);
  return (
    <figure className="relative">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-surface-solid shadow-pop">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgb(52_120_246/0.10),transparent_65%)] dark:bg-[radial-gradient(circle_at_50%_45%,rgb(41_199_201/0.12),transparent_65%)]" />
        {/* Balayage radar : purement décoratif */}
        <div className="pointer-events-none absolute left-1/2 top-[45%] aspect-square w-[140%] -translate-x-1/2 -translate-y-1/2 animate-[spin_8s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_300deg,rgb(41_199_201/0.18)_360deg)] motion-reduce:hidden" />
        <svg viewBox={`0 0 ${W} ${H}`} className="relative block h-auto w-full" role="img" aria-label={`Carte de France avec ${dots.length} véhicules positionnés en temps réel`}>
          {[0.2, 0.4, 0.6, 0.8].map((r) => (
            <circle key={r} cx={W / 2} cy={H * 0.45} r={W * r * 0.62} fill="none" className="stroke-line" strokeWidth={1} />
          ))}
          {CITIES.map(([name, lon, lat]) => (
            <g key={name} className="fill-fg-subtle">
              <circle cx={px(lon)} cy={py(lat)} r={2.5} />
              <text x={px(lon) + 8} y={py(lat) + 4} fontSize={18} className="fill-fg-subtle font-medium">
                {name}
              </text>
            </g>
          ))}
          {dots.map((v) => (
            <circle key={v.k} cx={px(v.x)} cy={py(v.y)} r={5.5} fill={v.c ? `#${v.c}` : "#3478F6"} fillOpacity={0.9} stroke="white" strokeWidth={1.2} />
          ))}
        </svg>
        <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg backdrop-blur">
          <span className="size-2 rounded-full bg-live animate-pulse-ring" />
          {data ? `${nf.format(dots.length)} positions réelles` : error ? "Données indisponibles" : "Connexion aux flux…"}
        </div>
        {data && (
          <div className="absolute bottom-4 right-4 rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] text-fg-muted backdrop-blur">
            Mis à jour {relTime(data.generatedAt, now)}
          </div>
        )}
      </div>
      <figcaption className="mt-3 px-1 text-xs leading-relaxed text-fg-subtle">
        Chaque point est un véhicule réellement positionné en ce moment, coloré selon sa ligne. Les zones vides correspondent à des
        réseaux qui ne publient pas (encore) la position de leurs véhicules.
      </figcaption>
    </figure>
  );
}

/* ───────────── Réseaux en direct ───────────── */

export function LiveNetworks() {
  const { data } = usePoll<{ sources: SourceInfo[] }>("/api/sources", 30_000);
  const live = (data?.sources ?? [])
    .filter((s) => s.status === "live" && s.liveVehicleCount > 0)
    .sort((a, b) => b.liveVehicleCount - a.liveVehicleCount);
  if (!data) return <div className="h-28 animate-pulse rounded-2xl bg-surface-2" />;
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {live.slice(0, 36).map((s) => (
          <span key={s.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-solid px-3 py-1.5 text-sm text-fg">
            <span className="size-1.5 rounded-full bg-live" />
            {s.networkNames[0] ?? s.title.replace(/^Réseau (urbain|interurbain)( et \w+)? /i, "")}
            <span className="tabular-nums text-fg-subtle">{nf.format(s.liveVehicleCount)}</span>
          </span>
        ))}
        {live.length > 36 && (
          <span className="inline-flex items-center rounded-full px-3 py-1.5 text-sm text-fg-muted">+ {live.length - 36} autres réseaux</span>
        )}
      </div>
      {live.length === 0 && <p className="text-sm text-fg-muted">Aucun véhicule en circulation signalé pour le moment (la nuit, la plupart des réseaux sont à l’arrêt).</p>}
    </div>
  );
}
