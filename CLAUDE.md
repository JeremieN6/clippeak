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
**Phase** : V1 fonctionnelle, deployee en continu sur `main` via CI/CD
**Derniere session** : 2026-07-31
**Progression globale** : ~95%

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

### Prochaines etapes :
- [ ] Reconfirmer que la connectivite Neon reste stable en environnement de dev (un probleme P1001 avait ete rencontre le 2026-07-01 ; un insert reel a reussi le 2026-07-02, mais aucune note ulterieure ne reconfirme l'etat sur la duree)
- [ ] Verifier que les secrets de deploiement (SSH_PRIVATE_KEY, VPS_HOST, VPS_USER) et les variables PostHog sont bien configures cote GitHub/VPS
- [ ] Continuer a affiner le tracking des evenements PostHog sur le parcours /try-now

---

## Blocages et Points d'Attention
- Blocage historique (2026-07-01) : connexion Neon indisponible depuis l'environnement de dev lors de la migration Prisma (erreur P1001). D'apres `tasks/lessons.md`, un insert de feedback a ete teste avec succes le lendemain (2026-07-02) apres regeneration du client Prisma -- le blocage semble donc leve, mais ce n'est pas reconfirme explicitement dans une session posterieure. A verifier au demarrage de la prochaine session avant de considerer le sujet clos.
- Sur Windows, le moteur Prisma genere dans `node_modules` peut rester verrouille par un processus Node actif : toujours arreter les process avant de regenerer le client apres une modif de `schema.prisma`.

---

## Decisions Prises
| Date | Decision | Raison |
|------|----------|--------|
| 2026-07-01 | Utiliser Prisma 6.15.0 au lieu de Prisma 7 | Prisma 7 change le workflow datasource/config et complexifie inutilement la V1 |
| 2026-07-02 | Le formulaire de feedback reste facultatif, sans verrouillage du CTA de telechargement | Un gating obligatoire cassait la fluidite du parcours try-now ; on privilegie une conversion volontaire a forte intention plutot qu'une barriere de sortie |
| 2026-07-02 | Suppression du champ `zip_par_mail` du schema Feedback | Redondant avec la question plus complete sur la plateforme de reception ; une seule question source de verite |
| 2026-07-02 | Deploiement continu via GitHub Actions + SSH + pm2 vers un VPS (plutot qu'une plateforme managee type Vercel) | Choix d'infra pour garder le controle du serveur (`/srv/saas/clippeak`) |

---

## Notes de Session
> Ajouter ici un resume a la fin de chaque session de travail.

- **2026-07-01** : Scaffold Nuxt realise (initialise en Nuxt 3, depuis mis a jour vers 4.4.8) et UI V1 implementee selon brief. APIs feedback/admin implementees et build valide. Migration SQL versionnee dans prisma/migrations, connectivite Neon en echec en fin de session (P1001).
- **2026-07-02** : Refactor complet de la landing en composants par section (la premiere version etait un monolithe non conforme au brief). Integration du feedback dans le parcours /try-now avec emission d'un evenement de fin. Retrait du gating sur le CTA de telechargement. Suppression du champ redondant `zip_par_mail` (front + API + schema + migration). Migration Prisma testee avec un insert reel reussi apres regeneration du client. Cinq lecons documentees dans tasks/lessons.md.
- **2026-07-02** : Ajout d'un workflow GitHub Actions de deploiement continu vers un VPS (SSH + pm2) sur push vers `main`.
- **2026-07-06** : Integration du module `nuxt-posthog` pour le tracking analytics, avec un plugin dedie pour enregistrer le nom de l'app.
- **2026-07-31** : Correction de la description dans `LandingHero` pour mentionner YouTube Shorts en plus de Twitch.

---

## Lecons Apprises
Voir `tasks/lessons.md` pour le detail des corrections et patterns a eviter (5 entrees a ce jour : structure de landing non conforme au brief, feedback manquant sur try-now, gating trop agressif du CTA, emplacement du CTA final, champ redondant + regeneration du client Prisma apres migration).

---

## Regle de memoire narrative
Apres toute session impliquant une decision business, un pivot, un
changement de statut, ou un apprentissage terrain significatif (pas les
changements purement techniques), mettre a jour /STORY.md en
consequence, en plus des notes de session habituelles.
