# STORY.md -- Memoire Narrative

> Ce fichier raconte le projet pour un public exterieur (article de blog, presentation,
> nouvel arrivant non technique). Il complete CLAUDE.md, qui reste la memoire technique.
> A mettre a jour apres toute decision business, pivot ou apprentissage terrain --
> pas apres un simple changement de code.

---

## Objectif produit
Donner a voir, sans backend de production reel, ce a quoi ressemblerait un service qui transforme automatiquement une VOD Twitch en clips prets a poster -- pour valider l'interet du produit et collecter des retours qualifies avant de construire le vrai moteur de traitement.

---

## Statut actuel
Clippeak est une landing page interactive complete et deployee en continu : un visiteur peut coller une URL Twitch, regarder une simulation de traitement (~58 secondes, avec etapes et estimation), telecharger un ZIP de demonstration, puis donner son avis via un formulaire de feedback. Un espace admin protege par mot de passe permet de consulter les retours collectes.

Le produit reel de clipping n'existe pas encore : tout le "traitement" est simule cote front pour tester la promesse et le parcours avant d'investir dans le moteur automatise.

---

## Historique des pivots

### 2026-07-01/02 -- D'une landing monolithique a un parcours structure
**Contexte** : la premiere version de la landing a ete livree d'un bloc, sans respecter la structure section par section attendue dans le brief initial.
**Decision** : refonte complete en composants dedies par section, avec une navigation par ancres et un CTA principal clair.
**Resultat** : parcours conforme au brief, plus facile a faire evoluer section par section par la suite.

### 2026-07-02 -- Le feedback devient un moment du parcours, pas une barriere
**Contexte** : une premiere version verrouillait le bouton de telechargement du ZIP tant que le formulaire de feedback n'etait pas rempli.
**Decision** : le formulaire reste visible et encourage juste apres le resultat de la simulation, mais ne bloque plus la sortie -- le feedback devient une conversion volontaire a forte intention plutot qu'une contrainte.
**Resultat** : parcours plus fluide, coherent avec l'objectif de recueillir des avis sinceres plutot que des reponses forcees.

### 2026-07-02 -- Simplification du formulaire de feedback
**Contexte** : le formulaire posait deux questions qui se recoupaient sur la maniere dont l'utilisateur recevrait son ZIP.
**Decision** : suppression de la question redondante, conservation d'une seule question source de verite sur la plateforme de reception preferee.
**Resultat** : formulaire plus court, donnees plus propres a analyser cote admin.

### 2026-07-02 -- Choix d'un deploiement continu sur infrastructure propre
**Contexte** : le projet avait besoin d'un chemin de mise en production simple pour que la landing soit accessible en dehors du poste de dev.
**Decision** : mise en place d'un pipeline GitHub Actions qui deploie automatiquement sur `main` vers un VPS via SSH, gere par pm2.
**Resultat** : chaque merge sur `main` se retrouve en production sans etape manuelle.

---

## Ce que la cible attend / a appris
- A ce stade, aucune donnee de feedback reelle issue d'utilisateurs externes n'a ete analysee dans ce document -- l'espace admin existe pour cela, mais aucun chiffre (taux de completion, volume de retours, satisfaction) n'a encore ete releve et documente ici. Toute statistique citee ailleurs sur ce projet doit etre verifiee directement dans l'espace admin avant d'etre reutilisee.
- Le parcours a ete concu en partant du principe que forcer une action (feedback obligatoire pour telecharger) degrade la qualite du signal recueilli -- c'est une hypothese de design assumee, pas encore validee par des donnees d'usage reelles.

---

## Garde-fous de contenu
- Ne jamais publier de detail exploitable sur la configuration de deploiement (nom d'hote VPS, chemins serveur, secrets, structure des workflows CI) au-dela de ce qui est deja public dans le depot.
- Ne jamais transcrire de chiffre business (taux de conversion, volume de feedbacks, satisfaction) sans indiquer sa source verifiable (ex. export de l'espace admin a telle date) ou le marquer explicitement "a verifier".
- Ne pas presenter le flow de traitement de VOD comme fonctionnel en production : c'est une simulation assumee tant que le moteur reel n'est pas construit. Toute communication externe doit rester honnete sur ce point.
- Garder un ton factuel et respectueux envers les utilisateurs ayant laisse un feedback ; ne jamais citer de retour individuel de maniere identifiable sans consentement explicite.

---

## Derniere mise a jour
2026-08-27 -- Creation initiale du fichier, reconstituee a partir de l'historique git (12 commits, 2026-07-01 au 2026-07-31) et de `tasks/lessons.md`, en remise a niveau conjointe avec CLAUDE.md.
