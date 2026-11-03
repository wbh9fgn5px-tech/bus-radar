/**
 * Requêtes sur les index GTFS statiques d'une source, et croisement avec
 * le temps réel. Toute information dérivée indique sa base de calcul.
 */
import type { RawTripUpdate } from "../connectors/gtfs-rt.ts";
import type { GtfsIndex, RouteInfo, TripInfo } from "../static/gtfs.ts";
import { serviceDayOriginMs } from "../static/time.ts";
import type { Departure, StopTimeInfo, Vehicle, VehicleDetail } from "../../lib/types.ts";

export interface Lookup {
  g?: GtfsIndex;
  trip?: TripInfo;
  route?: RouteInfo;
}

export function lookup(indexes: GtfsIndex[], tripId?: string, routeId?: string): Lookup {
  if (tripId) {
    for (const g of indexes) {
      const trip = g.trips.get(tripId);
      if (trip) return { g, trip, route: g.routes.get(trip.routeId) };
    }
  }
  if (routeId) {
    for (const g of indexes) {
      const route = g.routes.get(routeId);
      if (route) return { g, route };
    }
  }
  return {};
}

export function agencyName(g: GtfsIndex | undefined, route: RouteInfo | undefined): string | undefined {
  if (!g) return undefined;
  if (route?.agencyId && g.agencies.has(route.agencyId)) return g.agencies.get(route.agencyId);
  if (g.agencies.size === 1) return [...g.agencies.values()][0];
  return undefined;
}

/** Dernier arrêt de la course (terminus théorique) si la course est chargée. */
export function tripTerminus(g: GtfsIndex, trip: TripInfo): string | undefined {
  if (trip.stStart < 0 || trip.stLen === 0) return undefined;
  const si = g.stStop[trip.stStart + trip.stLen - 1];
  return si >= 0 ? g.stopNames[si] : undefined;
}

/**
 * Jour de service d'une course : start_date du flux s'il est fourni,
 * sinon le jour de la fenêtre où le service circule et dont les horaires
 * encadrent l'instant présent.
 */
