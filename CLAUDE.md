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
**Derniere session** : 2026-11-01
**Progression globale** : V1 ~95% ; V2 fondations posees (voir section V2)

### Resume de l'etat (le detail complet, date et verifie, est dans `docs/HISTORIQUE-PROJET.md` : le lire seulement pour la fonction concernee)
- **En production** : landing veridique (bouton de connexion, bandeau cookies, demo `/try-now` = simulation annoncee), connexion Twitch SUR INVITATION (`/connexion`, `/inscription`, `/attente` + demandes d'acces), `/studio` (onboarding conversationnel en 8 etapes + questions rapides pour look et sons, tableau de bord, cartes de clips, statut Publies, cloche, « Prochainement » avec votes, « Mes donnees » export/suppression), `/admin` (cookie `clippeak_admin`, onglets Studio/Invitations/VODs/Prochainement/Feedbacks, chaines de test et de demo, ajout manuel de VOD, plafond par chaine).
- **Pipeline V2** (worker pm2 `clippeak-worker`, utilisateur `clippeak`) : EventSub/rattrapage -> VOD -> pics de chat (GraphQL non officiel) -> Whisper local -> moments notes (Claude si cle) -> coupe (`cutPlanner`) -> rendu vertical ffmpeg 1080x1920 (titre, sous-titres mot a mot, zoom, ecran partage contenu/camera, avatar, illustrations, sons) -> controle qualite -> lots -> validation humaine dans `/studio`. Extraits sources 2 min gardes 14 jours. VODs d'abonnes : etat `blocked` + cartes d'action. Banque de clips de reference (yt-dlp, Claude vision, TF-IDF). Notifications Telegram/Discord de l'admin.
- **Publication** : YouTube OK en prive (jetons chiffres AES-256-GCM, worker `publishStep`) ; verification OAuth Google et audit YouTube ENVOYES le 2026-10-30, reponses attendues. TikTok : CODE ECRIT le 2026-11-02 (connexion Login Kit, publication directe Direct Post, ecran de publication aux regles de TikTok) mais PAS ENCORE TESTE contre le vrai TikTok ni soumis a la revue ; procedure dans `PROCEDURE-TIKTOK.md`. Instagram : `ACCES-API-PLATEFORMES.md`.
- **Facturation Stripe** : gratuit 20 clips/mois (baisse decidee le 2026-11-14, pour donner envie du plan superieur), Creator par PACKS de 120 clips (1 a 5, quantite de l'abonnement) : 19 EUR/mois OU 144 EUR/an par pack (annuel par defaut sur la landing et dans le studio, `STRIPE_PRICE_CREATOR_YEARLY`, voir `server/utils/clipping/pricing.ts`), pas de TVA (franchise en base). Test OK de bout en bout ; PRODUCTION en cours de pose (webhook et cles poses par le porteur le 2026-11-01, `STRIPE_INVOICE_FOOTER=none` si le modele Stripe porte deja la mention). Plafond mensuel = max(reglage chaine, quota de l'offre).
- **Suivi** : PostHog projet « clippeak » (EU), charge SEULEMENT apres « Accepter » (zero cookie). Sauvegardes chiffrees (fichiers + base) sur le VPS et MEGA, restauration testee. Garde-fou des migrations dans `deploy.yml` (`scripts/ops/migrations.sh`).
- **Pas verifie en reel** : un vrai paiement Stripe de production ; PostHog avec la vraie cle apres consentement ; premiere sauvegarde automatique de 3 h 30 ; analyse pendant un vrai live ; reponses Google/YouTube.
- **Liste de reste a faire** : `CHECKLIST-OUVERTURE.md` et `BACKLOG.md`.

### Regles d'exploitation a retenir
- Fusion d'une PR seulement quand le porteur dit « Fusionne ». Apres deux fusions rapprochees, verifier les deux deploiements (deploiements concurrents sur le VPS).
- Migration Prisma : le porteur l'applique (`bash scripts/ops/migrations.sh apply`) AVANT de fusionner ; le garde-fou bloque sinon.
- Variables lues par le SITE : passer par `readEnv`, jamais `process.env` seul (Nuxt ne charge pas `.env.local` en production). Variables de build : `/srv/saas/clippeak/.env`.
- Ne JAMAIS afficher une ligne de `.env.local` ni une cle ; le porteur saisit les secrets en saisie masquee (`scripts/ops/run-on-vps.sh`).
- Windows : `bash` de PowerShell n'existe pas (utiliser `Git\bin\bash.exe`) ; `python` et non `python3` ; `npm install` retire les paquets PGlite installes `--no-save` (`npm i --no-save --ignore-scripts @electric-sql/pglite @electric-sql/pglite-socket`) ; heredocs a guillemets : ecrire les fichiers avec l'outil Write.
- nginx du VPS ne reecrit pas X-Forwarded-For : utiliser `X-Real-IP` (`clientIp()`).
- Tailwind : `border-st-error/40` (opacite sur `var()`) ne genere rien ; utiliser un jeton dedie.
- Ne jamais supprimer la balise meta `google-site-verification` de `nuxt.config.ts`.
- Ne jamais publier les clips d'une chaine de test (donnees d'amis).

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
> Garder ICI une note de 2-3 lignes par session (decision, etat, piege). Le detail va dans docs/HISTORIQUE-PROJET.md. Notes anciennes (2026-07 a 2026-11-01) : dans ce fichier d'historique.

