"use client";
import { Building2, Bus, Database, Route, Signpost } from "lucide-react";
import { store, useRadar, type PanelTab } from "@/lib/client/store";
import { nf, relTime } from "@/lib/client/format";
import { useNow } from "@/lib/client/use-now";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VehiclesTab } from "./VehiclesTab";
import { OperatorsTab } from "./OperatorsTab";
import { LinesTab } from "./LinesTab";
import { StopsTab } from "./StopsTab";

export function DataFooter() {
  const { sources, stats } = useRadar((s) => ({ sources: [...s.sources.values()], stats: s.stats }));
  const now = useNow();
  const rt = sources.filter((s) => s.hasRealtimePositions);
  const offline = rt.filter((s) => s.status === "offline").length;
  const last = Math.max(0, ...rt.map((s) => s.lastSuccessAt ?? 0));
  return (
    <div className="flex items-start gap-2 border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-fg-subtle">
      <Database className="mt-0.5 size-3 shrink-0" />
      <p>
        Open data <a className="underline decoration-dotted hover:text-fg" href="https://transport.data.gouv.fr" target="_blank" rel="noreferrer">transport.data.gouv.fr</a>{" "}
        · {nf.format(rt.length)} flux de positions{offline > 0 && `, ${offline} hors ligne`} · {nf.format(stats?.sourcesTotal ?? sources.length)} réseaux au catalogue · MAJ {relTime(last || undefined, now)}
      </p>
    </div>
  );
}

export function PanelTabs() {
  const tab = useRadar((s) => s.tab);
  return (
    <Tabs value={tab} onValueChange={(v) => store.set("tab", v as PanelTab)} className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pb-3 pt-3">
        <TabsList>
          <TabsTrigger value="vehicles"><Bus />Véhicules</TabsTrigger>
          <TabsTrigger value="operators"><Building2 />Réseaux</TabsTrigger>
          <TabsTrigger value="lines"><Route />Lignes</TabsTrigger>
          <TabsTrigger value="stops"><Signpost />Arrêts</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="vehicles"><VehiclesTab /></TabsContent>
      <TabsContent value="operators"><OperatorsTab /></TabsContent>
      <TabsContent value="lines"><LinesTab /></TabsContent>
      <TabsContent value="stops"><StopsTab /></TabsContent>
    </Tabs>
  );
}
