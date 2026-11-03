"use client";
import { useEffect, useState } from "react";
import { Crosshair, ExternalLink, History, Info, LocateFixed, Navigation, X } from "lucide-react";
import { API_BASE, LIVE_MAX_AGE_SEC, store, useRadar } from "@/lib/client/store";
import { MODE_LABEL, cardinal, clock, clockSec, delayLabel, gtfsTime, relTime } from "@/lib/client/format";
import { Button } from "@/components/ui/button";
import { Field, NA, RouteBadge, StatusPill } from "./bits";
import type { StopTimeInfo, VehicleDetail as Detail } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/client/use-now";

const PROGRESS_BASIS: Record<string, string> = {
  current_stop_sequence: "Calculée à partir de la séquence d'arrêt transmise par le véhicule.",
  stop_id: "Calculée à partir de l'arrêt transmis par le véhicule.",
  trip_updates: "Calculée à partir des prévisions TripUpdates du réseau.",
};

/** Charge la fiche et la rafraîchit à chaque nouvelle position. */
export function useVehicleDetail(key: string | null) {
  const [state, setState] = useState<{ key: string; detail: Detail | null; gone: boolean } | null>(null);
  const t = useRadar((s) => (key ? s.vehicles.get(key)?.t : undefined));
  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    fetch(`${API_BASE}/api/vehicles/${encodeURIComponent(key)}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (r.status === 404) setState((p) => ({ key, detail: p?.key === key ? p.detail : null, gone: true }));
        else setState({ key, detail: await r.json(), gone: false });
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [key, t]);
  if (!key || state?.key !== key) return { detail: null, gone: false };
  return { detail: state.gone ? null : state.detail, gone: state.gone };
}

function StopTimeline({ stops }: { stops: StopTimeInfo[] }) {
  const firstUpcoming = stops.findIndex((s) => s.state === "upcoming" || s.state === "current");
  const [expanded, setExpanded] = useState(false);
  const start = expanded || firstUpcoming < 0 ? 0 : Math.max(0, firstUpcoming - 2);
  const visible = expanded ? stops : stops.slice(start, start + 8);
  return (
    <div>
      {!expanded && start > 0 && (
        <button className="mb-1 pl-6 text-xs text-fg-subtle hover:text-fg" onClick={() => setExpanded(true)}>
          {start} arrêt(s) précédent(s)…
        </button>
      )}
      <ol className="relative">
        {visible.map((s, i) => {
          const passed = s.state === "passed";
          const current = s.state === "current";
          const isNext = stops.indexOf(s) === firstUpcoming;
          const d = delayLabel(s.delaySec);
          return (
            <li key={`${s.sequence}-${s.stopId}`} className="relative flex gap-3 pb-2.5 pl-1">
              {i < visible.length - 1 && <span className={cn("absolute left-[8.5px] top-3.5 h-full w-0.5", passed ? "bg-line" : "bg-electric/40 dark:bg-turquoise/40")} />}
              <span
                className={cn(
                  "relative z-10 mt-1 size-3 shrink-0 rounded-full border-2",
                  passed ? "border-line bg-surface-2" : current || isNext ? "border-electric bg-electric dark:border-turquoise dark:bg-turquoise" : "border-electric bg-surface-solid dark:border-turquoise",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-sm", passed ? "text-fg-subtle" : "text-fg", (current || isNext) && "font-semibold")}>{s.stopName ?? s.stopId}</p>
                {(current || isNext) && <p className="text-[11px] text-electric dark:text-turquoise">{current ? "À l'arrêt" : "Prochain arrêt"}</p>}
              </div>
              <div className="shrink-0 text-right text-xs tabular-nums">
                {s.realtimeMs ? (
                  <span className={cn("font-medium", passed ? "text-fg-subtle" : "text-live")}>{clock(s.realtimeMs)}</span>
                ) : s.scheduledSec !== undefined ? (
                  <span className="text-fg-muted">{gtfsTime(s.scheduledSec)}</span>
                ) : null}
                {d && !passed && <p className={cn("text-[10px]", d.tone === "late" ? "text-alert" : "text-fg-subtle")}>{d.label}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      {stops.length > 8 && (
        <button className="pl-6 text-xs font-medium text-electric hover:underline dark:text-turquoise" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Réduire" : `Voir les ${stops.length} arrêts`}
        </button>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-fg-subtle">
        Heures en vert : temps réel (TripUpdates). Heures grises : horaires théoriques du GTFS.
      </p>
    </div>
  );
}

export function VehicleDetailPanel({ detail, gone, className }: { detail: Detail | null; gone: boolean; className?: string }) {
  const follow = useRadar((s) => s.follow);
  const now = useNow();

  if (!detail) {
    return (
      <div className={cn("p-5 text-sm text-fg-muted", className)}>
        {gone ? "Ce véhicule n'apparaît plus dans le dernier flux reçu (fin de service ou perte du signal GPS)." : "Chargement de la fiche…"}
        {gone && (
          <Button className="mt-3" variant="secondary" size="sm" onClick={() => store.select(null)}>
            Fermer
          </Button>
        )}
      </div>
    );
  }

  const v = detail.vehicle;
  const s = detail.source;
  const age = Math.round((now - v.timestamp) / 1000);
  const live = age <= LIVE_MAX_AGE_SEC;
  const delay = delayLabel(v.delaySec);
  const operator = v.agencyName ?? s.networkNames[0] ?? s.title;
  const history = detail.history;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {/* En-tête */}
      <div className="flex items-start gap-3 p-4 pb-3">
        <RouteBadge
          name={v.routeShortName ?? v.routeId ?? "?"}
          color={v.routeColor}
          textColor={v.routeTextColor}
          className="h-9 min-w-11 rounded-xl px-2 text-sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight text-fg">{v.headsign ? `→ ${v.headsign}` : "Destination non fournie"}</p>
          <p className="truncate text-xs text-fg-muted">
            {operator}
            {v.routeLongName && ` · ${v.routeLongName}`}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => store.select(null)} aria-label="Fermer la fiche">
          <X />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <StatusPill status={live ? "live" : "lagging"}>{live ? "Position en direct" : "Position ancienne"}</StatusPill>
        <span className="text-xs text-fg-muted">GPS {relTime(v.timestamp, now)}</span>
        {delay && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              delay.tone === "late" ? "bg-alert/15 text-alert" : "bg-live/10 text-live",
            )}
            title="Retard issu du flux TripUpdates du réseau"
          >
            {delay.label}
          </span>
        )}
      </div>

      <div className="flex gap-2 px-4 pb-3">
        <Button className="flex-1" variant={follow ? "default" : "secondary"} onClick={() => store.setFollow(!follow)}>
          <LocateFixed /> {follow ? "Suivi activé" : "Suivre ce véhicule"}
        </Button>
        <Button variant="secondary" size="icon" onClick={() => store.command({ type: "fly", lon: v.lon, lat: v.lat, zoom: 16 })} aria-label="Centrer">
          <Crosshair />
        </Button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        {/* Progression */}
        {detail.progress && (
          <section className="rounded-xl bg-surface-2 p-3">
            <div className="mb-2 flex items-baseline justify-between text-xs">
              <span className="font-medium text-fg">Progression</span>
              <span className="tabular-nums text-fg-muted">
                {detail.progress.passed} / {detail.progress.total} arrêts
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-gradient-to-r from-electric to-turquoise transition-[width] duration-700"
                style={{ width: `${(100 * detail.progress.passed) / Math.max(1, detail.progress.total)}%` }}
              />
            </div>
            {detail.nextStop && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-fg">
                <Navigation className="size-3.5 text-electric dark:text-turquoise" />
                <span className="truncate">Prochain arrêt : <b>{detail.nextStop.name ?? detail.nextStop.stopId}</b></span>
              </p>
            )}
            <p className="mt-1 text-[10px] text-fg-subtle">{PROGRESS_BASIS[detail.progress.basis]}</p>
          </section>
        )}
        {!detail.progress && detail.nextStop && (
          <p className="flex items-center gap-1.5 rounded-xl bg-surface-2 p-3 text-sm">
            <Navigation className="size-3.5 text-electric dark:text-turquoise" /> Prochain arrêt : <b>{detail.nextStop.name ?? detail.nextStop.stopId}</b>
          </p>
        )}

        {/* Informations */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="Exploitant">{operator}</Field>
          <Field label="Véhicule" hint="Identifiant transmis par le flux (vehicle.id)">{v.vehicleId ?? v.label ?? <NA />}</Field>
          <Field label="Ligne">{v.routeShortName ?? v.routeId ?? <NA />}</Field>
          <Field label="Course" hint={v.tripId}>{v.tripId ?? <NA />}</Field>
          <Field label="Direction" hint={v.bearingSource === "computed" ? "Cap calculé entre les deux dernières positions reçues" : undefined}>
            {v.bearing !== undefined ? (
              <span className="inline-flex items-center gap-1">
                <Navigation className="size-3.5" style={{ transform: `rotate(${v.bearing}deg)` }} />
                {Math.round(v.bearing)}° {cardinal(v.bearing)}
                {v.bearingSource === "computed" && <span className="text-[10px] font-normal text-fg-subtle">(calculé)</span>}
              </span>
            ) : (
              <NA />
            )}
          </Field>
          <Field label="Vitesse">{v.speedKmh !== undefined ? `${Math.round(v.speedKmh)} km/h` : <NA />}</Field>
          <Field label="Position GPS">
            <span className="font-mono text-xs">
              {v.lat.toFixed(5)}, {v.lon.toFixed(5)}
            </span>
          </Field>
          <Field label="Dernière mise à jour" hint={v.timestampSource === "feed_header" ? "Horodatage de l'en-tête du flux (le véhicule n'en fournit pas)" : "Horodatage transmis par le véhicule"}>
            {clockSec(v.timestamp)}
          </Field>
          <Field label="Type">{v.mode !== "unknown" ? MODE_LABEL[v.mode] : <NA />}</Field>
          {v.label && v.vehicleId && v.label !== v.vehicleId && v.label.toLowerCase() !== v.headsign?.toLowerCase() && (
            <Field label="Libellé véhicule">{v.label}</Field>
          )}
          {v.licensePlate && <Field label="Immatriculation">{v.licensePlate}</Field>}
          {v.occupancyStatus && <Field label="Affluence">{v.occupancyStatus.replaceAll("_", " ").toLowerCase()}</Field>}
          {v.currentStatus && (
            <Field label="État">{{ STOPPED_AT: "À l'arrêt", INCOMING_AT: "Arrive à l'arrêt", IN_TRANSIT_TO: "En route" }[v.currentStatus]}</Field>
          )}
        </dl>

        {/* Arrêts */}
        {detail.stops && detail.stops.length > 0 && (
          <section>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Parcours</h4>
            <StopTimeline stops={detail.stops} />
          </section>
        )}

        {/* Historique */}
        <section className="flex items-start gap-2 rounded-xl border border-line p-3 text-xs text-fg-muted">
          <History className="mt-0.5 size-3.5 shrink-0" />
          {history.length > 1 ? (
            <span>
              {history.length} positions enregistrées par Bus Radar depuis {clock(history[0][2])} (tracé pointillé turquoise).
            </span>
          ) : (
            <span>Pas encore d’historique : il se constitue à partir des positions reçues par ce serveur.</span>
          )}
        </section>

        {/* Source */}
        <section className="flex items-start gap-2 text-[11px] leading-relaxed text-fg-subtle">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Source : {s.title} — {s.publisher}. Licence {s.licence}. Données GTFS-RT reçues {relTime(s.lastSuccessAt, now)}.{" "}
            {s.pageUrl && (
              <a href={s.pageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-electric hover:underline dark:text-turquoise">
                transport.data.gouv.fr <ExternalLink className="size-3" />
              </a>
            )}
          </span>
        </section>
      </div>
    </div>
  );
}
