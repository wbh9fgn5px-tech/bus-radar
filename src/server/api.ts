/** Utilitaires communs aux route handlers. */
import { connection } from "next/server";
import { getEngine, type Engine } from "./engine/engine.ts";

/** CORS optionnel, pour un frontend déployé séparément (ex. Vercel). */
export function corsHeaders(): Record<string, string> {
  const origin = process.env.CORS_ORIGIN;
  return origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
}

export function json(data: unknown, init: { status?: number; maxAge?: number } = {}) {
  return Response.json(data, {
    status: init.status ?? 200,
    headers: {
      "Cache-Control": init.maxAge ? `public, max-age=${init.maxAge}` : "no-store",
      ...corsHeaders(),
    },
  });
}

/** Rend la route dynamique et renvoie le moteur (démarré à la demande). */
export async function engine(): Promise<Engine> {
  await connection();
  return getEngine();
}

export function parseBbox(v: string | null): [number, number, number, number] | null {
  if (!v) return null;
  const a = v.split(",").map(Number);
  if (a.length !== 4 || a.some((x) => !Number.isFinite(x))) return null;
  if (a[2] - a[0] > 3 || a[3] - a[1] > 3) return null; // emprise trop large : refusée
  return a as [number, number, number, number];
}
