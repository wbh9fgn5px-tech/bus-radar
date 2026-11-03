"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, Clock, Loader2, Radio, Search, Signpost } from "lucide-react";
import { API_BASE, store, useRadar } from "@/lib/client/store";
import { clock } from "@/lib/client/format";
import { Empty, RouteBadge } from "./bits";
import { useJson } from "./LinesTab";
import type { Departure, StopSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/client/use-now";

function StopView({ sourceId, stopId, name }: { sourceId: string; stopId: string; name: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const { data, loading, error } = useJson<{ generatedAt: number; departures: Departure[]; source: { title: string } }>(
    `${API_BASE}/api/stops/${encodeURIComponent(sourceId)}/${encodeURIComponent(stopId)}`,
    [tick],
  );
  const source = useRadar((s) => s.sources.get(sourceId));
  const now = useNow();
  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-3">
        <button onClick={() => store.set("selectedStop", null)} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg">
          <ArrowLeft className="size-3.5" /> Rechercher un arrêt
        </button>
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg-muted">
            <Signpost className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg">{name}</p>
            <p className="text-xs text-fg-muted">{source?.networkNames[0] ?? source?.title}</p>
          </div>
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Prochains passages (2 h)</h4>
          {loading && <Loader2 className="size-3.5 animate-spin text-fg-subtle" />}
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        {data && data.departures.length === 0 && (
          <p className="text-xs text-fg-muted">Aucun passage prévu dans les deux prochaines heures selon les données publiées.</p>
        )}
        <div className="space-y-1">
          {data?.departures.map((d) => {
            const t = d.realtimeMs ?? d.scheduledMs;
            const mins = Math.round((t - now) / 60000);
            const delta = d.realtimeMs ? Math.round((d.realtimeMs - d.scheduledMs) / 60000) : 0;
            return (
              <div key={`${d.tripId}-${d.scheduledMs}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">
                <div className="flex w-11 shrink-0 justify-center">
                  <RouteBadge name={d.routeShortName ?? d.routeId} color={d.routeColor} />
                </div>
                <p className="min-w-0 flex-1 truncate text-sm text-fg">{d.headsign ? `→ ${d.headsign}` : "Destination non fournie"}</p>
                <div className="shrink-0 text-right">
                  <p className={cn("flex items-center justify-end gap-1 text-sm font-semibold tabular-nums", d.basis === "realtime" ? "text-live" : "text-fg")}>
                    {d.basis === "realtime" && <Radio className="size-3" />}
                    {mins <= 0 ? "Imminent" : mins < 60 ? `${mins} min` : clock(t)}
                  </p>
                  <p className="text-[10px] text-fg-subtle">
                    {d.basis === "realtime"
                      ? `temps réel${delta ? ` · ${delta > 0 ? "+" : ""}${delta} min` : ""}`
                      : `théorique · ${clock(d.scheduledMs)}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-fg-subtle">
          <Clock className="mt-0.5 size-3 shrink-0" />
          « Temps réel » : horaire issu du flux TripUpdates du réseau. « Théorique » : horaire du GTFS, sans information de circulation.
        </p>
      </div>
    </div>
  );
}

export function StopsTab() {
  const selected = useRadar((s) => s.selectedStop);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 220);
    return () => clearTimeout(t);
  }, [q]);
  const sources = useRadar((s) => s.sources);
  const { data, loading } = useJson<{ stops: StopSummary[] }>(
    !selected && debounced.length >= 2 ? `${API_BASE}/api/stops?q=${encodeURIComponent(debounced)}` : null,
  );
  if (selected) return <StopView key={`${selected.sourceId}|${selected.stopId}`} {...selected} />;
  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-2">
        <div className="flex h-9 items-center gap-2 rounded-xl bg-surface-2 px-3">
          {loading ? <Loader2 className="size-3.5 animate-spin text-fg-subtle" /> : <Search className="size-3.5 text-fg-subtle" />}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nom de l'arrêt"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-subtle"
          />
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {debounced.length < 2 ? (
          <Empty icon={<Signpost />} title="Rechercher un arrêt">
            Tapez un nom d’arrêt, ou activez la couche « Arrêts » et cliquez sur un arrêt de la carte (zoom rapproché).
          </Empty>
        ) : (
          (data?.stops ?? []).map((s) => {
            const src = sources.get(s.sourceId);
            return (
              <button
                key={`${s.sourceId}|${s.stopId}`}
                onClick={() => {
                  store.set("selectedStop", { sourceId: s.sourceId, stopId: s.stopId, name: s.name });
                  if (!store.layers.stops) store.setLayers({ stops: true });
                  store.command({ type: "fly", lon: s.lon, lat: s.lat, zoom: 16.5 });
                }}
                className="flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-surface-2"
              >
                <Signpost className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{s.name}</p>
                  <p className="truncate text-xs text-fg-muted">{src?.networkNames[0] ?? src?.title}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.routes.map((r) => (
                      <RouteBadge key={r.routeId} name={r.shortName ?? r.routeId} color={r.color} className="h-4 min-w-5 px-1 text-[10px]" />
                    ))}
                  </div>
                </div>
              </button>
            );
          })
        )}
        {data && data.stops.length === 0 && <p className="px-3 py-6 text-center text-sm text-fg-muted">Aucun arrêt trouvé.</p>}
      </div>
    </div>
  );
}
