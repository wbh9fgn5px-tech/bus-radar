---
title: Bus Radar France
emoji: 🚌
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
short_description: Les bus de France en temps réel (open data GTFS-RT)
---

# Bus Radar France

Carte en temps réel des bus et autocars circulant en France, construite **uniquement** à partir des flux open data réels (GTFS-Realtime) référencés sur [transport.data.gouv.fr](https://transport.data.gouv.fr).

- Aucun véhicule fictif, aucune position inventée ou extrapolée.
- Les horaires théoriques (GTFS) ne sont jamais présentés comme des positions.
- La source, la licence et la fraîcheur de chaque donnée sont affichées.
- Un réseau sans flux de positions fonctionnel n'est jamais présenté comme connecté.

Audit des sources et conditions d'accès : **[docs/SOURCES.md](docs/SOURCES.md)**.
Mise en ligne gratuite : **[docs/DEPLOY-HUGGINGFACE.md](docs/DEPLOY-HUGGINGFACE.md)**.

---

## Démarrage

Prérequis : Node.js ≥ 22.18 (scripts TypeScript exécutés nativement), accès Internet sortant.

```bash
npm install
npm run dev        # http://localhost:3000
```

| Page | Contenu |
|---|---|
| `/` | Page d'accueil : concept, principes de données, fonctionnement, couverture. Chiffres, aperçu cartographique et liste des réseaux calculés en direct à partir de l'API. |
| `/carte` | Application carte radar |

Production :

```bash
npm run build
npm start
```

Au lancement, le serveur charge le catalogue national (~3 Mo), interroge les ~170 flux de positions, puis importe en arrière-plan les GTFS statiques des réseaux actifs (≈ 1 min au premier démarrage, cache disque ensuite). Les premiers véhicules apparaissent en quelques secondes.

### Scripts

| Commande | Rôle |
|---|---|
| `npm run audit:sources` | Interroge chaque flux GTFS-RT du catalogue et produit `docs/audit/gtfs-rt-audit.{md,json}` |
| `npm run smoke [secondes]` | Fait tourner le moteur d'ingestion hors Next.js et affiche les statistiques |
| `npm run check:static <motif>` | Teste l'import GTFS d'un réseau (ex. `npm run check:static TBM`) |
| `npm run typecheck` / `npm run lint` | TypeScript strict / ESLint (règles React Compiler) |

Configuration : voir [`.env.example`](.env.example) (aucune variable obligatoire).

---

## Architecture

```
transport.data.gouv.fr (catalogue)                      Géoplateforme IGN (géocodage)
        │                                                        │
        ▼                                                        │
 Catalogue ──► Connecteurs ──► Normalisation ──► État mémoire ───┤
 (6 h, cache)  GTFS-RT          fusion, dédoublonnage,  véhicules,     │
               SIRI-Lite VM*    fraîcheur, cap calculé  TripUpdates,   │
               (*à clé)                │                index GTFS     │
                                       │                      │        │
 GTFS statique ─► Import en flux ──────┘                      ▼        ▼
 (cache 24 h)    courses actives J-1/J/J+1           API Next.js (route handlers)
                                                      ├─ /api/stream (SSE, deltas)
 Historique ◄── positions reçues                      ├─ /api/vehicles[/key]
 (mémoire, + PostGIS si DATABASE_URL)                 ├─ /api/sources, /api/stats, /api/health
                                                      ├─ /api/routes, /api/stops, /api/shapes
                                                      └─ /api/search
                                                                  │
                                                                  ▼
                                               Frontend React + MapLibre GL
                                               clusters · icônes orientées · interpolation
```

| Dossier | Contenu |
|---|---|
| `src/server/catalog/` | catalogue national, détection des groupes exploitants, sources à identifiants |
| `src/server/connectors/` | décodeurs GTFS-RT (protobuf) et SIRI Lite VehicleMonitoring |
| `src/server/static/` | téléchargement, lecture ZIP/CSV en flux, index GTFS compact (typed arrays) |
| `src/server/engine/` | moteur d'ingestion, croisement temps réel ↔ théorique, historique, géocodage inverse |
| `src/app/api/` | API REST + flux SSE |
| `src/components/radar/` | interface (carte, panneaux, fiche véhicule) |
| `src/components/landing/` | page d'accueil (en-tête, îlots temps réel) |
| `src/lib/` | types partagés, store client, utilitaires |
| `config/` | rattachements manuels d'exploitants (avec preuve), sources à identifiants |
| `db/schema.sql` | schéma PostGIS de l'historique (optionnel) |

### Règles de fidélité aux données

| Information | D'où elle vient | Si absente |
|---|---|---|
| Position, horodatage | flux GTFS-RT (`timestamp` véhicule, sinon en-tête du flux — signalé) | véhicule ignoré |
| Cap | flux ; sinon calculé entre deux positions **réellement reçues** (> 15 m), marqué « calculé » | icône ronde sans direction |
| Vitesse, n° de véhicule, immatriculation, affluence | flux | « Non fourni par la source » |
| Ligne, couleur, destination, mode | GTFS statique via `trip_id` / `route_id` | « sans ligne », « Destination non fournie » |
| Progression, prochain arrêt | `current_stop_sequence` / `stop_id` du flux, ou TripUpdates — base indiquée | non affichés |
| Retard | TripUpdates uniquement | non affiché |
| Prochains passages | GTFS (« théorique ») + TripUpdates (« temps réel »), toujours distingués | — |
| Groupe exploitant (Keolis, Transdev…) | nom présent dans les données (éditeur, AOM, `agency_name`) ou `config/operator-overrides.json` avec preuve | non attribué |
| Région / département | catalogue ; sinon géocodage inverse IGN (base indiquée) | filtre indisponible pour la source |

Statuts de source : **En direct** (positions < 3 min) · **Retard de mise à jour** · **Hors ligne** (erreurs) · **Statique** (pas de flux de positions) · **Clé requise**.

### Performance

- Mémoire serveur : ~150 Mo au démarrage, ~500 Mo avec ~85 GTFS chargés (seuls les horaires des courses d'hier/aujourd'hui/demain sont conservés, en typed arrays).
- Carte : clusters MapLibre sous le zoom 11 ; au-delà, couche non clusterisée limitée à la vue (+25 %) et animée (interpolation 2,2 s entre deux positions reçues, jamais au-delà).
- Flux SSE : instantané (~750 Ko) puis deltas par connexion (véhicules modifiés + clés supprimées) ; ~20 Ko/s par client pour ~1 600 véhicules mesurés en soirée.

---

## Déploiement

Le moteur d'ingestion est un processus **continu** (interrogation toutes les 20 s, état en mémoire). Il doit tourner sur une plateforme qui garde le serveur actif — pas sur des fonctions serverless.

**Option A — tout-en-un (recommandée)** : conteneur Docker sur Railway, Fly.io, Render, Scaleway, un VPS…

```bash
docker build -t bus-radar .
docker run -p 3000:3000 -v busradar-data:/data bus-radar
```

Prévoir ~1 Go de RAM. Une seule instance (l'état est en mémoire). Healthcheck : `GET /api/health`.

**Option B — frontend sur Vercel, backend séparé** : déployer l'image Docker comme backend avec `CORS_ORIGIN=https://<frontend>`, et le même dépôt sur Vercel avec `NEXT_PUBLIC_API_BASE=https://<backend>` et `ENGINE_AUTOSTART=false` (les API du déploiement Vercel ne sont alors pas utilisées).

**Historique persistant** : créer une base PostgreSQL + PostGIS, appliquer `db/schema.sql`, définir `DATABASE_URL`.

---

## État d'avancement

### Fonctionnel et vérifié sur données réelles

- Découverte automatique des flux via le catalogue national ; audit reproductible.
- Ingestion GTFS-RT VehiclePositions + TripUpdates : ~170 flux, ~80 réseaux avec véhicules, ~1 700 à 2 500 véhicules en soirée.
- Gestion d'erreurs : timeouts, backoff, HTTP 429, flux illisibles, sources hors ligne signalées.
- Import GTFS statique (lignes, courses, arrêts, horaires, tracés) et enrichissement des véhicules (~94 % rattachés à une ligne).
- Carte : clusters, icônes orientées et colorées par ligne, animation, sélection, suivi, tracé de la course, historique enregistré.
- Panneau Explorer : Véhicules (vue courante), Réseaux (sélection multiple, tout/aucun, recherche, groupes, région, département, catégorie, modes), Lignes (tracé, terminus, véhicules en circulation), Arrêts (prochains passages réels/théoriques).
- Recherche globale : villes, réseaux, lignes, arrêts, véhicules, destinations.
- Statistiques en direct issues du backend ; thème clair/sombre ; responsive (tiroir mobile).
- Build de production et flux SSE vérifiés avec `next start`.

### Implémenté mais non testé faute d'environnement

- Persistance PostgreSQL/PostGIS de l'historique (`DATABASE_URL`) — aucune base disponible pendant le développement.
- Connecteur SIRI Lite VehicleMonitoring — testé sur un échantillon, pas sur un flux réel.
- `Dockerfile` — Docker indisponible sur la machine de développement.

### Reste à faire / pistes

- Sources à identifiants : obtenir les accès (PRIM, Grand Lyon, CTS, AMP…) et **vérifier qu'elles contiennent des positions** — à ce jour, aucune position publique n'a été trouvée pour Paris, Lyon, Strasbourg, Toulouse, Lille.
- Abonnement SSE par emprise géographique (réduire la bande passante mobile).
- Mise à l'échelle horizontale : externaliser l'état (Redis) et séparer le moteur dans un worker dédié.
- Fonctionnalités prévues après fiabilisation des données : favoris, comptes, alertes de proximité, perturbations (les entités GTFS-RT Alerts sont reçues et comptées, leur contenu reste à exploiter), statistiques par réseau/région, comparaison de réseaux.
