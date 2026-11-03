-- Bus Radar France — schéma PostgreSQL / PostGIS (optionnel)
-- Activé si DATABASE_URL est défini : l'historique des positions RÉELLEMENT
-- reçues est écrit par lots (src/server/engine/history.ts).

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS vehicle_positions (
  source_id    text        NOT NULL,
  vehicle_key  text        NOT NULL,
  observed_at  timestamptz NOT NULL,           -- horodatage fourni par la source
  received_at  timestamptz NOT NULL DEFAULT now(),
  geom         geometry(Point, 4326) NOT NULL,
  bearing      real,
  speed_kmh    real,
  trip_id      text,
  route_id     text,
  PRIMARY KEY (vehicle_key, observed_at)
);

CREATE INDEX IF NOT EXISTS vehicle_positions_geom_idx ON vehicle_positions USING gist (geom);
CREATE INDEX IF NOT EXISTS vehicle_positions_source_time_idx ON vehicle_positions (source_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS vehicle_positions_route_time_idx ON vehicle_positions (route_id, observed_at DESC);

-- Rétention conseillée (à planifier, ex. pg_cron) :
-- DELETE FROM vehicle_positions WHERE observed_at < now() - interval '30 days';
