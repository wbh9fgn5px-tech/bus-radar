"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Route as RouteIcon, Search } from "lucide-react";
import { API_BASE, store, useRadar } from "@/lib/client/store";
import { MODE_LABEL, nf } from "@/lib/client/format";
import { Empty, RouteBadge } from "./bits";
import type { MapVehicle, RouteSummary, StopSummary } from "@/lib/types";

interface RouteDetail {
  route?: RouteSummary;
  shapes: [number, number][][];
  shapeBasis: "shapes.txt" | "none";
  stops: StopSummary[];
  vehicles: MapVehicle[];
}

function useJson<T>(url: string | null, deps: unknown[] = []) {
  const reqKey = url ? `${url}#${JSON.stringify(deps)}` : null;
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null; done: boolean } | null>(null);
  useEffect(() => {
    if (!url || !reqKey) return;
    const ctrl = new AbortController();
    fetch(url, { signal: ctrl.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setState({ key: reqKey, data: j, error: null, done: true });
      })
      .catch((e) => e.name !== "AbortError" && setState((p) => ({ key: reqKey, data: p?.data ?? null, error: e.message, done: true })));
    return () => ctrl.abort();
  }, [url, reqKey]);
  // Les données précédentes restent affichées pendant le rechargement.
  return { data: state?.data ?? null, loading: !!reqKey && state?.key !== reqKey, error: state?.key === reqKey ? state.error : null };
}
export { useJson };

function RouteView({ sourceId, routeId }: { sourceId: string; routeId: string }) {
  const { data, loading, error } = useJson<RouteDetail>(`${API_BASE}/api/routes/${encodeURIComponent(sourceId)}/${encodeURIComponent(routeId)}`);
  const source = useRadar((s) => s.sources.get(sourceId));
  const live = useRadar((s) => [...s.vehicles.values()].filter((v) => v.s === sourceId && data?.vehicles.some((x) => x.k === v.k)));

  useEffect(() => {
    if (!data) return;
    store.setHighlight({ shapes: data.shapes, color: data.route?.color });
    const pts = data.shapes.flat().concat(data.stops.map((s) => [s.lon, s.lat] as [number, number]));
    if (pts.length) {
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      store.command({ type: "fit", bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
    }
    return () => store.setHighlight(null);
  }, [data]);

  const r = data?.route;
  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-3">
        <button onClick={() => store.set("selectedRoute", null)} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg">
          <ArrowLeft className="size-3.5" /> Toutes les lignes
        </button>
        {loading && !data && <Loader2 className="size-4 animate-spin text-fg-subtle" />}
        {error && <p className="text-sm text-danger">{error}</p>}
        {r && (
          <div className="flex items-start gap-3">
            <RouteBadge name={r.shortName ?? r.routeId} color={r.color} textColor={r.textColor} className="h-8 min-w-10 rounded-lg text-sm" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">{r.longName ?? `Ligne ${r.shortName ?? r.routeId}`}</p>
              <p className="text-xs text-fg-muted">
                {source?.networkNames[0] ?? source?.title} · {MODE_LABEL[r.mode]}
                {r.agencyName && ` · ${r.agencyName}`}
              </p>
            </div>
          </div>
        )}
      </div>
      {data && (
        <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-3">
          {r && r.terminals.length > 0 && (
            <section>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Terminus (GTFS)</h4>
              <div className="flex flex-wrap gap-1.5">
                {r.terminals.map((t) => (
                  <span key={t} className="rounded-lg bg-surface-2 px-2 py-1 text-xs text-fg">→ {t}</span>
                ))}
              </div>
            </section>
          )}
          <section>
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              En circulation maintenant · {live.length}
            </h4>
            {live.length === 0 ? (
              <p className="text-xs text-fg-muted">Aucun véhicule de cette ligne dans le dernier flux temps réel.</p>
            ) : (
              live.map((v) => (
                <button key={v.k} onClick={() => store.select(v.k, { fly: true })} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2">
                  <span className="size-1.5 rounded-full bg-live" />
                  <span className="truncate">{v.h ? `→ ${v.h}` : "Destination non fournie"}</span>
                  {v.l && <span className="ml-auto text-xs text-fg-subtle">n° {v.l}</span>}
                </button>
              ))
            )}
          </section>
          <section>
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              Tracé · {data.shapeBasis === "shapes.txt" ? `${data.shapes.length} variante(s) (shapes.txt)` : "non publié par le réseau"}
            </h4>
            <h4 className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Arrêts desservis · {data.stops.length}</h4>
            <div className="columns-2 gap-3 text-xs text-fg-muted">
              {data.stops
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name, "fr"))
                .map((s) => (
                  <button
                    key={s.stopId}
                    className="block w-full truncate py-0.5 text-left hover:text-fg"
                    onClick={() => {
                      store.selectedStop = { sourceId, stopId: s.stopId, name: s.name };
                      store.set("tab", "stops");
                      store.command({ type: "fly", lon: s.lon, lat: s.lat, zoom: 16.5 });
                    }}
                  >
                    {s.name}
                  </button>
                ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export function LinesTab() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const selected = useRadar((s) => s.selectedRoute);
  const sources = useRadar((s) => s.sources);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const { data, loading } = useJson<{ routes: RouteSummary[] }>(
    selected ? null : `${API_BASE}/api/routes?limit=150${debounced ? `&q=${encodeURIComponent(debounced)}` : ""}`,
  );

  if (selected) return <RouteView key={`${selected.sourceId}|${selected.routeId}`} {...selected} />;
  const routes = data?.routes ?? [];
  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-2">
        <div className="flex h-9 items-center gap-2 rounded-xl bg-surface-2 px-3">
          {loading ? <Loader2 className="size-3.5 animate-spin text-fg-subtle" /> : <Search className="size-3.5 text-fg-subtle" />}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Numéro ou nom de ligne"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-subtle"
          />
        </div>
        <p className="mt-2 px-1 text-xs text-fg-muted">
          {debounced ? `${routes.length} ligne(s) trouvée(s)` : "Lignes les plus actives en ce moment"} · issues des GTFS chargés
        </p>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {!loading && routes.length === 0 && (
          <Empty icon={<RouteIcon />} title="Aucune ligne">
            Les lignes proviennent des horaires GTFS des réseaux qui publient aussi des positions temps réel.
          </Empty>
        )}
        {routes.map((r) => {
          const src = sources.get(r.sourceId);
          return (
            <button
              key={`${r.sourceId}|${r.routeId}`}
              onClick={() => store.set("selectedRoute", { sourceId: r.sourceId, routeId: r.routeId })}
              className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-surface-2"
            >
              <div className="flex w-12 shrink-0 justify-center">
                <RouteBadge name={r.shortName ?? r.routeId} color={r.color} textColor={r.textColor} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{r.longName || r.terminals.join(" ↔ ") || `Ligne ${r.shortName ?? r.routeId}`}</p>
                <p className="truncate text-xs text-fg-muted">
                  {src?.networkNames[0] ?? src?.title} · {MODE_LABEL[r.mode]}
                </p>
              </div>
              {r.liveVehicles > 0 && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-live/10 px-2 py-0.5 text-[11px] font-semibold text-live">
                  <span className="size-1.5 rounded-full bg-live" />
                  {nf.format(r.liveVehicles)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
