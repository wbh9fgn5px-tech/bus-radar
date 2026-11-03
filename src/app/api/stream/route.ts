/**
 * Flux Server-Sent Events : instantané initial, puis DELTAS par source
 * (véhicules nouveaux ou modifiés + clés disparues), calculés pour chaque
 * connexion. Les mises à jour sont regroupées par seconde.
 */
import { engine, corsHeaders } from "@/server/api.ts";
import type { MapVehicle, SourceInfo, SourcePatch, StreamEvent } from "@/lib/types.ts";

const patchOf = (s: SourceInfo): SourcePatch => ({
  status: s.status,
  statusDetail: s.statusDetail,
  vehicleCount: s.vehicleCount,
  liveVehicleCount: s.liveVehicleCount,
  lastSuccessAt: s.lastSuccessAt,
  lastFeedTimestamp: s.lastFeedTimestamp,
  lastError: s.lastError,
  staticState: s.staticState,
  staticDetail: s.staticDetail,
  routeCount: s.routeCount,
  stopCount: s.stopCount,
  agencies: s.agencies,
  operatorGroups: s.operatorGroups,
  bbox: s.bbox,
  geo: s.geo,
});

const sig = (v: MapVehicle) => `${v.t}|${v.x}|${v.y}|${v.b}|${v.r}|${v.d}|${v.h}|${v.m}`;

export async function GET(req: Request) {
  const e = await engine();
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const send = (ev: StreamEvent) => write(`data: ${JSON.stringify(ev)}\n\n`);
      write("retry: 3000\n\n");

      // État déjà transmis à CE client : source → (clé → signature).
      const sent = new Map<string, Map<string, string>>();
      const snapshot = e.getSnapshot();
      for (const v of snapshot) {
        let m = sent.get(v.s);
        if (!m) sent.set(v.s, (m = new Map()));
        m.set(v.k, sig(v));
      }
      send({ type: "snapshot", vehicles: snapshot, sources: e.getSources(), stats: e.getStats() });

      const sentPatch = new Map<string, string>();
      const pending = new Set<string>();
      const onUpdate = (id: string) => pending.add(id);
      const onStats = () => send({ type: "stats", stats: e.getStats() });
      const onSources = () => send({ type: "sources", sources: e.getSources() });
      const flush = setInterval(() => {
        for (const id of pending) {
          const source = e.getSource(id);
          if (!source) continue;
          const prev = sent.get(id) ?? new Map<string, string>();
          const next = new Map<string, string>();
          const upserts: MapVehicle[] = [];
          for (const v of e.sourceVehicles(id)) {
            const s = sig(v);
            next.set(v.k, s);
            if (prev.get(v.k) !== s) upserts.push(v);
          }
          const removed = [...prev.keys()].filter((k) => !next.has(k));
          sent.set(id, next);
          // Statut : transmis s'il a changé (hors horodatages) ou avec des véhicules nouveaux.
          const patch = patchOf(source);
          const key = JSON.stringify({ ...patch, lastSuccessAt: 0, lastFeedTimestamp: 0 });
          const patchChanged = sentPatch.get(id) !== key;
          sentPatch.set(id, key);
          if (!upserts.length && !removed.length && !patchChanged) continue;
          send({ type: "source-delta", sourceId: id, upserts, removed, source: patchChanged || upserts.length ? patch : undefined });
        }
        pending.clear();
      }, 1000);
      const ping = setInterval(() => write(": ping\n\n"), 20000);
      e.on("source-update", onUpdate);
      e.on("stats", onStats);
      e.on("sources", onSources);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(flush);
        clearInterval(ping);
        e.off("source-update", onUpdate);
        e.off("stats", onStats);
        e.off("sources", onSources);
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...corsHeaders(),
    },
  });
}
