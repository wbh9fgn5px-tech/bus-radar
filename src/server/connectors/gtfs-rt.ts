/**
 * Connecteur GTFS-Realtime : décodage protobuf et normalisation.
 * Ne produit que ce que le flux contient. Les positions invalides
 * (0,0 / hors bornes / NaN) sont rejetées et comptées.
 */
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;

export interface RawVehicle {
  entityId: string;
  vehicleId?: string;
  label?: string;
  licensePlate?: string;
  lat: number;
  lon: number;
  bearing?: number;
  speedKmh?: number;
  timestamp?: number; // ms
  tripId?: string;
  routeId?: string;
  directionId?: number;
  startDate?: string;
  startTime?: string;
  stopId?: string;
  currentStatus?: "INCOMING_AT" | "STOPPED_AT" | "IN_TRANSIT_TO";
  currentStopSequence?: number;
  occupancyStatus?: string;
}

export interface RawStopTimeUpdate {
  stopSequence?: number;
  stopId?: string;
  arrivalTime?: number; // ms
  departureTime?: number; // ms
  arrivalDelay?: number;
  departureDelay?: number;
  skipped?: boolean;
}

export interface RawTripUpdate {
  tripId?: string;
  routeId?: string;
  startDate?: string;
  vehicleId?: string;
  delay?: number;
  timestamp?: number;
  stopTimeUpdates: RawStopTimeUpdate[];
}

export interface DecodedFeed {
  headerTimestamp?: number; // ms
  gtfsRealtimeVersion?: string;
  entityCount: number;
  vehicles: RawVehicle[];
  tripUpdates: RawTripUpdate[];
  alertCount: number;
  rejectedPositions: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const s = (v: any): string | undefined => (v === undefined || v === null || v === "" ? undefined : String(v));
const n = (v: any): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const ms = (sec: any): number | undefined => {
  const v = n(sec);
  return v && v > 0 ? v * 1000 : undefined;
};

function validPosition(lat: unknown, lon: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(Math.abs(lat) < 0.01 && Math.abs(lon) < 0.01)
  );
}

export function decodeFeed(buf: Uint8Array): DecodedFeed {
  const msg = FeedMessage.decode(buf);
  const obj = FeedMessage.toObject(msg, { longs: Number, enums: String, defaults: false }) as any;
  const out: DecodedFeed = {
    headerTimestamp: ms(obj.header?.timestamp),
    gtfsRealtimeVersion: s(obj.header?.gtfsRealtimeVersion),
    entityCount: obj.entity?.length ?? 0,
    vehicles: [],
    tripUpdates: [],
    alertCount: 0,
    rejectedPositions: 0,
  };
  for (const e of obj.entity ?? []) {
    if (e.isDeleted) continue;
    const v = e.vehicle;
    if (v) {
      const p = v.position;
      if (!p || !validPosition(p.latitude, p.longitude)) {
        if (p) out.rejectedPositions++;
      } else {
        const bearing = n(p.bearing);
        const speed = n(p.speed);
        out.vehicles.push({
          entityId: String(e.id),
          vehicleId: s(v.vehicle?.id),
          label: s(v.vehicle?.label),
          licensePlate: s(v.vehicle?.licensePlate),
          lat: p.latitude,
          lon: p.longitude,
          bearing: bearing !== undefined && bearing >= 0 && bearing <= 360 ? bearing % 360 : undefined,
          speedKmh: speed !== undefined && speed >= 0 ? Math.round(speed * 3.6 * 10) / 10 : undefined,
          timestamp: ms(v.timestamp),
          tripId: s(v.trip?.tripId),
          routeId: s(v.trip?.routeId),
          directionId: n(v.trip?.directionId),
          startDate: s(v.trip?.startDate),
          startTime: s(v.trip?.startTime),
          stopId: s(v.stopId),
          currentStatus: s(v.currentStatus) as RawVehicle["currentStatus"],
          currentStopSequence: n(v.currentStopSequence),
          occupancyStatus: s(v.occupancyStatus),
        });
      }
    }
    const tu = e.tripUpdate;
    if (tu) {
      out.tripUpdates.push({
        tripId: s(tu.trip?.tripId),
        routeId: s(tu.trip?.routeId),
        startDate: s(tu.trip?.startDate),
        vehicleId: s(tu.vehicle?.id),
        delay: n(tu.delay),
        timestamp: ms(tu.timestamp),
        stopTimeUpdates: (tu.stopTimeUpdate ?? []).map((u: any) => ({
          stopSequence: n(u.stopSequence),
          stopId: s(u.stopId),
          arrivalTime: ms(u.arrival?.time),
          departureTime: ms(u.departure?.time),
          arrivalDelay: n(u.arrival?.delay),
          departureDelay: n(u.departure?.delay),
          skipped: u.scheduleRelationship === "SKIPPED",
        })),
      });
    }
    if (e.alert) out.alertCount++;
  }
  return out;
}
