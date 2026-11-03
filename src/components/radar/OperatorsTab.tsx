"use client";
import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Focus, Search, SlidersHorizontal } from "lucide-react";
import { store, useRadar } from "@/lib/client/store";
import { CATEGORY_LABEL, STATUS_META, nf, relTime } from "@/lib/client/format";
import { normalizeText } from "@/lib/client/text";
import { useNow } from "@/lib/client/use-now";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { StatusPill } from "./bits";
import type { NetworkCategory, SourceInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

const selectCls =
  "h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface-solid px-2 text-xs text-fg outline-none focus:ring-2 focus:ring-electric/30";

function SourceRow({ s, checked }: { s: SourceInfo; checked: boolean }) {
  const [open, setOpen] = useState(false);
  const now = useNow();
  const name = s.networkNames[0] ?? s.title.replace(/^Réseau (urbain|interurbain)( et \w+)? /i, "");
  const place = s.geo.departements.map((d) => d.name).join(", ") || s.geo.regions.map((r) => r.name).join(", ") || s.geo.communes[0];
  return (
    <div className={cn("rounded-xl transition-colors", open && "bg-surface-2")}>
      <div className="flex items-center gap-3 px-2.5 py-2">
        <Checkbox checked={checked} onCheckedChange={() => store.toggleSource(s.id)} aria-label={`Afficher ${name}`} />
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)}>
          <p className="truncate text-sm font-medium text-fg">{name}</p>
          <p className="truncate text-xs text-fg-muted">
            {[place, s.operatorGroups.join(" · ")].filter(Boolean).join(" — ") || s.publisher}
          </p>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusPill status={s.status}>{s.status === "live" ? nf.format(s.liveVehicleCount) : undefined}</StatusPill>
          <span className="text-[10px] text-fg-subtle">{relTime(s.lastSuccessAt, now)}</span>
        </div>
      </div>
      {open && (
        <div className="space-y-2 px-3 pb-3 pl-10 text-xs text-fg-muted animate-fade-in">
          <p>
            <span className="font-medium text-fg">{STATUS_META[s.status].label}</span>
            {s.statusDetail && ` — ${s.statusDetail}`}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-fg-subtle">Éditeur</dt>
            <dd className="truncate">{s.publisher}</dd>
            {s.authority && (
              <>
                <dt className="text-fg-subtle">AOM</dt>
                <dd className="truncate">{s.authority}</dd>
              </>
            )}
            {s.agencies.length > 0 && (
              <>
                <dt className="text-fg-subtle">Exploitant(s) GTFS</dt>
                <dd className="truncate" title={s.agencies.join(", ")}>{s.agencies.join(", ")}</dd>
              </>
            )}
            <dt className="text-fg-subtle">Catégorie</dt>
            <dd>{CATEGORY_LABEL[s.category]}</dd>
            <dt className="text-fg-subtle">Véhicules</dt>
            <dd>
              {nf.format(s.liveVehicleCount)} en direct / {nf.format(s.vehicleCount)} suivis
            </dd>
            <dt className="text-fg-subtle">Horaires</dt>
            <dd>
              {s.staticState === "ready"
                ? `${nf.format(s.routeCount)} lignes, ${nf.format(s.stopCount)} arrêts`
                : s.staticState === "loading" || s.staticState === "pending"
                  ? "Import GTFS en cours…"
                  : (s.staticDetail ?? "Non chargés")}
            </dd>
            <dt className="text-fg-subtle">Flux</dt>
            <dd>{s.feeds.length} GTFS-RT · interrogé toutes les {s.pollIntervalSec} s</dd>
            <dt className="text-fg-subtle">Licence</dt>
            <dd>{s.licence}</dd>
          </dl>
          <div className="flex gap-2 pt-1">
            {s.bbox && (
              <Button size="sm" variant="secondary" onClick={() => store.command({ type: "fit", bbox: s.bbox! })}>
                <Focus /> Voir sur la carte
              </Button>
            )}
            {s.pageUrl && (
              <a href={s.pageUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-electric hover:bg-surface-solid dark:text-turquoise">
                <ExternalLink className="size-3.5" /> Jeu de données
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function OperatorsTab() {
  const [q, setQ] = useState("");
  const [showStatic, setShowStatic] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const { sources, filters } = useRadar((s) => ({ sources: [...s.sources.values()], filters: s.filters }));

  const realtime = sources.filter((s) => s.hasRealtimePositions);
  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of realtime) if (s.liveVehicleCount > 0) for (const g of s.operatorGroups) m.set(g, (m.get(g) ?? 0) + s.liveVehicleCount);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [realtime]);
  const regions = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of realtime) for (const r of s.geo.regions) m.set(r.code, r.name);
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  }, [realtime]);
  const deps = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of realtime)
      if (!filters.region || s.geo.regions.some((r) => r.code === filters.region)) for (const d of s.geo.departements) m.set(d.code, d.name);
    return [...m].sort((a, b) => a[0].localeCompare(b[0], "fr", { numeric: true }));
  }, [realtime, filters.region]);
  const categories = useMemo(() => [...new Set(realtime.map((s) => s.category))], [realtime]);

  const nq = normalizeText(q);
  const matchQ = (s: SourceInfo) =>
    !nq ||
    [s.title, s.publisher, s.authority, ...s.networkNames, ...s.agencies, ...s.operatorGroups, ...s.geo.communes, ...s.geo.departements.map((d) => d.name)].some(
      (t) => t && normalizeText(t).includes(nq),
    );
  const order: Record<string, number> = { live: 0, lagging: 1, pending: 2, offline: 3 };
  const list = realtime
    .filter((s) => matchQ(s) && store.sourceMatchesScope(s))
    .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || b.liveVehicleCount - a.liveVehicleCount);
  const statics = sources.filter((s) => !s.hasRealtimePositions && matchQ(s));
  const inScope = realtime.filter((s) => store.sourceMatchesScope(s));
  const selectedCount = filters.sources ? inScope.filter((s) => filters.sources!.has(s.id)).length : inScope.length;
  const activeFilterCount = [filters.category, filters.region, filters.departement].filter(Boolean).length + filters.groups.size;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 px-3 pb-2">
        <div className="flex gap-2">
          <div className="flex h-9 flex-1 items-center gap-2 rounded-xl bg-surface-2 px-3">
            <Search className="size-3.5 text-fg-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Réseau, exploitant, ville…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-subtle"
            />
          </div>
          <Button variant="secondary" size="icon" onClick={() => setShowFilters((v) => !v)} aria-label="Filtres" className="relative">
            <SlidersHorizontal />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-electric text-[9px] font-bold text-white">{activeFilterCount}</span>
            )}
          </Button>
        </div>

        {groups.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {groups.map(([g, n]) => {
              const on = filters.groups.has(g);
              return (
                <button
                  key={g}
                  onClick={() => {
                    const next = new Set(filters.groups);
                    if (on) next.delete(g);
                    else next.add(g);
                    store.setFilters({ groups: next });
                  }}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    on ? "border-electric bg-electric text-white" : "border-line text-fg-muted hover:text-fg",
                  )}
                  title="Groupe détecté dans les données du réseau (éditeur, nom d'exploitant GTFS)"
                >
                  {g} <span className={cn("tabular-nums", on ? "text-white/80" : "text-fg-subtle")}>{nf.format(n)}</span>
                </button>
              );
            })}
          </div>
        )}

        {showFilters && (
          <div className="space-y-2 rounded-xl border border-line p-2.5 animate-fade-in">
            <div className="flex gap-2">
              <select
                className={selectCls}
                value={filters.category ?? ""}
                onChange={(e) => store.setFilters({ category: (e.target.value || null) as NetworkCategory | null })}
                aria-label="Catégorie"
              >
                <option value="">Toutes catégories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <select
                className={selectCls}
                value={filters.region ?? ""}
                onChange={(e) => store.setFilters({ region: e.target.value || null, departement: null })}
                aria-label="Région"
              >
                <option value="">Toutes régions</option>
                {regions.map(([c, n]) => (
                  <option key={c} value={c}>{n}</option>
                ))}
              </select>
              <select
                className={selectCls}
                value={filters.departement ?? ""}
                onChange={(e) => store.setFilters({ departement: e.target.value || null })}
                aria-label="Département"
              >
                <option value="">Tous départements</option>
                {deps.map(([c, n]) => (
                  <option key={c} value={c}>{c} · {n}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              <Checkbox checked={filters.otherModes} onCheckedChange={(v) => store.setFilters({ otherModes: v === true })} />
              Afficher aussi tram, métro, train et bateau
            </label>
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              <Checkbox checked={filters.unknownMode} onCheckedChange={(v) => store.setFilters({ unknownMode: v === true })} />
              Véhicules au mode non précisé par la source
            </label>
            <p className="text-[11px] leading-relaxed text-fg-subtle">
              Zones et catégories issues du catalogue transport.data.gouv.fr (ou du géocodage IGN de la position des véhicules, si la zone n’est pas déclarée).
            </p>
            {activeFilterCount > 0 && (
              <Button size="sm" variant="ghost" onClick={() => store.setFilters({ category: null, region: null, departement: null, groups: new Set() })}>
                Réinitialiser les filtres
              </Button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-fg-muted">
            <span className="font-semibold tabular-nums text-fg">{selectedCount}</span> / {inScope.length} flux de positions affichés
          </p>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => store.setFilters({ sources: null })}>Tout</Button>
            <Button size="sm" variant="ghost" onClick={() => store.setFilters({ sources: new Set() })}>Aucun</Button>
          </div>
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {list.map((s) => (
          <SourceRow key={s.id} s={s} checked={!filters.sources || filters.sources.has(s.id)} />
        ))}
        {list.length === 0 && <p className="px-3 py-6 text-center text-sm text-fg-muted">Aucun réseau temps réel ne correspond.</p>}

        <button
          onClick={() => setShowStatic((v) => !v)}
          className="mt-3 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-medium text-fg-muted hover:bg-surface-2"
        >
          <span>Réseaux sans positions temps réel ({statics.length})</span>
          <ChevronDown className={cn("size-4 transition-transform", showStatic && "rotate-180")} />
        </button>
        {showStatic && (
          <div className="animate-fade-in">
            <p className="px-3 pb-2 text-[11px] leading-relaxed text-fg-subtle">
              Ces réseaux publient des horaires théoriques (et parfois des horaires temps réel) mais aucune position GPS de véhicule.
              Ils ne sont donc pas affichés sur la carte.
            </p>
            {statics.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-3 py-1.5 opacity-75">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{s.networkNames[0] ?? s.title}</p>
                  <p className="truncate text-[11px] text-fg-subtle">{s.statusDetail}</p>
                </div>
                <StatusPill status="static" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
