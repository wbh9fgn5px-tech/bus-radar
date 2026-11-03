/** Utilitaires de dates de service GTFS, dépendants du fuseau de l'agence. */

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

function parts(ms: number, tz: string) {
  const o: Record<string, number> = {};
  for (const p of fmt(tz).formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Décalage (ms) du fuseau à l'instant donné. */
function offsetMs(ms: number, tz: string): number {
  const p = parts(ms, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** "YYYYMMDD" de la date locale à l'instant donné. */
export function localDate(ms: number, tz: string): string {
  const p = parts(ms, tz);
  return `${p.year}${String(p.month).padStart(2, "0")}${String(p.day).padStart(2, "0")}`;
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8)) + days * 86400_000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Jour de semaine (0 = lundi … 6 = dimanche) d'une date "YYYYMMDD". */
export function weekday(date: string): number {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8)));
  return (d.getUTCDay() + 6) % 7;
}

/**
 * Origine des horaires GTFS d'un jour de service : "midi moins 12 h"
 * (spécification GTFS, correct aussi les jours de changement d'heure).
 */
export function serviceDayOriginMs(date: string, tz: string): number {
  const noonUtcGuess = Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), 12);
  const noon = noonUtcGuess - offsetMs(noonUtcGuess, tz);
  return noon - 12 * 3600_000;
}

/** "HH:MM:SS" (HH peut dépasser 24) → secondes. */
export function parseGtfsTime(t: string | undefined): number {
  if (!t) return -1;
  const a = t.split(":");
  if (a.length < 2) return -1;
  return +a[0] * 3600 + +a[1] * 60 + (+a[2] || 0);
}
