# Lessons Learned

> Ce fichier est mis a jour apres CHAQUE correction faite par l utilisateur.
> But : ne plus refaire les memes erreurs. Relu au debut de chaque session.

---

## Format

### [DATE] Titre du probleme
**Probleme** : Description de ce qui a mal tourne.
**Cause racine** : Pourquoi c est arrive.
**Solution** : Ce qui a ete fait pour corriger.
**Regle** : La regle a suivre desormais pour eviter ce cas.

---

## Lecons

<!-- Les entrees seront ajoutees ici au fil du temps -->

### [2026-07-02] Landing non conforme au brief
**Probleme** : La landing a ete livree en monolithe et ne respectait pas la structure sectionnelle demandee.
**Cause racine** : Priorite mise sur la livraison rapide au lieu d un alignement strict avec le brief et les contraintes UX explicites.
**Solution** : Refactor complet en 1 composant par section, navbar avec ancres de navigation + CTA principal, et validation build/erreurs avant livraison.
**Regle** : Pour toute landing detaillee, implementer la structure exacte du brief section par section des la premiere passe, puis verifier les erreurs IDE avant de presenter le resultat.

### [2026-07-02] Parcours try-now incomplet apres saisie URL
**Probleme** : La section feedback n etait pas affichee sur la page try-now, ce qui cassait le parcours attendu avant telechargement.
**Cause racine** : Le composant waitlist n etait branche que sur la landing principale et pas sur la page dediee au flow.
**Solution** : Ajout de la waitlist sur try-now, emission d un evenement de soumission et verrouillage du bouton de telechargement avec message utilisateur tant que le formulaire n est pas rempli.
**Regle** : Sur toute page de flow dediee, verifier explicitement la presence des sections de conversion et les preconditions UX avant d activer les CTA de sortie.

### [2026-07-02] Gating trop agressif sur try-now
**Probleme** : Le bouton de telechargement a ete grise et bloque apres le flow, ce qui rendait le parcours moins fluide.
**Cause racine** : J ai traite le formulaire comme une precondition obligatoire au lieu d un feedback facultatif a forte intention.
**Solution** : Suppression du verrouillage du CTA, maintien du formulaire visible sous le resultat avec scroll automatique en fin de traitement.
**Regle** : Ne pas transformer un formulaire de feedback en barriere de sortie sans demande explicite ; privilegier un parcours fluide et une conversion volontaire.

### [2026-07-02] Emplacement du CTA final sur try-now
**Probleme** : Le bouton de telechargement et sa carte ont ete remontes hors de la section de flow, ce qui cassait la logique visuelle voulue.
**Cause racine** : J ai privilegie le positionnement sous le formulaire au lieu de conserver le resultat dans son conteneur d origine.
**Solution** : Reintegrer la carte de resultat et le bouton de telechargement dans le composant du flow, tout en laissant le formulaire apparaître en dessous.
**Regle** : Quand l utilisateur demande de deplacer un CTA, conserver son conteneur logique d origine sauf demande explicite de sortir aussi le resultat de cette section.

### [2026-07-02] Redondance dans les questions feedback
**Probleme** : Le formulaire posait deux questions qui se recoupaient sur la reception par mail, ce qui creait une redondance inutile.
**Cause racine** : Une ancienne question binaire sur le ZIP par mail etait conservee en plus de la question plus complete sur la plateforme de reception.
**Solution** : Suppression de la question redondante dans l UI, retrait du champ de l API et du schema Prisma, puis ajout d une migration pour supprimer la colonne correspondante en base.
**Regle** : Eviter les champs doublons dans les formulaires ; conserver une seule question source de verite et aligner front, API et schema de donnees dans la meme correction.

### [2026-07-02] Client Prisma non regenere apres migration
**Probleme** : L API feedback renvoyait encore une erreur 500 avec une reference a `zipParMail` alors que la colonne avait deja ete supprimee de la base.
**Cause racine** : Le client Prisma dans `node_modules` etait reste genere avec l ancien schema, donc le runtime demandait encore un champ obsolet.
**Solution** : Regeneration du client Prisma apres avoir stoppe les processus Node du projet, puis retest d un insert reel reussi.
**Regle** : Apres toute modification de schema Prisma, regenerer explicitement le client avant de valider le runtime local, surtout sur Windows ou les fichiers du moteur peuvent rester verrouilles.
