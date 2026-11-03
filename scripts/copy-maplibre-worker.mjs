// Copie le worker ESM de MapLibre dans /public : Turbopack ne le résout pas
// automatiquement (new URL(..., import.meta.url)). Exécuté avant dev/build.
import fs from "node:fs";
import path from "node:path";

const src = path.join("node_modules", "maplibre-gl", "dist", "maplibre-gl-worker.mjs");
const dst = path.join("public", "maplibre-gl-worker.mjs");
fs.mkdirSync("public", { recursive: true });
fs.copyFileSync(src, dst);
console.log(`maplibre worker → ${dst}`);
