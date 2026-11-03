import type { NextConfig } from "next";

/**
 * NEXT_OUTPUT=export : build du FRONTEND SEUL en fichiers statiques (Netlify).
 * Les routes API (`route.ts`) et le moteur (`instrumentation.ts`) sont exclus
 * en limitant les extensions de routes à `.tsx` ; le frontend appelle alors
 * l'API déployée ailleurs via NEXT_PUBLIC_API_BASE.
 */
const staticExport = process.env.NEXT_OUTPUT === "export";

if (staticExport && !process.env.NEXT_PUBLIC_API_BASE) {
  throw new Error(
    "NEXT_OUTPUT=export nécessite NEXT_PUBLIC_API_BASE (URL du backend, ex. https://bus-radar-api.onrender.com).",
  );
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: !staticExport,
  partialPrefetching: !staticExport,
  ...(staticExport
    ? { output: "export", pageExtensions: ["tsx"], distDir: "out" }
    : {
        async headers() {
          return [{ source: "/(.*)", headers: securityHeaders }];
        },
      }),
  // Modules serveur natifs / CommonJS : chargés tels quels par Node.
  serverExternalPackages: ["gtfs-realtime-bindings", "protobufjs", "yauzl", "pg"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
