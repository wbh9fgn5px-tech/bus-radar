/**
 * Sources nécessitant des identifiants (clé API, jeton, compte).
 *
 * Déclarées dans config/credentialed-sources.json (voir le fichier
 * .example.json et docs/SOURCES.md). Le secret n'est JAMAIS écrit dans ce
 * fichier : seule la variable d'environnement qui le contient est nommée.
 * Sans la variable, la source apparaît « Clé requise » et n'est pas interrogée.
 */
import fs from "node:fs";
import path from "node:path";
import type { NetworkCategory } from "../../lib/types.ts";
import type { SourceDescriptor } from "./transport-data-gouv.ts";

interface Entry {
  id: string;
  title: string;
  networkName?: string;
  publisher: string;
  connector: "gtfs-rt" | "siri-lite-vm";
  url: string;
  auth: { type: "header" | "query"; name: string; env: string; prefix?: string };
  category?: NetworkCategory;
  licence?: string;
  pageUrl?: string;
  staticGtfsUrl?: string;
}

export interface CredentialedSource {
  desc: SourceDescriptor;
  connector: Entry["connector"];
  url: string;
  envVar: string;
  /** Défini seulement si la variable d'environnement est présente. */
  headers?: Record<string, string>;
}

export function loadCredentialedSources(): CredentialedSource[] {
  let entries: Entry[] = [];
  try {
    const file = path.join(process.cwd(), "config", "credentialed-sources.json");
    entries = (JSON.parse(fs.readFileSync(file, "utf8")) as { sources?: Entry[] }).sources ?? [];
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.id && e.url && e.auth?.env)
    .map((e) => {
      const secret = process.env[e.auth.env];
      let url = e.url;
      let headers: Record<string, string> | undefined;
      if (secret) {
        if (e.auth.type === "query") {
          const u = new URL(e.url);
          u.searchParams.set(e.auth.name, secret);
          url = u.toString();
          headers = {};
        } else {
          headers = { [e.auth.name]: `${e.auth.prefix ?? ""}${secret}` };
        }
      }
      return {
        connector: e.connector,
        url,
        envVar: e.auth.env,
        headers,
        desc: {
          id: `key-${e.id}`,
          title: e.title,
          networkNames: e.networkName ? [e.networkName] : [],
          publisher: e.publisher,
          operatorGroups: [],
          category: e.category ?? "inconnu",
          categoryBasis: e.category ? "catalogue" : "unknown",
          geo: { regions: [], departements: [], communes: [], basis: "unknown" },
          licence: e.licence ?? "Voir conditions du fournisseur",
          pageUrl: e.pageUrl,
          // L'URL publique (sans secret) est la seule exposée au client.
          feeds: [{ url: e.url, kind: ["vehicle_positions"], title: `${e.connector} (identifiants requis)` }],
          hasRealtimePositions: true,
          hasTripUpdates: false,
          staticGtfsUrls: e.staticGtfsUrl ? [e.staticGtfsUrl] : [],
        },
      };
    });
}