export function serviceDateFor(g: GtfsIndex, trip: TripInfo, startDate: string | undefined, now: number): string | undefined {
  if (startDate && /^\d{8}$/.test(startDate)) return startDate;
  if (trip.stStart < 0) return undefined;
  const first = g.stTime[trip.stStart];
  const last = g.stTime[trip.stStart + trip.stLen - 1];
  let best: string | undefined;
  let bestDist = Infinity;
  for (const d of g.windowDates) {
    if (!g.activeServices.get(d)?.has(trip.serviceId)) continue;
    const o = serviceDayOriginMs(d, g.tz);
    const a = o + Math.max(first, 0) * 1000;
    const b = o + Math.max(last, first, 0) * 1000;
    const dist = now < a ? a - now : now > b ? now - b : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return bestDist < 3 * 3600_000 ? best : undefined;
}

/** Retard issu des TripUpdates uniquement (jamais estimé depuis la position). */
export function delayFromTripUpdate(tu: RawTripUpdate | undefined, now: number): number | undefined {
  if (!tu) return undefined;
  const upcoming = tu.stopTimeUpdates.find((u) => (u.arrivalTime ?? u.departureTime ?? 0) >= now - 30_000);
  const d = upcoming?.arrivalDelay ?? upcoming?.departureDelay ?? tu.delay;
  return d !== undefined && Math.abs(d) < 6 * 3600 ? d : undefined;
}

export function buildTripStops(
  l: Lookup,
  v: Vehicle,
  tu: RawTripUpdate | undefined,
  now: number,
): Pick<VehicleDetail, "stops" | "progress" | "nextStop" | "shape"> {
  const out: Pick<VehicleDetail, "stops" | "progress" | "nextStop" | "shape"> = {};
  const { g, trip } = l;
  if (g && trip?.shapeId) {
    const s = g.shapes.get(trip.shapeId);
    if (s) {
      const pts: [number, number][] = [];
      for (let i = 0; i < s.length; i += 2) pts.push([s[i], s[i + 1]]);
      out.shape = pts;
    }
  }

  // Prochain arrêt annoncé directement par le flux de positions.
  if (v.stopId && v.currentStatus !== "STOPPED_AT") {
    const si = g?.stopOf(v.stopId) ?? -1;
    out.nextStop = { stopId: v.stopId, name: si >= 0 ? g!.stopNames[si] : undefined, basis: "vehicle_position" };
  }

  if (!g || !trip || trip.stStart < 0) return out;

  const date = serviceDateFor(g, trip, v.startDate, now);
  const origin = date ? serviceDayOriginMs(date, g.tz) : undefined;
  const stus = tu?.stopTimeUpdates ?? [];
  const stops: StopTimeInfo[] = [];
  for (let k = trip.stStart; k < trip.stStart + trip.stLen; k++) {
    const si = g.stStop[k];
    const stopId = si >= 0 ? g.stopIds[si] : "?";
    const seq = g.stSeq[k];
    const stu = stus.find((u) => (u.stopSequence !== undefined ? u.stopSequence === seq : u.stopId === stopId));
    const sched = g.stTime[k] >= 0 ? g.stTime[k] : undefined;
    let realtimeMs = stu?.arrivalTime ?? stu?.departureTime;
    const delay = stu?.arrivalDelay ?? stu?.departureDelay;
    if (realtimeMs === undefined && delay !== undefined && sched !== undefined && origin !== undefined) {
      realtimeMs = origin + (sched + delay) * 1000;
    }
    stops.push({
      stopId,
      stopName: si >= 0 ? g.stopNames[si] : undefined,
      lat: si >= 0 ? g.stopLat[si] : undefined,
      lon: si >= 0 ? g.stopLon[si] : undefined,
      sequence: seq,
      scheduledSec: sched,
      realtimeMs,
      delaySec: delay,
      state: "unknown",
    });
  }

  // Position dans la course : uniquement à partir d'informations temps réel.
  let idx = -1;
  let basis: "current_stop_sequence" | "stop_id" | "trip_updates" | undefined;
  if (v.currentStopSequence !== undefined) {
    idx = stops.findIndex((s) => s.sequence === v.currentStopSequence);
    if (idx >= 0) basis = "current_stop_sequence";
  }
  if (idx < 0 && v.stopId) {
    idx = stops.findIndex((s) => s.stopId === v.stopId);
    if (idx >= 0) basis = "stop_id";
  }
  if (idx < 0 && stus.length) {
    idx = stops.findIndex((s) => s.realtimeMs !== undefined && s.realtimeMs >= now);
    if (idx >= 0) basis = "trip_updates";
  }
  if (idx >= 0 && basis) {
    const stopped = v.currentStatus === "STOPPED_AT" && basis !== "trip_updates";
    stops.forEach((s, i) => {
      s.state = i < idx ? "passed" : i === idx ? (stopped ? "current" : "upcoming") : "upcoming";
    });
    out.progress = { passed: stopped ? idx + 1 : idx, total: stops.length, basis };
    const next = stopped ? stops[idx + 1] : stops[idx];
    if (next && !out.nextStop) {
      out.nextStop = {
        stopId: next.stopId,
        name: next.stopName,
        basis: basis === "trip_updates" ? "trip_updates" : "vehicle_position",
      };
    }
  }
  out.stops = stops;
  return out;
}

/** Prochains passages à un arrêt (et ses arrêts enfants). */
export function departuresAt(
  indexes: GtfsIndex[],
  stopId: string,
  tripUpdates: Map<string, RawTripUpdate>,
  now: number,
  horizonMs = 2 * 3600_000,
  max = 20,
): Departure[] {
  const out: Departure[] = [];
  for (const g of indexes) {
    const si = g.stopIndex.get(stopId);
    if (si === undefined || !g.stopTimesLoaded) continue;
    const targets = new Set([si, ...(g.children.get(si) ?? [])]);
    const origins = new Map(g.windowDates.map((d) => [d, serviceDayOriginMs(d, g.tz)]));
    for (let k = 0; k < g.stStop.length; k++) {
      if (!targets.has(g.stStop[k])) continue;
      const time = g.stTime[k];
      if (time < 0) continue;
      const tripId = g.activeTripIds[g.stTrip[k]];
      const trip = g.trips.get(tripId)!;
      for (const d of g.windowDates) {
        if (!g.activeServices.get(d)?.has(trip.serviceId)) continue;
        const scheduledMs = origins.get(d)! + time * 1000;
        const tu = tripUpdates.get(tripId);
        const tuDateOk = !tu?.startDate || tu.startDate === d;
        const stu = tu && tuDateOk
          ? tu.stopTimeUpdates.find((u) => (u.stopSequence !== undefined ? u.stopSequence === g.stSeq[k] : u.stopId === g.stopIds[g.stStop[k]]))
          : undefined;
        if (stu?.skipped) continue;
        let realtimeMs = stu?.departureTime ?? stu?.arrivalTime;
        const delay = stu?.departureDelay ?? stu?.arrivalDelay;
        if (realtimeMs === undefined && delay !== undefined) realtimeMs = scheduledMs + delay * 1000;
        const t = realtimeMs ?? scheduledMs;
        if (t < now - 60_000 || t > now + horizonMs) continue;
        const route = g.routes.get(trip.routeId);
        out.push({
          routeId: trip.routeId,
          routeShortName: route?.shortName,
          routeColor: route?.color,
          headsign: trip.headsign ?? tripTerminus(g, trip),
          tripId,
          scheduledMs,
          realtimeMs,
          basis: realtimeMs !== undefined ? "realtime" : "scheduled",
        });
      }
    }
  }
  return out.sort((a, b) => (a.realtimeMs ?? a.scheduledMs) - (b.realtimeMs ?? b.scheduledMs)).slice(0, max);
}
