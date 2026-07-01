# CLAUDE.md -- Memoire Projet

> Ce fichier est lu automatiquement par l'IA au debut de chaque conversation.
> Mets-le a jour a la fin de chaque session de travail.

---

## Objectif Final
Livrer Clippeak V1: landing page Nuxt interactive avec simulation complete du flow de clipping Twitch, collecte de feedbacks et vue admin de pilotage.

---

## Stack Technique
- Nuxt 4 (Vue 3)
- Tailwind CSS
- Prisma ORM
- PostgreSQL (Neon)

---

## Etat Actuel du Projet
**Phase** : V1 fonctionnelle (hors migration DB appliquee)
**Derniere session** : 2026-07-01
**Progression globale** : 90%

### Ce qui est fait :
- [x] Configuration MCP memoire
- [x] Initialisation Nuxt + Tailwind + Prisma
- [x] Landing page Clippeak V1 (hero + validation URL Twitch)
- [x] Flow fake processing (~58s) avec progression, etapes et estimation
- [x] Generation ZIP beta telechargeable (README inclus)
- [x] Formulaire feedback connecte a l API
- [x] API POST /api/feedback
- [x] Page /admin protegee par mot de passe + metriques + tableau
- [x] Build de production valide

### Prochaines etapes :
- [ ] Appliquer la migration Prisma sur Neon (echec de connectivite P1001 pendant la session)
- [ ] Tester un insert reel de feedback en environnement dev connecte a Neon

---

## Blocages et Points d Attention
- Connexion Neon indisponible depuis l environnement courant lors de la migration Prisma (P1001).

---

## Decisions Prises
| Date | Decision | Raison |
|------|----------|--------|
| 2026-07-01 | Utiliser Prisma 6.15.0 au lieu de Prisma 7 | Prisma 7 change le workflow datasource/config et complexifie inutilement la V1 |

---

## Notes de Session
> Ajouter ici un resume a la fin de chaque session de travail.

- Scaffold Nuxt realise et UI V1 implementee selon brief.
- APIs feedback/admin implementees et build valide.
- Migration SQL versionnee dans prisma/migrations, mais non appliquee sur Neon faute de connectivite.

---

## Lecons Apprises
> Voir tasks/lessons.md pour le detail des corrections et patterns a eviter.
