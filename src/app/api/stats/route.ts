import { engine, json } from "@/server/api.ts";

export async function GET() {
  const e = await engine();
  return json(e.getStats());
}
