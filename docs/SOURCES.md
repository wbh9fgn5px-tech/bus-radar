# Sources de données — audit et conditions d'accès

> Audit réalisé le **2 novembre 2026 vers 20 h 15** (lundi soir) en interrogeant réellement chaque flux.
> Relancer à tout moment avec `npm run audit:sources`. Résultat détaillé : [`audit/gtfs-rt-audit.md`](audit/gtfs-rt-audit.md).

## 1. Source principale : Point d'Accès National transport.data.gouv.fr

| | |
|---|---|
| Point d'entrée | `https://transport.data.gouv.fr/api/datasets` (catalogue complet, JSON, sans clé) |
| Contenu utile | jeux « public-transit » : GTFS, GTFS-RT, SIRI, NeTEx ; éditeur, AOM, zones couvertes, licence |
| Licences rencontrées | Licence Ouverte v2.0, ODbL, Licence Mobilités (affichées pour chaque source dans l'interface) |
| Proxy | Beaucoup de flux GTFS-RT passent par `proxy.transport.data.gouv.fr`, qui mutualise les appels et protège les producteurs : l'application utilise l'URL proposée par le catalogue |
| Rafraîchissement | catalogue relu toutes les 6 h, cache disque en cas d'indisponibilité |

### Mesures de l'audit

| Indicateur | Valeur |
|---|---:|
| Jeux de transport public exploitables | 490 |
| … avec au moins un flux GTFS-RT | 223 |
| Flux GTFS-RT interrogés | 384 |
| Flux joignables et décodables | 376 |
| Flux contenant des positions de véhicules | 97 |
| Flux avec positions de moins de 3 min | 89 |
| Véhicules positionnés / dont < 3 min | 3 366 / 2 519 |
| Positions avec cap (bearing) | 2 962 |
| Positions avec vitesse | 1 510 |
| Positions rattachées à une course (`trip_id`) | 3 174 |
| Erreurs | 3 protobuf invalides, 2 × HTTP 429, 1 × HTTP 403 (TAG Grenoble) |

Constats ayant guidé l'architecture :

- **Doublons** : certains jeux publient le même flux sous deux URL (LiA, Kicéo, Lila…) et des agrégats régionaux (Normandie / Atoumod) republient les véhicules des réseaux locaux. → fusion par identifiant au sein d'une source, et masquage des doublons d'agrégat (< 30 m et < 90 s d'un véhicule local).
- **Horloges** : écarts producteurs de −3 min à +1 h (flux Renfe AVE horodaté 1 h dans le passé). → statut de fraîcheur systématique, positions > 15 min écartées.
- **Identifiants incohérents** : certains flux (ex. SETRAM Le Mans) ne fournissent ni ligne ni course reconnaissable dans le GTFS. → le véhicule est affiché « sans ligne », rien n'est deviné.
- **Grands réseaux sans positions publiques** (voir §3).

## 2. Réseaux effectivement couverts (positions GPS)

Environ 80 réseaux avec véhicules en circulation au moment de l'audit, dont : TBM (Bordeaux), STAR (Rennes), Lignes d'Azur (Nice), TaM (Montpellier), Bibus (Brest), Astuce (Rouen), réseaux normands (Atoumod), Mistral (Toulon), Irigo (Angers), Fil Bleu (Tours), Divia (Dijon), SETRAM (Le Mans), Orizo (Avignon), Le Met' (Metz), LiA (Le Havre), liO Occitanie, Ametis (Amiens), Tango (Nîmes), Palmbus (Cannes), DK'Bus (Dunkerque), Transvilles (Valenciennes), Citéa (Valence), réseaux de l'Oise (AXO, Corolis, TIC, TOHM…), Aléop (Pays de la Loire), Rémi (Centre-Val de Loire)… La liste exacte et à jour est dans l'onglet **Réseaux** de l'application.

## 3. Grands réseaux absents de la carte — pourquoi

Vérifié dans le catalogue national (ressources temps réel déclarées) :

| Réseau | Temps réel publié | Positions de véhicules ? |
|---|---|---|
| Île-de-France Mobilités / RATP | SIRI Lite « prochains passages » et messages (portail PRIM, **compte + clé API**) | **Non** publiées en open data à ce jour |
| TCL (Lyon) | SIRI Lite via data.grandlyon.com (**compte requis**) | Non trouvées |
| CTS (Strasbourg) | SIRI Lite (estimated-timetable, stop-monitoring…) avec **jeton** | Non |
| Tisséo (Toulouse) | GTFS-RT TripUpdates + Alerts | Non |
| Ilévia (Lille) | GTFS-RT TripUpdates, SIRI SM | Non |
| Naolib (Nantes) | SIRI, SIRI Lite, GTFS-RT TripUpdates | Non constatées dans le flux GTFS-RT |
| RTM / Métropole Aix-Marseille | SIRI (multiples exploitants), GTFS-RT Alerts | À vérifier après obtention d'un accès SIRI |
| TAG / M réso (Grenoble) | GTFS-RT (HTTP 403 lors de l'audit) | Inaccessible sans autorisation |
| FlixBus | GTFS-RT TripUpdates (Europe) | Non |
| BlaBlaCar Bus | SIRI Lite estimated-timetable | Non |
| SNCF (TER, cars TER) | SIRI Lite estimated-timetable, situation-exchange | Non (horaires temps réel uniquement) |

Ces réseaux apparaissent dans l'onglet Réseaux, section « Réseaux sans positions temps réel », avec le statut **Statique**. **Ils ne sont jamais présentés comme connectés.**

## 4. Activer une source à identifiants

1. Obtenir l'accès auprès du producteur (compte PRIM, jeton CTS, etc.) et vérifier que le flux contient bien des **positions** (SIRI VehicleMonitoring ou GTFS-RT VehiclePositions).
2. Ajouter une entrée dans `config/credentialed-sources.json` (modèle : `credentialed-sources.example.json`) — connecteurs disponibles : `gtfs-rt`, `siri-lite-vm`.
3. Définir la variable d'environnement nommée dans `auth.env`. Le secret n'apparaît ni dans le code, ni dans le fichier de config, ni dans les réponses API.

Sans la variable, la source s'affiche **« Clé requise »** et n'est pas interrogée.

> Le connecteur `siri-lite-vm` est testé sur un échantillon au format SIRI Lite, **pas encore contre un flux réel** (aucun identifiant disponible lors du développement).

## 5. Services annexes

| Service | Usage | Accès |
|---|---|---|
| Géoplateforme IGN `data.geopf.fr/geocodage` | recherche de villes ; département/région des réseaux sans zone déclarée | sans clé, appels via le serveur, mis en cache |
| OpenFreeMap (`tiles.openfreemap.org`) | fonds de carte vectoriels OpenStreetMap (positron / dark) | sans clé, usage production autorisé, attribution affichée |
| Code officiel géographique INSEE | départements → régions | table embarquée (`src/lib/geo-ref.ts`) |

## 6. Respect des producteurs

- Intervalle d'interrogation par défaut 20 s (plancher 10 s), étalement aléatoire au démarrage.
- Requêtes conditionnelles (`If-None-Match` / `If-Modified-Since`), taille max, timeout.
- Backoff exponentiel en cas d'erreur (jusqu'à 10 min), 2 min minimum après un HTTP 429.
- Un flux partagé par plusieurs jeux n'est interrogé qu'une fois.
- GTFS statiques mis en cache disque 24 h avec revalidation conditionnelle.
- `User-Agent` identifiable (`HTTP_USER_AGENT`).
