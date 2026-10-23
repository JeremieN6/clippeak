# CLAUDE.md -- Memoire Projet

> Ce fichier est lu automatiquement par l'IA au debut de chaque conversation.
> Mets-le a jour a la fin de chaque session de travail.

---

## Objectif Final
Livrer Clippeak V1: landing page Nuxt interactive avec simulation complete du flow de clipping Twitch, collecte de feedbacks et vue admin de pilotage.

---

## Stack Technique
- Nuxt 4.4.8 (Vue 3.5) -- initialise a l'origine en Nuxt 3, migre depuis
- Tailwind CSS (@nuxtjs/tailwindcss)
- Prisma ORM 6.15.0 (@prisma/client 6.15.0)
- PostgreSQL (Neon)
- Zod pour la validation des payloads API
- nuxt-posthog (module officiel) pour l'analytics produit
- Deploiement : GitHub Actions -> SSH vers VPS -> pm2 (voir `.github/workflows/`)

---

## Etat Actuel du Projet
**Phase** : V1 (landing + simulation) en production ; V2 (vrai pipeline de clipping) en construction
**Derniere session** : 2026-10-23
**Progression globale** : V1 ~95% ; V2 fondations posees (voir section V2)

### Ce qui est fait :
- [x] Configuration MCP memoire
- [x] Initialisation Nuxt + Tailwind + Prisma
- [x] Landing page Clippeak V1 (hero + validation URL Twitch), refactoree en composants par section
- [x] Flow fake processing (~58s) avec progression, etapes et estimation
- [x] Generation ZIP beta telechargeable (README inclus)
- [x] Formulaire feedback integre au parcours /try-now (pas de gating sur le CTA de telechargement)
- [x] API POST /api/feedback + GET /api/admin/feedback
- [x] Page /admin protegee par mot de passe + metriques + tableau
- [x] Migration Prisma appliquee et insert reel de feedback verifie (voir tasks/lessons.md, 2026-07-02) -- regeneration du client Prisma necessaire apres toute migration
- [x] Suppression du champ redondant `zip_par_mail` (front + API + schema + migration dediee)
- [x] Build de production valide
- [x] Pipeline de deploiement continu (GitHub Actions -> VPS via SSH -> pm2) sur push vers `main`
- [x] Integration PostHog (nuxt-posthog) pour le tracking produit

