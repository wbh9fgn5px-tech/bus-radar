"use client";
import Link from "next/link";
import { Moon, Radar, Sun, WifiOff } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { store, useRadar } from "@/lib/client/store";
import { nf } from "@/lib/client/format";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { SearchBox } from "./SearchBox";
import { cn } from "@/lib/utils";

function useTheme() {
  const dark = useSyncExternalStore(
    (cb) => {
      const mo = new MutationObserver(cb);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => mo.disconnect();
    },
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("br-theme", next ? "dark" : "light");
    } catch {}
  };
  return { dark, toggle };
}

export function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-xl" aria-label="Bus Radar — accueil">
      <div className="relative grid size-9 place-items-center rounded-xl bg-night text-turquoise shadow-float dark:bg-deep">
        <Radar className="size-5" strokeWidth={2.2} />
        <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-white bg-live dark:border-night" />
      </div>
      {!compact && (
        <div className="leading-none">
          <p className="text-[15px] font-semibold tracking-tight text-fg">Bus Radar</p>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-fg-subtle">France · temps réel</p>
        </div>
      )}
    </Link>
  );
}

function Stat({ value, label, tone }: { value: number | undefined; label: string; tone?: "live" }) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      {tone === "live" && <span className="size-1.5 translate-y-[-1px] self-center rounded-full bg-live animate-pulse-ring" />}
      <span className="text-sm font-semibold tabular-nums text-fg">{value === undefined ? "—" : nf.format(value)}</span>
      <span className="text-xs text-fg-muted">{label}</span>
    </div>
  );
}

/** Statistiques calculées par le backend (sauf "visibles", calculé sur la vue courante). */
export function StatsBar({ className }: { className?: string }) {
  const { stats, visible, connection } = useRadar((s) => ({
    stats: s.stats,
    visible: s.visibleInViewport(100000).length,
    connection: s.connection,
  }));
  return (
    <div className={cn("glass flex h-11 items-center gap-4 rounded-2xl border border-line px-4 shadow-float", className)}>
      {connection !== "open" ? (
        <span className="flex items-center gap-2 text-xs font-medium text-alert">
          <WifiOff className="size-3.5" />
          {connection === "connecting" ? "Connexion au flux…" : "Reconnexion…"}
        </span>
      ) : (
        <>
          <Tip label="Véhicules affichés dans la vue actuelle, après filtres" side="bottom">
            <div><Stat value={visible} label="visibles" /></div>
          </Tip>
          <Tip label="Positions GPS de moins de 3 minutes" side="bottom">
            <div><Stat value={stats?.vehiclesLive} label="en direct" tone="live" /></div>
          </Tip>
          <span className="hidden h-4 w-px bg-line xl:block" />
          <Tip label="Réseaux ayant au moins un véhicule en direct" side="bottom">
            <div className="hidden xl:block"><Stat value={stats?.networksCovered} label="réseaux couverts" /></div>
          </Tip>
          <Tip label="Flux GTFS-RT joignables (avec ou sans véhicule en circulation)" side="bottom">
            <div className="hidden 2xl:block"><Stat value={stats?.sourcesConnected} label="flux connectés" /></div>
          </Tip>
          <Tip label="Lignes issues des GTFS statiques chargés" side="bottom">
            <div className="hidden 2xl:block"><Stat value={stats?.routesAvailable} label="lignes" /></div>
          </Tip>
        </>
      )}
    </div>
  );
}

export function ThemeButton() {
  const { dark, toggle } = useTheme();
  return (
    <Tip label={dark ? "Mode clair" : "Mode sombre"} side="bottom">
      <Button variant="float" size="icon" onClick={toggle} aria-label="Changer de thème" className="size-11 rounded-2xl">
        {dark ? <Sun /> : <Moon />}
      </Button>
    </Tip>
  );
}

export function TopBar() {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 hidden items-start gap-3 p-3 md:flex">
      <div className="pointer-events-auto glass flex h-11 items-center rounded-2xl border border-line pl-1 pr-3 shadow-float">
        <Brand />
      </div>
      <SearchBox className="pointer-events-auto w-full max-w-md" />
      <div className="flex-1" />
      <StatsBar className="pointer-events-auto" />
      <div className="pointer-events-auto">
        <ThemeButton />
      </div>
    </header>
  );
}

export function useStoreConnection() {
  useEffect(() => {
    store.connect();
    return () => store.disconnect();
  }, []);
}
