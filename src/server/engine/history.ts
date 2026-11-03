/**
 * Historique des positions RÉELLEMENT reçues par ce serveur.
 * - Toujours : mémoire tampon circulaire par véhicule (HISTORY_POINTS).
 * - Optionnel : persistance PostgreSQL/PostGIS si DATABASE_URL est défini
 *   (schéma : db/schema.sql), par lots pour limiter la charge.
 */
import { config } from "../config.ts";
import type { Vehicle } from "../../lib/types.ts";

type Point = [number, number, number]; // lon, lat, ts

export interface HistoryStore {
  record(v: Vehicle): void;
  get(key: string): Point[];
  prune(now: number): void;
}

export function createHistoryStore(): HistoryStore {
  const mem = new Map<string, Point[]>();
  const persist = config.databaseUrl ? createPgWriter(config.databaseUrl) : undefined;
  return {
    record(v) {
      let a = mem.get(v.key);
      if (!a) mem.set(v.key, (a = []));
      const last = a[a.length - 1];
      if (last && last[2] === v.timestamp) return; // position déjà enregistrée
      a.push([v.lon, v.lat, v.timestamp]);
      if (a.length > config.historyPoints) a.splice(0, a.length - config.historyPoints);
      persist?.push(v);
    },
    get: (key) => mem.get(key) ?? [],
    prune(now) {
      for (const [k, a] of mem) if (!a.length || now - a[a.length - 1][2] > 30 * 60_000) mem.delete(k);
    },
  };
}

function createPgWriter(url: string) {
  let buffer: Vehicle[] = [];
  let pool: import("pg").Pool | undefined;
  let disabled = false;
  const flush = async () => {
    if (disabled || !buffer.length) return;
    const batch = buffer.splice(0, 5000);
    try {
      if (!pool) {
        const { Pool } = (await import("pg")).default ?? (await import("pg"));
        pool = new Pool({ connectionString: url, max: 2 });
      }
      const values: unknown[] = [];
      const rows = batch.map((v, i) => {
        const o = i * 9;
        values.push(v.sourceId, v.key, v.timestamp / 1000, v.lon, v.lat, v.bearing ?? null, v.speedKmh ?? null, v.tripId ?? null, v.routeId ?? null);
        return `($${o + 1},$${o + 2},to_timestamp($${o + 3}),ST_SetSRID(ST_MakePoint($${o + 4},$${o + 5}),4326),$${o + 6},$${o + 7},$${o + 8},$${o + 9})`;
      });
      await pool.query(
        `INSERT INTO vehicle_positions (source_id, vehicle_key, observed_at, geom, bearing, speed_kmh, trip_id, route_id)
         VALUES ${rows.join(",")} ON CONFLICT DO NOTHING`,
        values,
      );
    } catch (e) {
      console.error("[history] écriture PostgreSQL impossible, persistance désactivée :", (e as Error).message);
      disabled = true;
      buffer = [];
    }
  };
  setInterval(flush, 10_000).unref();
  return {
    push(v: Vehicle) {
      if (!disabled && buffer.length < 50_000) buffer.push(v);
    },
  };
}
