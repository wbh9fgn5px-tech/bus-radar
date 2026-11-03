# Bus Radar France — image de production (accueil + carte + API + moteur d'ingestion)
# Compatible Hugging Face Spaces (port 7860, utilisateur uid 1000), Render,
# Railway, Fly.io… Le port d'écoute suit la variable PORT.
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/copy-maplibre-worker.mjs scripts/
RUN mkdir -p public && npm ci

FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=7860 \
    DATA_DIR=/data
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/config ./config
COPY --from=build --chown=node:node /app/next.config.ts ./
# Cache disque (catalogue, GTFS) : éphémère, reconstruit automatiquement au démarrage.
RUN mkdir -p /data && chown node:node /data
# L'utilisateur "node" de l'image officielle a l'uid 1000, attendu par Hugging Face.
USER node
EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "exec node_modules/.bin/next start -H 0.0.0.0 -p ${PORT}"]
