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
- [x] Coupe (`cutPlanner.ts`, `timeline.ts`) : accroche = debut de phrase, chute = derniere phrase terminee juste avant/apres le pic de chat (le chat reagit APRES la chute), silences internes retires (pause > 0,6 s ramenee a 0,2 s), duree minimale mesuree APRES retrait des silences, plafonnee par la duree max. Jamais de fin sur silence ou image figee (fin = dernier mot + 0,5 s). 6 tests.
- [x] Rendu vertical (`clipRender.ts`, `assBuilder.ts`) : 1080x1920, cadrage 9:16 centre sur le streamer (centre X/Y et zoom reglables ; PAS de reconnaissance automatique), zoom d'ouverture (zoompan), bande noire + titre 3 lignes max (police Lato par defaut, repli fontconfig), sous-titres mot par mot avec mots-cles en couleur, bruit de vent synthetise ou SFX du streamer, avatar/GIF a fenetres, illustrations en ecran scinde (illustration en haut, streamer en bas). ffmpeg 2 threads, priorite basse. VERIFIE en reel : rendu d'un clip d'une VOD publique (1080x1920, son/image synchronises a 10 ms, ~10 s de calcul) + 3 tests ffmpeg reels (synthetiques).
- [x] Controle qualite (`clipQc.ts`) : resolution, duree, synchro son/image (< 0,15 s), silences debut/fin, image figee en fin (freezedetect), titre (3 lignes, caracteres), noms propres a 1-2 fautes du dictionnaire du streamer (AVERTISSEMENT non bloquant). Un clip en echec QC n'est pas envoye en validation (statut `failed` + rapport). Legende + hashtags heuristiques (`caption.ts`). Verifie avec ffmpeg reel (silence et gel detectes).
- [x] Notation et analyse (`momentScoring.ts`, `vodAnalysis.ts`) : note locale (chat 60 % + contenu 40 %) ou par l'API Claude si `ANTHROPIC_API_KEY` (repli automatique sur la note locale). L'appel Claude n'a JAMAIS ete execute en reel (pas de cle) : teste avec des reponses simulees seulement. Un pic dont l'audio echoue est ignore ; chat calme => `chat_calm`.
- [x] Lots de 4 (`batching.ts`) : meilleurs clips d'abord, numeros continus ; lot pret quand plus rien n'est en file/rendu. Validation dans `/studio` ; approuver ne publie ni ne paie rien (statut `approved` seulement). Pas d'e-mail de notification (dependance a ajouter) : les lots apparaissent dans `/studio`.
- [x] Illustrations (`illustrations.ts`) : dossier du streamer (fichiers deposes dans `/studio`, tags + source), choix par mot-cle prononce (racines de 5 lettres), 2 par clip max, 4 s max, jamais pendant le zoom d'ouverture, source conservee dans `clip_jobs.illustrations`. Pas de recherche automatique de videos (decision : un dossier est plus fiable).
- [x] Banque de reference (`referenceClips.ts`) : API Twitch Clips (vues, categorie par jeu) -> sujets qui performent + performance par categorie ; ajuste la note des moments (+1,5 pt max, ponderation 0,85-1,15 par categorie). VERIFIE en reel sur une chaine publique (100 clips). YouTube non fait ; Meta/TikTok hors perimetre.
- [x] Back-office `/studio` (page + routes `/api/studio/*`) : lots a valider (lecteur video, approuver/refuser/refaire), direction artistique (zod), mots-cles et durees, depot de fichiers (extension + taille + octets magiques), banque de reference. Securite : mot de passe en en-tete (jamais dans l'URL), comparaison en temps constant, 10 echecs/min/IP, videos par URL signee 1 h, chemins bornes au dossier de donnees. VERIFIE sur un vrai serveur local (401/403/400/429, page 200) ; routes utilisant la base NON testees contre une base reelle.
- [x] Migration `202610241000_v2_clip_pipeline` (additive : colonnes nullables + 3 tables), generee hors ligne, NON APPLIQUEE sur Neon (`prisma migrate deploy` refuse par le classifieur de securite de l'environnement : a lancer par le porteur, commandes dans `DEPLOIEMENT-WORKER.md`). BASELINE FAITE le 2026-10-24 : `_prisma_migrations` existe sur Neon avec les 3 premieres migrations marquees appliquees (donnees verifiees intactes avant). Worker : preflight (attend si migration ou ffmpeg manquent : verifie en reel contre Neon, il n'ecrit rien), analyse des VODs `ended`, rendu des jobs. Mise en service : `DEPLOIEMENT-WORKER.md`.
- [x] Cadrage automatique du streamer (`framingDetect.ts`, `scripts/vision/`) : OpenCV YuNet (detection) + SFace (reconnaissance) sur 5 images du clip, comparees aux photos du streamer (seuil cosinus 0,363) ; mediane des positions -> centre et zoom (visage ~30 % de la hauteur, zoom max 3) ; moins de 2 reconnaissances -> cadrage manuel + avertissement QC `framing` (jamais quelqu'un d'autre au centre). Modeles verifies par SHA-256 (`models.json`, `download_models.py`). VERIFIE en reel : streamer retrouve (similarite 0,74 et 0,78), 4 images d'autres personnes jamais retenues (0,14-0,22), clip complet rendu avec cadrage automatique sur une facecam. Limite : une facecam minuscule est agrandie (flou). 7 tests. 3 a 5 photos suffisent ; sans photo, cadrage manuel.
- [x] Tests d'integration (`npm run test:integration`, `scripts/integration/`) : stores Prisma et routes `/api/studio/*` contre un Postgres jetable (PGlite) ou toutes les migrations sont rejouees (la nouvelle migration s'applique sans erreur sur un vrai moteur) ; vrai serveur Nitro ; rien n'est ecrit sur Neon.
- [x] Worker complet verifie de bout en bout (2026-10-24) : worker reel (bundle esbuild) + base jetable PGlite + VRAIE VOD publique francophone de 3 h 13 (chat, audio, video Twitch) + Whisper + ffmpeg. 1er passage : analyse en ~4 min (50 pics, 12 moments, 8 clips en file), 8 rendus ~10-15 s chacun, 5 en `review` (1080x1920, son/image synchronises), 3 refuses par le controle qualite : 1 vrai defaut (ecran fige : page de chat immobile en fin de clip, detecte a juste titre) et 2 defauts de MON code, corriges (titre a 4 lignes quand l'accroche etait longue ; duree montee 18,3 s < minimum 20 s). Voir tasks/lessons.md. Correctifs ensuite : titre ajuste par `fitTitle` (meme calcul pour rendu, titre par defaut et controle), prolongation de la fin du plan sur les phrases suivantes, pauses >= 0,5 s comme frontieres de phrase (Whisper ponctue peu), fenetre de transcription 65 s, reessais base (`dbRetry.ts`, erreurs de connexion Neon seulement). Resultat final : voir la ligne `Resultat du dernier passage` ci-dessous.
- [x] Resultat du dernier passage complet (2026-10-24, VOD publique francophone de 3 h 13) : analyse en ~4-5 min, 50 pics, 12 moments, 8 clips en file ; 8 traites, 6 prets pour validation (1080x1920, son/image synchronises) et 2 refuses pour de bonnes raisons : un ecran fige en fin de clip (vrai defaut du contenu) et `Pas assez de parole : 18,3 s pour un minimum de 20 s` (signale AVANT le rendu). Le reessai de base (`dbRetry`) a rattrape une coupure de connexion reelle pendant l'analyse. Limite du banc d'essai : PGlite n'accepte qu'une session, il devient injoignable apres un moment d'inactivite (le worker reessaie) ; la qualite visuelle des clips n'a ete jugee que sur quelques images.
- [ ] Pas fait : analyse PENDANT le live (seulement a la fin), e-mail de notification des lots, YouTube Data API, stockage des stats de clips produits. Constate : la VOD de test de jeremfut7 n'expose que l'audio cote Twitch (aucune variante video) : le rendu echouerait avec une erreur explicite ; les VODs de YassEncore sont `vod_manifest_restricted` (abonnes).
- [ ] Connexion Twitch du streamer (OAuth, redirection deja declaree dans l'app) : pas necessaire pour VODs publiques + EventSub + chat ; a ajouter pour VODs reservees aux abonnes, ou si on veut un compte streamer dans le back-office.
- [x] Rattrapage periodique (`vodCatchup.ts` + plugin Nitro `server/plugins/vodCatchup.ts`) : toutes les 300 s (`TWITCH_CATCHUP_INTERVAL_SEC`, min 60) et 30 s apres le demarrage, en production ou avec `TWITCH_CATCHUP=1`. Compare Helix (`/streams` par lots de 100 + `/videos`) a la base : enregistre les VODs manquantes, passe a `ended` celles restees `live`. Ne reprend jamais les VODs anterieures a la creation du Channel. 9 tests ; dry-run reel contre Twitch et Neon OK (rien a corriger dans l'etat reel ; scenario de notifications perdues simule : VOD et fin correctement reconstituees). NON observe en conditions reelles de perte de notification.
- [ ] Objectif produit : le clipping demarre a la fin du stream, voire pendant. Prevoir l'analyse incrementale du chat.
- [ ] Economie : detecter les pics via le chat d'abord, puis ne transcrire que ~60 s autour de chaque pic (pas la VOD entiere) ; transcription integrale seulement pour la voie "banque de clips" quand le chat est calme.
- [x] Audio + transcription autour des pics (decision du porteur : Whisper local, gratuit) : `vodPlaylist.ts` (jeton de lecture GraphQL + usher -> playlist HLS audio seule, sans yt-dlp), `audioWindow.ts` (ffmpeg `-ss/-t` sur la playlist, WAV 16 kHz mono, ~1,4 s pour 60 s), `whisperTranscribe.ts` + `scripts/whisper/transcribe.py` (faster-whisper, modele `small`, int8, francais, priorite basse), `peakTranscript.ts` (fenetre = 45 s avant / 15 s apres le pic, segments en temps de VOD, texte `beforePeak`). 10 tests. VERIFIE en reel le 2026-10-23 : PC local 16 coeurs, 60 s d'audio -> 8-9 s de Whisper, ~14 s au total par pic, francais fidele. Limites : (1) VODs restreintes (`vod_manifest_restricted`, ex. VOD 2904991396) inaccessibles sans connexion du streamer (levier OAuth) ; (2) vitesse NON mesuree sur le VPS (cœurs inconnus) ; (3) Python + `pip install faster-whisper` (venv) a installer sur le VPS, variables `WHISPER_PYTHON`, `WHISPER_MODEL`, `WHISPER_SCRIPT` ; premier lancement = telechargement du modele (~480 Mo) ; (4) pas encore branche au worker ni a la base (Moment sans texte).
- [ ] Banque de clips de reference : stats via API Twitch Clips (vues) et YouTube Data API ; Meta/TikTok jugees inaccessibles via app approuvee -> hors perimetre V2.
- [x] File d'attente et worker de rendu (`clipQueue.ts`, `prismaClipQueueStore.ts`, `ffmpegRunner.ts`, `server/worker/index.ts`) : la file est la table `clip_jobs` (claim atomique `FOR UPDATE SKIP LOCKED`, lots les plus anciens d'abord), un seul rendu a la fois, ffmpeg lance en priorite basse (verifie en reel : priorite lue = 19), rendus interrompus remis en file au demarrage. Bundle par `npm run build:worker` (esbuild epingle 0.28.1) vers `.output/worker/index.cjs`, lance par `ecosystem.worker.config.cjs` (pm2 `clippeak-worker`). 8 tests. NON branche au deploiement CI ni demarre sur le VPS (a faire a la main tant que `server/worker/render.ts` est un squelette qui echoue). SQL de claim, requeue, markReview et markFailed VERIFIES en reel sur Neon le 2026-10-23 dans une transaction annulee (ordre de claim attendu, rien de persiste).
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
- **2026-10-23 (rattrapage)** : ajout du polling de rattrapage des notifications EventSub (branche feat/vod-catchup-polling, empilee sur la PR #1). Tests : 34.
- **2026-10-23 (file de rendu)** : file d'attente + worker separe + lanceur ffmpeg en priorite basse (branche feat/render-queue-worker, empilee sur #2). Tests : 42. Vigilance : un worker qui interroge Neon en continu l'empeche de se mettre en veille (cout) ; intervalle de sondage a regler au demarrage reel.
- **2026-10-23 (transcription)** : audio HLS + Whisper local verifies de bout en bout (pics de chat -> fenetre audio -> texte avant le pic). Branche feat/peak-transcription, empilee sur #3. Tests : 52.
- **2026-10-24 (pipeline de clips)** : coupe, rendu vertical, DA, illustrations, controle qualite, lots de 4, back-office `/studio`, banque de reference, cadrage automatique par reconnaissance du visage, migration additive `202610241000` (NON appliquee), worker avec preflight, tests d'integration (`npm run test:integration`). 115 tests unitaires. Branches empilees : #1 #2 #3 puis feat/peak-transcription et feat/clip-pipeline. Mise en service : `DEPLOIEMENT-WORKER.md`. Secrets : aucune valeur affichee ; mot de passe de test jetable pour les essais locaux.

---

## Lecons Apprises
Voir `tasks/lessons.md` pour le detail des corrections et patterns a eviter (8 entrees a ce jour : voir le fichier).

---

## Regle de memoire narrative
Apres toute session impliquant une decision business, un pivot, un
changement de statut, ou un apprentissage terrain significatif (pas les
changements purement techniques), mettre a jour /STORY.md en
consequence, en plus des notes de session habituelles.
