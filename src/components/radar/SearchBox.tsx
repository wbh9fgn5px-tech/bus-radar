"use client";
import { useEffect, useRef, useState } from "react";
import { Building2, Bus, Loader2, MapPin, Navigation, Route, Search, Signpost, X } from "lucide-react";
import { API_BASE, store } from "@/lib/client/store";
import type { SearchResult } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICONS: Record<SearchResult["type"], typeof MapPin> = {
  city: MapPin,
  operator: Building2,
  route: Route,
  stop: Signpost,
  vehicle: Bus,
  destination: Navigation,
};
const GROUP: Record<SearchResult["type"], string> = {
  city: "Villes",
  operator: "Réseaux",
  route: "Lignes",
  stop: "Arrêts",
  vehicle: "Véhicules",
  destination: "Destinations",
};

export function goTo(r: SearchResult) {
  switch (r.type) {
    case "city":
      store.command({ type: "fly", lon: r.lon!, lat: r.lat!, zoom: 12.5 });
      break;
    case "operator": {
      const s = store.sources.get(r.id);
      if (s?.bbox) store.command({ type: "fit", bbox: s.bbox });
      store.tab = "operators";
      store.panelOpen = true;
      store.notify();
      break;
    }
    case "route": {
      const [sourceId, routeId] = r.id.split("|");
      store.selectedRoute = { sourceId, routeId };
      store.tab = "lines";
      store.panelOpen = true;
      store.notify();
      break;
    }
    case "stop": {
      const [sourceId, stopId] = r.id.split("|");
      store.selectedStop = { sourceId, stopId, name: r.label };
      store.tab = "stops";
      store.panelOpen = true;
      if (!store.layers.stops) store.setLayers({ stops: true });
      store.command({ type: "fly", lon: r.lon!, lat: r.lat!, zoom: 16.5 });
      store.notify();
      break;
    }
    case "vehicle":
    case "destination":
      store.select(r.id, { fly: true });
      break;
  }
}

export function SearchBox({ className }: { className?: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
        const data = (await r.json()) as { results: SearchResult[] };
        setResults(data.results ?? []);
        setActive(0);
      } catch {
        /* annulée */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const choose = (r: SearchResult) => {
    goTo(r);
    setOpen(false);
    inputRef.current?.blur();
  };

  const shown = q.trim().length >= 2 ? results : [];
  return (
    <div className={cn("relative", className)}>
      <div className="glass flex h-11 items-center gap-2 rounded-2xl border border-line px-3.5 shadow-float transition-shadow focus-within:ring-2 focus-within:ring-electric/40">
        {loading ? <Loader2 className="size-4 shrink-0 animate-spin text-fg-subtle" /> : <Search className="size-4 shrink-0 text-fg-subtle" />}
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && results[active]) choose(results[active]);
            else if (e.key === "Escape") inputRef.current?.blur();
          }}
          placeholder="Ville, arrêt, ligne, réseau, véhicule…"
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
          aria-label="Recherche"
          role="combobox"
          aria-expanded={open && shown.length > 0}
          aria-controls="search-results"
        />
        {q ? (
          <button onClick={() => setQ("")} className="text-fg-subtle hover:text-fg" aria-label="Effacer">
            <X className="size-4" />
          </button>
        ) : (
          <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 font-sans text-[10px] text-fg-subtle md:inline">Ctrl K</kbd>
        )}
      </div>
      {open && q.trim().length >= 2 && (
        <div
          id="search-results"
          role="listbox"
          className="glass scroll-thin absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-[60vh] overflow-y-auto rounded-2xl border border-line p-1.5 shadow-pop animate-slide-up"
        >
          {!loading && shown.length === 0 && <p className="px-3 py-4 text-center text-sm text-fg-muted">Aucun résultat pour « {q} »</p>}
          {shown.map((r, i) => {
            const Icon = ICONS[r.type];
            const header = r.type !== shown[i - 1]?.type ? GROUP[r.type] : null;
            return (
              <div key={`${r.type}-${r.id}-${i}`}>
                {header && <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">{header}</p>}
                <button
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(r)}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left", i === active && "bg-surface-2")}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg-muted">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-fg">{r.label}</span>
                    {r.sublabel && <span className="block truncate text-xs text-fg-muted">{r.sublabel}</span>}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
