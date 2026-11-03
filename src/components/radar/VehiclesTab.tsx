"use client";
import { useMemo, useState } from "react";
import { Bus, Search, ZoomIn } from "lucide-react";
import { LIVE_MAX_AGE_SEC, ageSec, store, useRadar } from "@/lib/client/store";
import { relTime } from "@/lib/client/format";
import { normalizeText } from "@/lib/client/text";
import { useNow } from "@/lib/client/use-now";
import { Empty, RouteBadge, StatusDot } from "./bits";
import { cn } from "@/lib/utils";

const MAX_ROWS = 150;

export function VehiclesTab() {
  const [q, setQ] = useState("");
  const { list, zoom, selected, sources, total } = useRadar((s) => ({
    list: s.visibleInViewport(5000),
    zoom: s.zoom,
    selected: s.selectedKey,
    sources: s.sources,
    total: s.vehicles.size,
  }));
  const now = useNow();
  const rows = useMemo(() => {
    const nq = normalizeText(q);
    const f = nq
      ? list.filter((v) => normalizeText(`${v.r ?? ""} ${v.h ?? ""} ${v.l ?? ""} ${sources.get(v.s)?.networkNames[0] ?? ""}`).includes(nq))
      : list;
    return f.sort((a, b) => Number(!a.r) - Number(!b.r) || (a.r ?? "").localeCompare(b.r ?? "", "fr", { numeric: true }) || b.t - a.t);
  }, [list, q, sources]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-2">
        <div className="flex h-9 items-center gap-2 rounded-xl bg-surface-2 px-3">
          <Search className="size-3.5 text-fg-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filtrer : ligne, destination, n° de parc"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-subtle"
          />
        </div>
        <p className="mt-2 px-1 text-xs text-fg-muted">
          <span className="font-semibold text-fg tabular-nums">{rows.length}</span> véhicule{rows.length > 1 ? "s" : ""} dans la vue
          {zoom < 9 && " · zoomez sur une ville pour une liste détaillée"}
        </p>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {total === 0 ? (
          <Empty icon={<Bus />} title="En attente des premiers flux">
            Les positions apparaissent dès que les flux GTFS-RT ont répondu.
          </Empty>
        ) : rows.length === 0 ? (
          <Empty icon={<ZoomIn />} title="Aucun véhicule dans cette zone">
            Aucun flux temps réel ne couvre cette zone, ou vos filtres les masquent. Déplacez la carte ou élargissez les filtres.
          </Empty>
        ) : (
          rows.slice(0, MAX_ROWS).map((v) => {
            const src = sources.get(v.s);
            const stale = ageSec(v, now) > LIVE_MAX_AGE_SEC;
            return (
              <button
                key={v.k}
                onClick={() => store.select(v.k, { fly: true })}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-surface-2",
                  selected === v.k && "bg-electric/10 ring-1 ring-electric/30 dark:bg-turquoise/10 dark:ring-turquoise/30",
                )}
              >
                <div className="flex w-12 shrink-0 justify-center">
                  {v.r ? <RouteBadge name={v.r} color={v.c} /> : <span className="text-[10px] text-fg-subtle">sans ligne</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{v.h ? `→ ${v.h}` : <span className="text-fg-muted">Destination non fournie</span>}</p>
                  <p className="truncate text-xs text-fg-muted">
                    {src?.networkNames[0] ?? src?.title ?? v.s}
                    {v.l && ` · n° ${v.l}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusDot status={stale ? "lagging" : "live"} />
                  <span className="text-[10px] tabular-nums text-fg-subtle">{relTime(v.t * 1000, now).replace("il y a ", "")}</span>
                </div>
              </button>
            );
          })
        )}
        {rows.length > MAX_ROWS && (
          <p className="px-3 py-3 text-center text-xs text-fg-muted">+ {rows.length - MAX_ROWS} autres — zoomez ou filtrez pour affiner</p>
        )}
      </div>
    </div>
  );
}
