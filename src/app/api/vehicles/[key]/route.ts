import { engine, json } from "@/server/api.ts";

export async function GET(_req: Request, ctx: RouteContext<"/api/vehicles/[key]">) {
  const { key } = await ctx.params;
  const e = await engine();
  const d = e.getVehicle(decodeURIComponent(key));
  if (!d) return json({ error: "Véhicule absent du dernier flux reçu" }, { status: 404 });
  return json(d);
}
