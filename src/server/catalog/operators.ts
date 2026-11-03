/**
 * Gestion des opérateurs / groupes de transport.
 *
 * Un groupe (Keolis, Transdev…) n'est associé à une source QUE si son nom
 * apparaît dans les données : titre et éditeur du jeu de données, nom
 * commercial, AOM, ou agency_name du GTFS. Aucune attribution "de mémoire" :
 * les contrats d'exploitation changent et ne figurent pas dans les flux.
 *
 * Pour des rattachements vérifiés manuellement, utiliser
 * `config/operator-overrides.json` (chaque entrée doit citer sa preuve).
 */
import fs from "node:fs";
import path from "node:path";

const PATTERNS: [string, RegExp][] = [
  ["RATP Dev", /\bratp[\s-]?dev\b/i],
  ["RATP", /\bratp\b(?![\s-]?dev)/i],
  ["Keolis", /\bk[ée]olis\b/i],
  ["Transdev", /\btransdev\b/i],
  ["SNCF", /\bsncf\b|\btransilien\b|\bintercit[ée]s\b|\btgv\b/i],
  ["SNCF", /\bTER\b/], // sensible à la casse : évite les faux positifs
  ["FlixBus", /\bflix\s?bus\b/i],
  ["BlaBlaCar Bus", /\bblablacar\b/i],
  ["Vectalia", /\bvectalia\b/i],
  ["Lacroix & Savac", /\blacroix\b.*\bsavac\b/i],
  ["Moventis", /\bmoventis\b/i],
  ["Arriva", /\barriva\b/i],
  ["Renfe", /\brenfe\b/i],
  ["Trenitalia", /\btrenitalia\b/i],
  ["Eurostar", /\beurostar\b/i],
];

export function detectOperatorGroups(texts: (string | undefined)[]): string[] {
  const out = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    for (const [name, re] of PATTERNS) if (re.test(t)) out.add(name);
  }
  return [...out];
}

interface Override {
  sourceId: string;
  operatorGroups: string[];
  /** URL ou référence justifiant le rattachement (obligatoire). */
  evidence: string;
}

let overrides: Override[] | null = null;

export function operatorOverrides(): Override[] {
  if (overrides) return overrides;
  try {
    const file = path.join(process.cwd(), "config", "operator-overrides.json");
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { overrides?: Override[] };
    overrides = (parsed.overrides ?? []).filter((o) => o.sourceId && o.evidence && o.operatorGroups?.length);
  } catch {
    overrides = [];
  }
  return overrides;
}
