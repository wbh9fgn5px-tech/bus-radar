/**
 * Lecture en flux de fichiers CSV contenus dans une archive ZIP (GTFS).
 * Parseur CSV RFC 4180 : guillemets, "" échappés, champs multi-lignes, CRLF, BOM.
 * Chemin rapide (split) pour les lignes sans guillemets, majoritaires en GTFS.
 * Les lignes sont traitées au fil de l'eau : aucune table complète en mémoire.
 */
import yauzl from "yauzl";
import type { Readable } from "node:stream";

export type Row = (name: string) => string | undefined;

export interface ZipHandle {
  entries: Map<string, yauzl.Entry>;
  has(name: string): boolean;
  size(name: string): number;
  forEachRow(name: string, cb: (get: Row) => void): Promise<number>;
  close(): void;
}

export function openZip(file: string): Promise<ZipHandle> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: false }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("ZIP illisible"));
      const entries = new Map<string, yauzl.Entry>();
      zip.on("entry", (e: yauzl.Entry) => {
        // Certains GTFS sont rangés dans un sous-dossier.
        const base = e.fileName.split("/").pop()!.toLowerCase();
        if (base.endsWith(".txt") && !entries.has(base)) entries.set(base, e);
        zip.readEntry();
      });
      zip.on("error", reject);
      zip.on("end", () => {
        resolve({
          entries,
          has: (n) => entries.has(n),
          size: (n) => entries.get(n)?.uncompressedSize ?? 0,
          forEachRow: (n, cb) => {
            const entry = entries.get(n);
            if (!entry) return Promise.resolve(0);
            return new Promise<number>((res, rej) => {
              zip.openReadStream(entry, (e2, stream) => {
                if (e2 || !stream) return rej(e2 ?? new Error(`Lecture impossible : ${n}`));
                parseCsvStream(stream, cb).then(res, rej);
              });
            });
          },
          close: () => zip.close(),
        });
      });
      zip.readEntry();
    });
  });
}

function splitQuoted(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      out.push(field);
      field = "";
    } else field += ch;
  }
  out.push(field);
  return out;
}

function countQuotes(s: string): number {
  let n = 0;
  for (let i = s.indexOf('"'); i !== -1; i = s.indexOf('"', i + 1)) n++;
  return n;
}

async function parseCsvStream(stream: Readable, cb: (get: Row) => void): Promise<number> {
  const decoder = new TextDecoder("utf-8");
  let index = new Map<string, number>();
  let hasHeader = false;
  let record: string[] = [];
  let rows = 0;
  let rest = "";
  let pending = ""; // enregistrement multi-lignes (champ entre guillemets contenant un saut de ligne)
  let pendingQuotes = 0;

  const get: Row = (name) => {
    const i = index.get(name);
    if (i === undefined) return undefined;
    const v = record[i];
    return v === undefined || v === "" ? undefined : v;
  };

  const handleRecord = (line: string) => {
    if (line.charCodeAt(line.length - 1) === 13) line = line.slice(0, -1);
    if (!hasHeader) {
      if (line.charCodeAt(0) === 0xfeff) line = line.slice(1);
      const h = (line.includes('"') ? splitQuoted(line) : line.split(",")).map((x) => x.trim().toLowerCase());
      index = new Map(h.map((x, i) => [x, i]));
      hasHeader = true;
      return;
    }
    if (line === "") return;
    record = line.includes('"') ? splitQuoted(line) : line.split(",");
    for (let i = 0; i < record.length; i++) {
      const v = record[i];
      if (v.charCodeAt(0) === 32 || v.charCodeAt(v.length - 1) === 32) record[i] = v.trim();
    }
    cb(get);
    rows++;
  };

  const handleLine = (line: string) => {
    if (pending) {
      pending += "\n" + line;
      pendingQuotes += countQuotes(line);
    } else {
      const q = line.includes('"') ? countQuotes(line) : 0;
      if (q % 2 === 0) return handleRecord(line);
      pending = line;
      pendingQuotes = q;
    }
    if (pendingQuotes % 2 === 0) {
      const p = pending;
      pending = "";
      pendingQuotes = 0;
      handleRecord(p);
    }
  };

  const consume = (text: string) => {
    const data = rest + text;
    let start = 0;
    for (let nl = data.indexOf("\n"); nl !== -1; nl = data.indexOf("\n", start)) {
      handleLine(data.slice(start, nl));
      start = nl + 1;
    }
    rest = data.slice(start);
  };

  for await (const chunk of stream) consume(decoder.decode(chunk as Buffer, { stream: true }));
  consume(decoder.decode());
  if (rest) handleLine(rest);
  if (pending) handleRecord(pending);
  return rows;
}
