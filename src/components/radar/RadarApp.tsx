"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { store, useRadar } from "@/lib/client/store";
import { TooltipProvider, Tip } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Brand, StatsBar, ThemeButton, TopBar, useStoreConnection } from "./TopBar";
import { SearchBox } from "./SearchBox";
import { MapControls } from "./MapControls";
import { DataFooter, PanelTabs } from "./SidePanel";
import { VehicleDetailPanel, useVehicleDetail } from "./VehicleDetail";
import { cn } from "@/lib/utils";

const MapView = dynamic(() => import("./MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-bg" />,
});

function useIsMobile() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(max-width: 767px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}

/** Tiroir inférieur à trois positions (aperçu / moitié / plein). */
function BottomSheet({ children, snapTo }: { children: React.ReactNode; snapTo: "peek" | "half" | "full" | null }) {
  const [snap, setSnap] = useState<"peek" | "half" | "full">("peek");
  // Ajustement d'état pendant le rendu quand la demande externe change.
  const [prevSnapTo, setPrevSnapTo] = useState(snapTo);
  if (snapTo !== prevSnapTo) {
    setPrevSnapTo(snapTo);
    if (snapTo) setSnap(snapTo);
  }
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ y: number; h: number } | null>(null);
  const heights = { peek: 112, half: Math.round(window.innerHeight * 0.5), full: Math.round(window.innerHeight * 0.88) };
  const h = drag ?? heights[snap];
  return (
    <section
      className={cn("glass fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-3xl border-t border-line shadow-pop", drag === null && "transition-[height] duration-300 ease-out")}
      style={{ height: h, paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
        className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          start.current = { y: e.clientY, h };
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          setDrag(Math.min(heights.full, Math.max(80, start.current.h + start.current.y - e.clientY)));
        }}
        onPointerUp={() => {
          if (start.current && drag !== null) {
            const opts = Object.entries(heights) as ["peek" | "half" | "full", number][];
            setSnap(opts.reduce((a, b) => (Math.abs(b[1] - drag) < Math.abs(a[1] - drag) ? b : a))[0]);
          } else if (start.current) {
            setSnap(snap === "peek" ? "half" : "peek");
          }
          start.current = null;
          setDrag(null);
        }}
        aria-label="Redimensionner le panneau"
        role="slider"
        aria-valuenow={h}
      >
        <span className="h-1.5 w-10 rounded-full bg-fg-subtle/40" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

export function RadarApp() {
  useStoreConnection();
  const isMobile = useIsMobile();
  const { selectedKey, panelOpen } = useRadar((s) => ({ selectedKey: s.selectedKey, panelOpen: s.panelOpen }));
  const { detail, gone } = useVehicleDetail(selectedKey);
  useEffect(() => {
    // Recentre la zone utile de la carte selon les panneaux ouverts.
    if (isMobile) store.setInsets({ top: 110, right: 0, bottom: selectedKey ? Math.round(window.innerHeight * 0.5) : 112, left: 0 });
    else store.setInsets({ top: 60, right: selectedKey ? 430 : 60, bottom: 0, left: panelOpen ? 395 : 0 });
  }, [isMobile, selectedKey, panelOpen]);

  return (
    <TooltipProvider>
      <main className="fixed inset-0 overflow-hidden">
        <MapView detail={detail} />

        {!isMobile && (
          <>
            <TopBar />
            {/* Panneau Explorer */}
            <aside
              className={cn(
                "glass absolute bottom-3 left-3 top-[68px] z-10 flex w-[380px] flex-col overflow-hidden rounded-2xl border border-line shadow-float transition-[transform,opacity] duration-300",
                !panelOpen && "pointer-events-none -translate-x-[calc(100%+16px)] opacity-0",
              )}
              aria-label="Explorer"
            >
              <PanelTabs />
              <DataFooter />
            </aside>
            <div className={cn("absolute top-[68px] z-10 transition-[left] duration-300", panelOpen ? "left-[400px]" : "left-3")}>
              <Tip label={panelOpen ? "Masquer le panneau" : "Afficher le panneau"} side="right">
                <Button variant="float" size="icon" onClick={() => store.set("panelOpen", !panelOpen)} aria-label="Panneau latéral">
                  {panelOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
                </Button>
              </Tip>
            </div>
            {/* Fiche véhicule */}
            {selectedKey && (
              <aside
                key={selectedKey}
                className="glass absolute bottom-3 right-[68px] top-[68px] z-10 flex w-[360px] flex-col overflow-hidden rounded-2xl border border-line shadow-pop animate-slide-in max-lg:right-3 max-lg:top-auto max-lg:max-h-[60vh]"
                aria-label="Fiche véhicule"
              >
                <VehicleDetailPanel detail={detail} gone={gone} className="flex-1" />
              </aside>
            )}
            <MapControls className="absolute right-3 top-[68px] z-10" />
          </>
        )}

        {isMobile && (
          <>
            <header className="pointer-events-none absolute inset-x-0 top-0 z-20 space-y-2 p-3" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
              <div className="pointer-events-auto flex items-center gap-2">
                <Brand compact />
                <SearchBox className="min-w-0 flex-1" />
                <ThemeButton />
              </div>
              <StatsBar className="pointer-events-auto h-9 w-fit max-w-full overflow-x-auto px-3" />
            </header>
            <MapControls className="absolute right-3 top-[124px] z-10 scale-90 origin-top-right" />
            <BottomSheet snapTo={selectedKey ? "half" : null}>
              {selectedKey ? <VehicleDetailPanel detail={detail} gone={gone} className="flex-1" /> : <PanelTabs />}
            </BottomSheet>
          </>
        )}
      </main>
    </TooltipProvider>
  );
}
