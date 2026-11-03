/**
 * Connecteur SIRI Lite — VehicleMonitoring (JSON).
 *
 * Utilisé pour les sources déclarées dans config/credentialed-sources.json
 * (flux nécessitant une clé ou un identifiant). Le parseur est tolérant aux
 * deux sérialisations courantes ({ value: "x" } ou "x").
 *
 * ⚠️ Non testé contre un flux réel faute d'identifiants : à valider lors de
 * l'activation de la première source SIRI.
 */
import type { DecodedFeed, RawVehicle } from "./gtfs-rt.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const val = (x: any): string | undefined => {
  if (x === undefined || x === null) return undefined;
  if (Array.isArray(x)) return val(x[0]);
  if (typeof x === "object") return val(x.value ?? x.Value);
  const s = String(x).trim();
  return s || undefined;
};
const num = (x: any): number | undefined => {
  const v = Number(val(x));
  return Number.isFinite(v) ? v : undefined;
};
const time = (x: any): number | undefined => {
  const s = val(x);
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : undefined;
};

export function decodeSiriLiteVM(body: Buffer): DecodedFeed {
  const json = JSON.parse(body.toString("utf8"));
  const sd = json?.Siri?.ServiceDelivery ?? json?.ServiceDelivery;
  if (!sd) throw new Error("Réponse SIRI sans ServiceDelivery");
  const deliveries: any[] = [].concat(sd.VehicleMonitoringDelivery ?? []);
  const out: DecodedFeed = {
    headerTimestamp: time(sd.ResponseTimestamp),
    entityCount: 0,
    vehicles: [],
    tripUpdates: [],
    alertCount: 0,
    rejectedPositions: 0,
  };
  for (const d of deliveries) {
    for (const act of [].concat(d.VehicleActivity ?? []) as any[]) {
      out.entityCount++;
      const mvj = act.MonitoredVehicleJourney ?? {};
      const lat = num(mvj.VehicleLocation?.Latitude);
      const lon = num(mvj.VehicleLocation?.Longitude);
      if (lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (Math.abs(lat) < 0.01 && Math.abs(lon) < 0.01)) {
        out.rejectedPositions++;
        continue;
      }
      const bearing = num(mvj.Bearing);
      const v: RawVehicle = {
        entityId: val(act.ItemIdentifier) ?? val(mvj.VehicleRef) ?? `${lat},${lon}`,
        vehicleId: val(mvj.VehicleRef),
        lat,
        lon,
        bearing: bearing !== undefined && bearing >= 0 && bearing <= 360 ? bearing % 360 : undefined,
        timestamp: time(act.RecordedAtTime),
        tripId: val(mvj.FramedVehicleJourneyRef?.DatedVehicleJourneyRef) ?? val(mvj.VehicleJourneyRef),
        routeId: val(mvj.LineRef),
        stopId: val(mvj.MonitoredCall?.StopPointRef),
      };
      out.vehicles.push(v);
    }
  }
  return out;
}
