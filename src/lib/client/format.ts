import type { NetworkCategory, SourceStatus, VehicleMode } from "@/lib/types";

export const STATUS_META: Record<SourceStatus, { label: string; dot: string; text: string }> = {
  live: { label: "En direct", dot: "bg-live", text: "text-live" },
  lagging: { label: "Retard de mise à jour", dot: "bg-alert", text: "text-alert" },
  offline: { label: "Hors ligne", dot: "bg-danger", text: "text-danger" },
  static: { label: "Statique", dot: "bg-fg-subtle", text: "text-fg-subtle" },
  pending: { label: "Connexion…", dot: "bg-electric", text: "text-electric" },
  disabled: { label: "Clé requise", dot: "bg-fg-subtle", text: "text-fg-subtle" },
};

export const CATEGORY_LABEL: Record<NetworkCategory, string> = {
  urbain: "Réseaux urbains",
  interurbain: "Réseaux interurbains",
  regional: "Cars régionaux",
  longue_distance: "Longue distance",
  scolaire: "Transport scolaire",
  inconnu: "Non catégorisé",
};

export const MODE_LABEL: Record<VehicleMode, string> = {
  bus: "Bus",
  coach: "Autocar",
  trolleybus: "Trolleybus",
  tram: "Tramway",
  metro: "Métro",
  rail: "Train",
  ferry: "Bateau",
  cable: "Transport par câble",
  other: "Autre",
  unknown: "Mode non précisé",
};

export function relTime(ms: number | undefined, now: number): string {
  if (!now) return "—";
  if (!ms) return "—";
  const s = Math.round((now - ms) / 1000);
  if (s < 5) return "à l'instant";
  if (s < 60) return `il y a ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `il y a ${h} h` : new Date(ms).toLocaleDateString("fr-FR");
}

export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
}

export function clockSec(ms: number): string {
  return new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Paris" });
}

export function gtfsTime(sec: number): string {
  const h = Math.floor(sec / 3600) % 24;
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function delayLabel(sec: number | undefined): { label: string; tone: "ok" | "late" | "early" } | null {
  if (sec === undefined) return null;
  const m = Math.round(sec / 60);
  if (Math.abs(sec) < 60) return { label: "À l'heure", tone: "ok" };
  return m > 0 ? { label: `+${m} min`, tone: "late" } : { label: `${m} min`, tone: "early" };
}

export const nf = new Intl.NumberFormat("fr-FR");

/** Couleur de texte lisible sur une couleur de ligne. */
export function readableOn(hex?: string): string {
  if (!hex) return "#ffffff";
  const n = parseInt(hex, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#101827" : "#ffffff";
}

export function cardinal(deg?: number): string | undefined {
  if (deg === undefined) return undefined;
  const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return dirs[Math.round(deg / 45) % 8];
}
