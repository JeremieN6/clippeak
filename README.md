# Clippeak

Clippeak est une landing page SaaS construite avec Nuxt pour simuler une V1 de produit autour du clipping Twitch. L'objectif de cette version est de montrer la proposition de valeur, faire vivre un faux flow de traitement de VOD, collecter des feedbacks qualifiés, puis donner une vue admin simple pour piloter les retours.

## Objectif du projet

Livrer une V1 fonctionnelle qui permet de :

- presenter le produit et sa promesse sur une landing page claire
- simuler un parcours "Try now" avec progression, etapes et resultat telechargeable
- collecter du feedback utilisateur via un formulaire branche a l'API
- consulter les retours dans un espace admin protege par mot de passe

## Etat actuel

Phase actuelle : V1 fonctionnelle, hors migration base de donnees appliquee.

Avancement estime : 90%.

Ce qui est deja en place :

- landing page marketing complete
- parcours interactif /try-now avec simulation de processing
- generation d'un ZIP beta telechargeable
- formulaire de feedback connecte a l'API
- endpoint POST /api/feedback
- espace /admin protege par mot de passe
- metriques et tableau des feedbacks cote admin
- build de production valide

Point de blocage actuel :

- la migration Prisma est versionnee, mais n'a pas encore ete appliquee sur Neon a cause d'un probleme de connectivite a la base (erreur P1001 lors de la derniere session)

## Etapes suivantes

Les prochaines actions prevues sont :

1. retablir la connectivite a Neon
2. appliquer la migration Prisma sur la base distante
3. verifier un insert reel de feedback en environnement de developpement
4. revalider le parcours complet avec persistance effective des donnees

## Stack technique

- Nuxt 4
- Vue 3
- Tailwind CSS
- Prisma ORM
- PostgreSQL via Neon
- Zod pour la validation des payloads

## Parcours disponibles

- / : landing page principale
- /try-now : simulation interactive du produit
- /feedback : redirection vers /admin
- /admin : acces protege aux metriques et feedbacks

## Installation

Installer les dependances :

```bash
npm install
```

## Variables d'environnement

Le projet attend au minimum :

```env
DATABASE_URL="postgresql://..."
ADMIN_PASSWORD="mot-de-passe-admin"
```

Notes :

- DATABASE_URL est necessaire pour Prisma et les endpoints relies aux feedbacks
- ADMIN_PASSWORD protege l'acces a la route admin
- la route admin sait aussi relire une valeur depuis .env.local en fallback

## Lancer le projet

Demarrer le serveur de developpement :

```bash
npm run dev
```

Application disponible sur http://localhost:3000.

## Scripts utiles

```bash
npm run dev
npm run build
npm run preview
npm run generate
```

## Base de donnees

Le schema Prisma contient actuellement une table feedbacks avec les informations collectees depuis le formulaire utilisateur : profil, besoin d'automatisation, volume de VOD, plateforme de reception, email et manque principal.

La migration initiale est presente dans prisma/migrations, mais son application sur Neon reste a finaliser.

## Structure utile

- app/pages : pages Nuxt de la landing, du flow interactif et de l'admin
- app/components/landing/sections : sections decoupees de la landing
- server/api : endpoints feedback et admin
- server/utils/prisma.ts : initialisation Prisma
- prisma/schema.prisma : schema de donnees
- tasks : suivi des taches et lecons du projet

## Statut de livraison

Le projet est proche d'une V1 exploitable pour tests utilisateurs. La partie interface et parcours produit est livree. La derniere marche restante est la validation complete du stockage des feedbacks sur la base Neon distante.
