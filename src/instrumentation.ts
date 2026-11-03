/**
 * Démarre le moteur d'ingestion au lancement du serveur Node.js
 * (pas pendant `next build`, pas dans le runtime Edge).
 * Désactivable avec ENGINE_AUTOSTART=false (il démarre alors à la 1re requête API).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.ENGINE_AUTOSTART === "false") return;
  const { getEngine } = await import("./server/engine/engine.ts");
  getEngine().catch((e) => console.error("[engine] démarrage impossible :", e));
}
