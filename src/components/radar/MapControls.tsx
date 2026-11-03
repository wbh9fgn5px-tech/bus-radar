"use client";
import { Bus, Crosshair, Locate, MapPinned, Minus, Plus, Route } from "lucide-react";
import { store, useRadar } from "@/lib/client/store";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function MapControls({ className }: { className?: string }) {
  const { layers, zoom } = useRadar((s) => ({ layers: s.layers, zoom: s.zoom }));
  const group = "glass flex flex-col overflow-hidden rounded-2xl border border-line shadow-float";
  const btn = "size-10 rounded-none border-0 bg-transparent shadow-none";
  return (
    <div className={cn("pointer-events-auto flex flex-col gap-2", className)}>
      <div className={group}>
        <Tip label="Zoom avant">
          <Button variant="ghost" size="icon" className={btn} onClick={() => store.command({ type: "zoom", delta: 1 })} aria-label="Zoom avant">
            <Plus />
          </Button>
        </Tip>
        <div className="mx-2 h-px bg-line" />
        <Tip label="Zoom arrière">
          <Button variant="ghost" size="icon" className={btn} onClick={() => store.command({ type: "zoom", delta: -1 })} aria-label="Zoom arrière">
            <Minus />
          </Button>
        </Tip>
      </div>
      <div className={group}>
        <Tip label="Ma position">
          <Button variant="ghost" size="icon" className={btn} onClick={() => store.command({ type: "locate" })} aria-label="Me géolocaliser">
            <Locate />
          </Button>
        </Tip>
        <div className="mx-2 h-px bg-line" />
        <Tip label="Toute la France">
          <Button variant="ghost" size="icon" className={btn} onClick={() => store.command({ type: "france" })} aria-label="Revenir sur toute la France">
            <Crosshair />
          </Button>
        </Tip>
      </div>
      <div className={group}>
        <Tip label={layers.vehicles ? "Masquer les véhicules" : "Afficher les véhicules"}>
          <Button
            variant="ghost"
            size="icon"
            className={cn(btn, layers.vehicles && "text-electric dark:text-turquoise")}
            onClick={() => store.setLayers({ vehicles: !layers.vehicles })}
            aria-pressed={layers.vehicles}
            aria-label="Véhicules"
          >
            <Bus />
          </Button>
        </Tip>
        <div className="mx-2 h-px bg-line" />
        <Tip label={zoom < 10 && layers.lines ? "Lignes : zoomez pour les afficher" : layers.lines ? "Masquer les lignes" : "Afficher les lignes (tracés GTFS)"}>
          <Button
            variant="ghost"
            size="icon"
            className={cn(btn, layers.lines && "text-electric dark:text-turquoise")}
            onClick={() => store.setLayers({ lines: !layers.lines })}
            aria-pressed={layers.lines}
            aria-label="Lignes"
          >
            <Route />
          </Button>
        </Tip>
        <div className="mx-2 h-px bg-line" />
        <Tip label={zoom < 14 && layers.stops ? "Arrêts : zoomez pour les afficher" : layers.stops ? "Masquer les arrêts" : "Afficher les arrêts"}>
          <Button
            variant="ghost"
            size="icon"
            className={cn(btn, layers.stops && "text-electric dark:text-turquoise")}
            onClick={() => store.setLayers({ stops: !layers.stops })}
            aria-pressed={layers.stops}
            aria-label="Arrêts"
          >
            <MapPinned />
          </Button>
        </Tip>
      </div>
    </div>
  );
}