### V2 en cours -- vrai pipeline de clipping (demarree 2026-10-23)
Brief complet : `BRIEF-V2.md`. Prises de position et leviers : `PRISE-DE-POSITION.md`.
Direction : passer de la simulation a un pipeline reel, inspire d'un workflow de streamer (Claude + VODs Twitch + chat). Etapes cibles : 1 VODs via API Twitch (liens, pas de telechargement par le streamer) -> 2 moments forts (pics de chat + transcription) -> 3 coupe verticale 1080x1920, duree parametrable -> 4 streamer toujours cadre (reconnaissance par photos) -> 5 montage (DA parametrable en back-office) -> 6 illustrations (dossier de B-roll du streamer) -> 7 controle qualite + legende -> 8 production par lots de 4, validation humaine obligatoire, rien publie sans accord.
- [x] Module `server/utils/clipping/chatPeaks.ts` : detection de pics de chat (debit robuste median/MAD + mots-cles definis par le streamer + messages en majuscules), score /10, pre-roll avant le pic. Tests : `npm test` (node:test, 25 tests au total). Node >= 22.18 requis ; en 22.14 : `NODE_OPTIONS=--experimental-strip-types npm test`.
- [x] Source de donnees chat : GraphQL non officiel de Twitch (l'API officielle ne fournit pas le chat des VODs). Decision du 2026-10-23. Risque : endpoint non documente, peut changer -> isoler dans un seul client, fixtures de test.
- [x] Schema Prisma V2 + migration `202610231200_v2_pipeline_foundation` (Channel, StreamerSettings, Vod, Moment, ClipJob), additive, APPLIQUEE sur Neon le 2026-10-23 (a la main via l'interface Neon : pas de table `_prisma_migrations`, donc `migrate deploy` echouerait tant qu'on n'a pas fait `prisma migrate resolve --applied` pour les 3 migrations). Pas encore de modele utilisateur/auth : un Channel = un streamer.
- [x] Client chat `server/utils/clipping/twitchChat.ts` : pagination par OFFSET (le curseur declenche "failed integrity check" des la page 2 : jeton Client-Integrity requis), offset de depart >= 3 s (Twitch renvoie une liste vide pour 0-2 s sur une VOD en cours), dedoublonnage, reprise a un offset (analyse incrementale pendant le live), erreurs typees (http/graphql/shape/limit). Sortie compatible `chatPeaks`. 9 tests dont la forme reelle de reponse (anonymisee). VERIFIE contre le vrai Twitch le 2026-10-23 : VOD de 4 h = 145 pages, 6 270 messages, 50 pics ; hash de requete et client-id toujours valides. Les tests utilisent `node --test` : pas de "parameter properties" TypeScript (non supportees par le strip-types de Node).
- [x] Detection automatique de la VOD (code + 9 tests ; VERIFIE en reel le 2026-10-23 sur la prod, voir ci-dessous) : `twitchApi.ts` (jeton d'application, users, videos, abonnements EventSub), `eventsub.ts` (signature HMAC, anti-rejeu, deduplication), `vodSync.ts` (stream.online -> trouve la VOD par `stream_id` avec nouvelles tentatives ; stream.offline -> rattrapage + statut `ended`), `prismaVodStore.ts`, routes `POST /api/twitch/eventsub` (reception, reponse rapide, travail en arriere-plan) et `POST /api/admin/twitch/channels` (en-tete `x-admin-password`, enregistre un streamer et s'abonne). Variables : `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_EVENTSUB_SECRET`, `TWITCH_EVENTSUB_CALLBACK_URL` (voir `.env.example`).
- [x] Verifie en reel le 2026-10-23 (live de test de jeremfut7, VOD 2908665744) : (1) OUI, la VOD en cours apparait dans `/helix/videos?type=archive` avec `stream_id` ; (2) OUI, le chat GraphQL repond sur la VOD en cours (offset >= 3 s) ; (3) migration V2 appliquee sur Neon ; (4) EventSub sur le VPS : abonnements `stream.online`/`stream.offline` actifs, VOD creee en base au debut du live (statut `live`), passee a `ended` (ended_at renseigne) a l'arret, sans intervention. Chaine jeremfut7 enregistree en prod (Channel en base).
- [ ] Connexion Twitch du streamer (OAuth, redirection deja declaree dans l'app) : pas necessaire pour VODs publiques + EventSub + chat ; a ajouter pour VODs reservees aux abonnes, ou si on veut un compte streamer dans le back-office.
- [ ] Rattrapage periodique (polling) si une notification est perdue : non ecrit.
- [ ] Objectif produit : le clipping demarre a la fin du stream, voire pendant. Prevoir l'analyse incrementale du chat.
- [ ] Economie : detecter les pics via le chat d'abord, puis ne transcrire que ~60 s autour de chaque pic (pas la VOD entiere) ; transcription integrale seulement pour la voie "banque de clips" quand le chat est calme.
- [ ] Audio seul des VODs (yt-dlp/streamlink, ~dizaines de Mo par heure) cote serveur, jamais cote streamer ; transcription (Whisper ou API) a choisir.
- [ ] Banque de clips de reference : stats via API Twitch Clips (vues) et YouTube Data API ; Meta/TikTok jugees inaccessibles via app approuvee -> hors perimetre V2.
- [x] Infra : rendu sur le VPS existant (decision du porteur, pas d'alternative peu couteuse connue). Consequences : file d'attente avec un seul rendu a la fois, ffmpeg `nice` + preset rapide, process worker separe du serveur Nuxt (pm2) pour ne pas bloquer le site, lots de 4 clips. Revoir si la charge CPU gene le site.

### Prochaines etapes :
- [ ] Reconfirmer que la connectivite Neon reste stable en environnement de dev (un probleme P1001 avait ete rencontre le 2026-07-01 ; reconfirme OK le 2026-10-23 : lectures et schema V2 accessibles depuis le poste local)
- [ ] Verifier que les secrets de deploiement (SSH_PRIVATE_KEY, VPS_HOST, VPS_USER) et les variables PostHog sont bien configures cote GitHub/VPS
- [ ] Continuer a affiner le tracking des evenements PostHog sur le parcours /try-now

---

## Blocages et Points d'Attention
- Blocage historique (2026-07-01) : connexion Neon indisponible depuis l'environnement de dev lors de la migration Prisma (erreur P1001). D'apres `tasks/lessons.md`, un insert de feedback a ete teste avec succes le lendemain (2026-07-02) apres regeneration du client Prisma -- le blocage semble donc leve, mais ce n'est pas reconfirme explicitement dans une session posterieure. A verifier au demarrage de la prochaine session avant de considerer le sujet clos.
- Sur Windows, le moteur Prisma genere dans `node_modules` peut rester verrouille par un processus Node actif : toujours arreter les process avant de regenerer le client apres une modif de `schema.prisma`.

---

## Decisions Prises
> Les prises de position avec leur levier d'action sont dans `PRISE-DE-POSITION.md` (a relire avant de remettre une decision en cause).

| Date | Decision | Raison |
|------|----------|--------|
| 2026-07-01 | Utiliser Prisma 6.15.0 au lieu de Prisma 7 | Prisma 7 change le workflow datasource/config et complexifie inutilement la V1 |
| 2026-07-02 | Le formulaire de feedback reste facultatif, sans verrouillage du CTA de telechargement | Un gating obligatoire cassait la fluidite du parcours try-now ; on privilegie une conversion volontaire a forte intention plutot qu'une barriere de sortie |
| 2026-07-02 | Suppression du champ `zip_par_mail` du schema Feedback | Redondant avec la question plus complete sur la plateforme de reception ; une seule question source de verite |
| 2026-07-02 | Deploiement continu via GitHub Actions + SSH + pm2 vers un VPS (plutot qu'une plateforme managee type Vercel) | Choix d'infra pour garder le controle du serveur (`/srv/saas/clippeak`) |
| 2026-10-23 | Lancer la V2 (vrai pipeline) sans analyser d'abord les feedbacks de la landing | Decision du porteur : signal terrain juge suffisant (voir STORY.md). Ne pas re-proposer d'analyser les retours avant de construire. |
| 2026-10-23 | Premier module V2 = detection de pics de chat, pure et testable, sans dependance | Verifiable sans credentials Twitch ni infra ; mots-cles configurables car le streamer connait sa communaute |
| 2026-10-23 | Chat via GraphQL Twitch ; lien de VOD manuel seulement en option ; recuperation automatique de la VOD, clipping a la fin du stream voire pendant | Le streamer ne doit rien faire ; objectif d'autonomie du bot |
| 2026-10-23 | Rendu video sur le VPS existant | Seule option peu couteuse connue du porteur |
| 2026-10-23 | Une seule application Twitch Clippeak pour tous les streamers (jeton d'application, pas d'OAuth streamer en V2) | Voir `PRISE-DE-POSITION.md` |
| 2026-10-23 | Chat calme => pas de clip issu du chat ; la banque de clips de reference doit alors prendre le relais | Le chat et la banque sont deux sources independantes, aucune n'est obligatoire seule |

---

## Notes de Session
> Ajouter ici un resume a la fin de chaque session de travail.

- **2026-07-01** : Scaffold Nuxt realise (initialise en Nuxt 3, depuis mis a jour vers 4.4.8) et UI V1 implementee selon brief. APIs feedback/admin implementees et build valide. Migration SQL versionnee dans prisma/migrations, connectivite Neon en echec en fin de session (P1001).
- **2026-07-02** : Refactor complet de la landing en composants par section (la premiere version etait un monolithe non conforme au brief). Integration du feedback dans le parcours /try-now avec emission d'un evenement de fin. Retrait du gating sur le CTA de telechargement. Suppression du champ redondant `zip_par_mail` (front + API + schema + migration). Migration Prisma testee avec un insert reel reussi apres regeneration du client. Cinq lecons documentees dans tasks/lessons.md.
- **2026-07-02** : Ajout d'un workflow GitHub Actions de deploiement continu vers un VPS (SSH + pm2) sur push vers `main`.
- **2026-07-06** : Integration du module `nuxt-posthog` pour le tracking analytics, avec un plugin dedie pour enregistrer le nom de l'app.
- **2026-07-31** : Correction de la description dans `LandingHero` pour mentionner YouTube Shorts en plus de Twitch.
- **2026-10-23** : Cadrage de la V2 a partir du brief du porteur (transcription d'un stream + captures). Ajout du module `chatPeaks` + tests + script `npm test`. Point technique releve : le chat des VODs n'est pas dans l'API Twitch officielle. Ajout du schema Prisma V2 (migration non appliquee). Les decisions GraphQL / VOD auto / VPS sont prises. Application Twitch `clippeak` creee (type Confidentiel) ; le porteur a place les cles dans `.env.local` SUR SON PC (`C:\Travail\Jeremiecode\Mes Projets Dev\Projets\ProjetPerso\Saas\clippeak`, Windows). Les noms de variables exacts n'ont pas ete verifies (fichier invisible depuis le cloud) : attendus `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_EVENTSUB_SECRET`, `TWITCH_EVENTSUB_CALLBACK_URL`. Jamais de valeur dans le depot ni dans une conversation. Pour la prod, les mettre aussi dans l'environnement du VPS. Pour lancer les commandes Prisma localement : `npm ci --ignore-scripts` puis `./node_modules/.bin/prisma ...` (un `npx prisma` sans install recupere une version 7 incompatible). Fichiers `tmp_*.html` a la racine : residus de verification, non touches.

- **2026-10-23 (suite)** : Ajout du client chat GraphQL, de la detection automatique des VODs (EventSub), de `PRISE-DE-POSITION.md` et `BRIEF-V2.md`. 22 tests (`npm test`, Node >= 22.18). Branche `claude/update-project-memory-rxeoln` fusionnee dans `main` (deploiement automatique declenche). Cette session tournait dans un conteneur cloud : elle ne voit pas le PC du porteur ni `.env.local`, et son reseau bloque Twitch (HTTP 403 du proxy) -> RIEN du code Twitch n'a ete execute contre le vrai service. Prochaine session = LOCALE, sur le PC du porteur : verifier en reel (voir "A verifier en reel").
- **2026-10-23 (session locale)** : verifications reelles de la V2. Cles Twitch OK, chat GraphQL verifie (correction : pagination par offset car le curseur exige un jeton d'integrite ; offset de depart >= 3 s), VOD en cours visible dans Helix avec `stream_id`, migration V2 appliquee sur Neon (a la main), EventSub valide de bout en bout sur le VPS (live -> VOD `live` -> arret -> `ended`). `TWITCH_EVENTSUB_SECRET` genere et copie dans `.env.local` local et VPS. Reste : polling de rattrapage, file d'attente + worker de rendu, audio + transcription autour des pics, coupe verticale. Incident : un `sed` a affiche des lignes de la cle SSH de `.env.local` (a regenerer par le porteur).

---

## Lecons Apprises
Voir `tasks/lessons.md` pour le detail des corrections et patterns a eviter (8 entrees a ce jour : voir le fichier).

---

## Regle de memoire narrative
Apres toute session impliquant une decision business, un pivot, un
changement de statut, ou un apprentissage terrain significatif (pas les
changements purement techniques), mettre a jour /STORY.md en
consequence, en plus des notes de session habituelles.
