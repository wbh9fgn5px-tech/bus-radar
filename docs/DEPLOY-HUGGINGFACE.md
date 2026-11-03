# Mettre Bus Radar en ligne gratuitement — Hugging Face Spaces

Le site complet (accueil, carte, API et moteur d'ingestion) tourne dans **un seul conteneur Docker**, hébergé gratuitement sur Hugging Face Spaces. Adresse finale : `https://<votre-identifiant>-bus-radar.hf.space`.

## 1. Créer le compte et le Space (5 min)

1. Créez un compte sur [huggingface.co](https://huggingface.co/join) (gratuit).
2. Cliquez sur **New Space** ([lien direct](https://huggingface.co/new-space)) :
   - **Space name** : `bus-radar`
   - **License** : au choix (ex. MIT)
   - **SDK** : **Docker** › modèle **Blank**
   - **Hardware** : **CPU basic · Free**
   - **Visibility** : **Public** (pour que tout le monde y ait accès)
3. Créez un jeton d'accès : avatar › **Settings** › **Access Tokens** › **Create new token**, type **Write**. Copiez-le (il sert de mot de passe à l'étape suivante ; ne le partagez pas).

## 2. Envoyer le projet

Dans un terminal ouvert **dans le dossier du projet** (`bus-radar-france`) :

```bash
git remote add space https://huggingface.co/spaces/<votre-identifiant>/bus-radar
```

```bash
git push --force space main
```

Identifiant : votre nom d'utilisateur Hugging Face. Mot de passe : **le jeton** créé à l'étape 1.3.
(`--force` remplace le README d'exemple créé avec le Space ; à n'utiliser que pour ce premier envoi.)

**Sans terminal :** dans le Space, onglet **Files** › **Add file** › **Upload files**, glissez le contenu du dossier du projet **sauf** `node_modules`, `.next`, `out` et `.data`.

## 3. Attendre la construction (5 à 10 min)

L'onglet **Logs** affiche la construction de l'image puis le démarrage. Quand le statut passe à **Running**, le site est en ligne. Les premiers bus apparaissent en quelques secondes ; les noms de lignes et destinations se complètent dans les deux minutes (import des horaires GTFS).

Vérification : `https://<votre-identifiant>-bus-radar.hf.space/api/health` doit répondre `"ok": true`.

## 4. Mettre à jour le site

Après une modification du code :

```bash
git add -A
```

```bash
git commit -m "Description de la modification"
```

```bash
git push space main
```

Le Space se reconstruit automatiquement.

## Ce qu'il faut savoir

- **Mise en veille** : sur l'offre gratuite, un Space sans visite pendant environ 48 h se met en veille. La visite suivante le réveille (environ 1 à 2 minutes avant que les bus réapparaissent). Les conditions exactes de l'offre gratuite sont sur [huggingface.co/pricing](https://huggingface.co/pricing).
- **Cache** : le disque du conteneur est temporaire. Le catalogue et les horaires sont retéléchargés à chaque redémarrage (automatique).
- **Une seule instance** : l'état est en mémoire ; ne dupliquez pas le Space pour « répartir la charge ».
- **Respect des producteurs** : l'intervalle d'interrogation (20 s) et le backoff restent actifs. Variables optionnelles : Space › **Settings** › **Variables and secrets** (voir `.env.example`).
- **Mentions** : les licences des données (Licence Ouverte, ODbL…) et les attributions OpenStreetMap / OpenFreeMap / IGN sont affichées sur le site ; gardez-les.

## Alternatives

- `netlify.toml` + `render.yaml` : pages sur Netlify et moteur sur Render (payant pour un moteur toujours actif).
- `Dockerfile` : utilisable tel quel sur Railway, Fly.io, Koyeb ou un serveur personnel (variable `PORT`).
