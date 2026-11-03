import { engine, json } from "@/server/api.ts";

/** Instantané de tous les véhicules (format compact). */
export async function GET() {
  const e = await engine();
  return json({ generatedAt: Date.now(), vehicles: e.getSnapshot() });
}