- **2026-11-01** : production Stripe en preparation (prix reel Creator price_1UWPejIrL7WyQoMKr2CIrS37, webhook et cles poses par le porteur, cle k_ restreinte), PROCEDURE-TIKTOK.md et CHECKLIST-OUVERTURE.md ajoutes, CLAUDE.md allege (101 Ko -> resume, detail archive).

- **2026-11-02 (TikTok)** : branche `feat/tiktok-publishing`. `tiktokApi.ts` (OAuth, infos du createur, controle des reglages), `tiktokPublisher.ts` (envoi FILE_UPLOAD en un morceau <= 64 Mo, lecture du statut), routes `/api/auth/tiktok` (+ `callback`), `GET /api/studio/channels/:id/tiktok-creator`, `StudioTiktokPublish.vue`. Regles TikTok codees : visibilite sans valeur par defaut, commentaires/duo/stitch decoches, divulgation commerciale desactivee au depart, phrase d'accord, pas de programmation (publication immediate seulement). Jetons rotatifs : le nouveau jeton de renouvellement est garde MEME si l'envoi echoue (`PublishError.renewed`). Un envoi parti n'est jamais rejoue. Migration `202611021000_publication_options` (colonne `publications.options`) A APPLIQUER AVANT DE FUSIONNER. Variables `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` : `bash scripts/ops/run-on-vps.sh tiktok` (saisie masquee, pose aussi pour le worker). Sans elles TikTok reste « bientot disponible ». Tests : 266 unitaires + integration (faux TikTok). BAC A SABLE VERIFIE par le porteur le 2026-11-02 (connexion, ecran de publication, envoi : OK ; corrige ensuite : titre en double, envoi en cours sans formulaire, relecture toutes les 6 s). PAGES LEGALES MISES A JOUR (2026-11-02, branche `docs/legal-tiktok` : usage de l'API, deux autorisations, jetons chiffres, revocation, 30 jours ; URLs des conditions et de la politique de TikTok a verifier sur le site de TikTok) ; la suppression de compte revoque maintenant le jeton TikTok chez TikTok (avant : tout partait chez Google). A FAIRE : video de demonstration, revue puis audit ; pages legales (volontairement pas encore mises a jour : TikTok n'est pas public).
- **2026-11-14 (tarifs)** : branche `feat/tarifs-annuel`. Grille validee par le porteur apres comparaison avec Opus Clip (qui facture des minutes de video source, nous des clips) : gratuit 40 ; Creator 19 EUR/mois ou 12 EUR/mois facture 144 EUR/an (-37 %), par packs de 120 clips (1 a 5). Colonnes `channel_billing.packs` et `billing_interval` (migration `202611140900_billing_packs`) ; le webhook lit quantite et rythme sur l'abonnement (ou les metadonnees du paiement), le plafond = 120 x packs. Prix annuel a creer EN PRODUCTION dans Stripe par le porteur, puis `bash scripts/ops/run-on-vps.sh stripe-annuel` ; le portail client Stripe doit autoriser le changement de quantite et de prix. Sans `STRIPE_PRICE_CREATOR_YEARLY`, seul le mensuel est propose. Pieges : travail fait dans un worktree separe (`../clippeak-tarifs`) car le dossier principal portait des modifications non commitees d'une autre session.

- **2026-11-14 (maquette tarifs, gratuit a 20)** : branche `feat/tarifs-maquette`. Landing alignee sur la maquette du kit (pastilles beta vert / bientot ambre, puces rondes, ligne verte « Tu economises X EUR par an » en annuel et « En annuel, tu economiserais X EUR par an » en mensuel). Gratuit : 20 clips par mois (`FREE_CLIPS` dans `pricing.ts`, `DEFAULT_MONTHLY_CLIPS`, defaut de la colonne `streamer_settings.monthly_clip_quota`). Migration `202611141000_free_clips_20` : MODIFIE DES DONNEES (les plafonds de 40 deviennent 20) donc le deploiement s'arrete au garde-fou : `migrations.sh apply` sur le VPS puis relancer le deploiement.

---

## Lecons Apprises
Voir `tasks/lessons.md` pour le detail des corrections et patterns a eviter (8 entrees a ce jour : voir le fichier).

---

## Regle de memoire narrative
Apres toute session impliquant une decision business, un pivot, un
changement de statut, ou un apprentissage terrain significatif (pas les
changements purement techniques), mettre a jour /STORY.md en
consequence, en plus des notes de session habituelles.
