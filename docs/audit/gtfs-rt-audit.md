# Audit des flux GTFS-RT — 02/11/2026 20:13:07

Source : catalogue transport.data.gouv.fr (490 jeux de transport public exploitables, 223 avec GTFS-RT).

| Indicateur | Valeur |
|---|---|
| Flux GTFS-RT interrogés | 384 |
| Flux joignables et décodables | 376 |
| Flux contenant des positions de véhicules | 97 |
| Flux avec positions < 3 min | 89 |
| Véhicules positionnés (total) | 3366 |
| Véhicules avec position < 3 min | 2519 |
| … avec cap (bearing) | 2962 |
| … avec vitesse | 1510 |
| … rattachés à une course (trip_id) | 3174 |
| Positions rejetées (invalides) | 2 |

## Erreurs

- Protobuf invalide : missing required 'header' : 3
- HTTP 429 : 2
- HTTP 403 : 1
- Protobuf invalide : invalid end group tag : 1
- HTTP 502 : 1

## Flux avec positions (triés par nombre de véhicules frais)

| Source | Éditeur | Véhicules | < 3 min | Cap | Vitesse | trip_id | Âge en-tête |
|---|---|---:|---:|---:|---:|---:|---:|
| Réseau urbain et scolaire TBM | Bordeaux Métropole | 326 | 298 | 326 | 326 | 326 | 13 s |
| Réseau urbain STAR | STAR | 135 | 135 | 135 | 135 | 135 | -2 s |
| Réseau urbain Lignes d'Azur | Métropole Nice Côte d'Azur | 239 | 128 | 239 | 0 | 239 | 10 s |
| Réseau urbain TaM | Montpellier Méditerranée Métropole | 128 | 124 | 128 | 128 | 128 | 41 s |
| Réseau urbain Bibus | Brest métropole | 121 | 121 | 121 | 0 | 121 | 14 s |
| Réseau urbain Astuce | Métropole Rouen Normandie | 139 | 119 | 139 | 0 | 127 | 0 s |
| Agrégat des réseaux urbains et interurbains de Normandie | Syndicat mixte Atoumod | 144 | 114 | 137 | 0 | 144 | -77 s |
| Réseau urbain Astuce | Métropole Rouen Normandie | 112 | 107 | 112 | 0 | 112 | -10 s |
| Réseau urbain Mistral | Métropole Toulon Provence Méditerranée | 102 | 98 | 102 | 102 | 85 | 96 s |
| Réseau urbain Irigo | Angers Loire Métropole | 278 | 77 | 278 | 0 | 278 | 38 s |
| Réseau urbain et périurbain Fil Bleu | Tours Métropole Val de Loire | 85 | 77 | 85 | 0 | 14 | 117 s |
| Réseau urbain DiviaMobilités | DiviaMobilités | 74 | 74 | 74 | 74 | 63 | 6 s |
| Réseau urbain SETRAM | SETRAM | 69 | 69 | 69 | 69 | 52 | -179 s |
| Réseau urbain Orizo | Grand Avignon | 69 | 60 | 60 | 0 | 69 | 16 s |
| Réseau urbain Le Met' | Eurométropole de Metz | 58 | 58 | 58 | 58 | 58 | 29 s |
| Réseau urbain LiA | Réseau de transport en commun Le Havre Seine Métropole LiA | 59 | 57 | 59 | 59 | 59 | 5 s |
| Réseau urbain LiA | Réseau de transport en commun Le Havre Seine Métropole LiA | 59 | 57 | 59 | 59 | 59 | 5 s |
| Réseau interurbain liO Occitanie | Région Occitanie / Pyrénées Méditerranée | 49 | 46 | 43 | 49 | 49 | -5 s |
| Réseau urbain Ametis | Ametis | 46 | 44 | 46 | 46 | 38 | 17 s |
| Réseau urbain Tango | Tango | 44 | 43 | 44 | 44 | 44 | 34 s |
| Réseau urbain Tango | Tango | 42 | 41 | 42 | 42 | 42 | 3 s |
| Réseau urbain Palmbus | Palmbus | 40 | 40 | 40 | 40 | 40 | 45 s |
| Réseau urbain DK'BUS | Communauté Urbaine de Dunkerque / Réseau Dk Bus | 48 | 39 | 0 | 0 | 24 | -5 s |
| Réseau urbain Transvilles | Syndicat Intercommunal de Mobilité et d'Organisation Urbaine du Valenciennois | 87 | 38 | 87 | 0 | 87 | 6 s |
| Réseau urbain Citéa | Valence Romans Mobilités | 40 | 38 | 40 | 40 | 40 | 24 s |
| Réseau urbain Cap Cotentin | Communauté d'agglomération Le Cotentin | 28 | 28 | 28 | 28 | 28 | -3 s |
| Réseau urbain Agglobus | Communauté d’Agglomération du Centre Littoral de Guyane | 26 | 23 | 18 | 26 | 26 | 17 s |
| Réseau urbain Sète Agglopole Mobilité | Sète Agglopole Méditerranée | 51 | 22 | 51 | 0 | 24 | 2 s |
| Réseau interurbain Aléop - Pays de la Loire | Région des Pays de la Loire | 22 | 21 | 16 | 16 | 21 | 0 s |
| Réseau urbain beeMob | Réseau beeMob - Transports en commun de l'Agglomération Béziers Méditerranée | 19 | 17 | 19 | 0 | 19 | -5 s |
| Réseau urbain Tempo Bus | Tempo Bus | 16 | 16 | 16 | 16 | 16 | 1 s |
| Réseau urbain TCAT | TCAT - Transports en Commun de l'Agglomération Troyenne | 16 | 15 | 16 | 16 | 16 | 23 s |
| Réseau urbain AXO | Oise Mobilité - Syndicat mixte des transports collectifs de l'Oise | 17 | 15 | 17 | 0 | 17 | -27 s |
| Réseau interurbain Rémi | JVMALIN | 33 | 14 | 33 | 33 | 33 | 3 s |
| Réseau urbain Citibus | Le Grand Narbonne Communauté d'Agglomération | 13 | 13 | 13 | 13 | 13 | -5 s |
| Réseau urbain Kicéo | Transdev GMVA Mobilités • Kicéo | 12 | 12 | 0 | 0 | 12 | 4 s |
| Réseau urbain Kicéo | Transdev GMVA Mobilités • Kicéo | 12 | 12 | 0 | 0 | 12 | 4 s |
| Réseau urbain Ruban | Communauté d'agglomération Porte de l'Isère | 12 | 12 | 12 | 12 | 12 | 2 s |
| Réseau urbain Corolis | Oise Mobilité - Syndicat mixte des transports collectifs de l'Oise | 14 | 12 | 14 | 0 | 14 | -29 s |
| Réseau urbain MAT | Transdev SMA Mobilités • MAT | 11 | 11 | 0 | 0 | 11 | 5 s |
| Réseau urbain TIC | Oise Mobilité - Syndicat mixte des transports collectifs de l'Oise | 13 | 11 | 13 | 0 | 13 | -43 s |
| Réseau urbain Zest | Keolis Menton Riviera | 12 | 11 | 12 | 0 | 12 | 2 s |
| Réseau urbain Filibus | Filibus - Chartres Métropole Transports | 27 | 9 | 27 | 0 | 27 | -5 s |
| Réseau urbain L'va | Vienne Condrieu Agglomération | 9 | 9 | 9 | 9 | 9 | -5 s |
| Réseau urbain Chamonix | Transdev Chamonix | 9 | 8 | 9 | 9 | 9 | 2 s |
| Réseau urbain Azalys | JVMALIN | 7 | 7 | 7 | 6 | 7 | 20 s |
| Réseau urbain Ritmo | Zenbus | 10 | 7 | 0 | 0 | 10 | -5 s |
| Réseau urbain Rubis | Grand Bourg Agglomération | 6 | 6 | 6 | 6 | 6 | 8 s |
| Réseau urbain Transurbain | Syndicat mixte Atoumod | 6 | 6 | 6 | 0 | 6 | -58 s |
| Réseau urbain TOHM | Oise Mobilité - Syndicat mixte des transports collectifs de l'Oise | 6 | 6 | 6 | 0 | 6 | -41 s |
| Réseau urbain Le Bus | Estérel Côte d'Azur Agglomération | 5 | 5 | 5 | 5 | 5 | 4 s |
| Réseau urbain Mouvéo | Communauté d'Agglomération du Pays de Saint-Omer | 6 | 5 | 6 | 6 | 6 | 7 s |
| Réseau urbain Qub | Quimper Bretagne Occidentale | 5 | 5 | 5 | 0 | 5 | -5 s |
| Réseau urbain Transp’Or | Transp'Or - Pays de l'Or Agglomération | 5 | 5 | 5 | 5 | 5 | 16 s |
| Réseau urbain de la zone Centre (CACEM) | Martinique Transport | 5 | 4 | 5 | 5 | 5 | 10 s |
| Réseau urbain TLP | TLP Mobilités | 8 | 4 | 0 | 0 | 8 | -6 s |
| Réseau urbain Linead | JVMALIN | 4 | 4 | 4 | 0 | 0 | -5 s |
| Réseau urbain RTCA | Carcassonne Agglo | 4 | 4 | 4 | 4 | 4 | 19 s |
| Réseau urbain TEDbus | Dracénie Provence Verdon agglomération | 4 | 4 | 4 | 4 | 4 | 5 s |
| Réseau urbain Hop Bus | Coeur de Flandre Agglo | 4 | 4 | 0 | 0 | 4 | -3 s |
| Réseau urbain Vitobus | VITRE COMMUNAUTE | 5 | 4 | 4 | 0 | 5 | -5 s |
| Réseau urbain et scolaire Lila Presqu'ile | Transdev CapAtlantique Mobilités • Lila | 4 | 4 | 0 | 0 | 4 | 7 s |
| Réseau urbain et scolaire Lila Presqu'ile | Transdev CapAtlantique Mobilités • Lila | 4 | 4 | 0 | 0 | 4 | 7 s |
| Réseau urbain Cap’Bus | Communauté d'Agglomération Hérault Méditerranée | 3 | 3 | 0 | 0 | 3 | -5 s |
| Réseau urbain Titus | Zenbus | 3 | 3 | 0 | 0 | 3 | -5 s |
| Réseau urbain et interurbain Aire’MOB | Oise Mobilité - Syndicat mixte des transports collectifs de l'Oise | 3 | 3 | 3 | 0 | 3 | -27 s |
| Réseau urbain Artis | Communauté Urbaine d'Arras | 2 | 2 | 2 | 2 | 2 | 2 s |
| Réseau urbain et scolaire Guingamp-Paimpol Mobilité | Armor Argoat Mobilité • Guingamp-Paimpol Mobilité | 2 | 2 | 1 | 2 | 2 | -1 s |
| Réseau urbain Astrobus | Syndicat mixte Atoumod | 2 | 2 | 0 | 0 | 2 | -75 s |
| Réseau urbain Move | Alliance Atlantique | 2 | 2 | 2 | 2 | 2 | -2 s |
| Réseau urbain Le Bus | Oise Mobilité - Syndicat mixte des transports collectifs de l'Oise | 2 | 2 | 2 | 0 | 2 | -31 s |
| Réseau urbain Jybus | J'ybus | 2 | 2 | 2 | 2 | 2 | 7 s |
| Navette Aéroport de Bordeaux | Zenbus | 1 | 1 | 0 | 0 | 1 | -6 s |
| Réseau urbain de la zone Sud (CAESM) | Martinique Transport | 1 | 1 | 1 | 1 | 1 | -2 s |
| Réseau urbain Glazgo | Auray Quiberon Terre Atlantique | 1 | 1 | 1 | 1 | 1 | 3 s |
| Réseau urbain Envia | ENVIA | 2 | 1 | 2 | 2 | 2 | 15 s |
| Réseau urbain Montelibus | Montélibus | 2 | 1 | 2 | 0 | 2 | 0 s |
| Réseau urbain Aléo | ALEO | 1 | 1 | 1 | 1 | 1 | 0 s |
| Réseau urbain TGL | Transport du Grand Longwy | 1 | 1 | 1 | 1 | 1 | -2 s |
| Réseau urbain Buss | Zenbus | 2 | 1 | 0 | 0 | 2 | -6 s |
| Réseau urbain Grandole Mobilités | Communauté d'Agglomération du Grand Dole | 2 | 1 | 2 | 0 | 2 | 0 s |
| Réseau urbain TCVO | Communauté de Communes du Pays d'Orange en Provence | 2 | 1 | 1 | 2 | 2 | 4 s |
| Réseau urbain Tout'enbus | Tout'enbus | 1 | 1 | 0 | 0 | 1 | -4 s |
| Réseau urbain Lunéo | Lulu en Bus (Ex. Lunéo) | 1 | 1 | 1 | 1 | 1 | -4 s |
| Réseau urbain Alliance | Communauté d'agglomération Grand Auch Coeur de Gascogne  | 1 | 1 | 0 | 0 | 1 | -6 s |
| Réseau urbain Ficibus | Syndicat mixte Atoumod | 1 | 1 | 1 | 0 | 1 | -5 s |
| Réseau urbain Lib'Bus | Oise Mobilité - Syndicat mixte des transports collectifs de l'Oise | 1 | 1 | 1 | 0 | 1 | -36 s |
| Réseau urbain et TAD zonal Libellule | Oise Mobilité - Syndicat mixte des transports collectifs de l'Oise | 1 | 1 | 1 | 0 | 1 | -35 s |
| Réseau urbain CVL Mobilité | Communauté de Communes Chinon Vienne et Loire | 2 | 1 | 2 | 2 | 2 | 1 s |
| Réseau européen AVE Renfe | RENFE VIAJEROS SOCIEDAD MERCANTIL ESTATAL SA | 230 | 0 | 0 | 0 | 230 | 3602 s |
| Réseau interurbain Fluo Grand-Est - Haut-Rhin (68) | Fluo Grand Est | 8 | 0 | 8 | 0 | 8 | 129 s |
| Réseau urbain Alesy | Syndicat Mixte du Bassin d'Alès - Réseau Ales'Y | 1 | 0 | 1 | 1 | 1 | 12 s |
| Réseau interurbain TIC | Oise Mobilité - Syndicat mixte des transports collectifs de l'Oise | 1 | 0 | 1 | 0 | 1 | -43 s |
| Réseau urbain SNgo! | Syndicat mixte Atoumod | 4 | 0 | 0 | 0 | 4 | 181 s |
| Réseau urbain Forbus | Fluo Grand Est | 9 | 0 | 5 | 0 | 9 | 47 s |
| Réseau urbain RLV Mobilités | Keolis RIOM | 1 | 0 | 1 | 0 | 1 | 0 s |
| Réseau urbain DeepMob | Syndicat mixte Atoumod | 5 | 0 | 4 | 0 | 5 | 193 s |
