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

### [2026-10-23] Session cloud incapable de lire les fichiers locaux
**Probleme** : L'agent a demande au porteur de verifier lui-meme les noms de variables de `.env.local`, qui est sur son PC, et n'a pas pu tester Twitch (reseau du conteneur bloque).
**Cause racine** : Session lancee dans un conteneur cloud (copie du depot GitHub) : fichiers ignores par git et services externes bloques hors de portee.
**Solution** : Toute la connaissance de la conversation est consignee dans `CLAUDE.md`, `BRIEF-V2.md`, `PRISE-DE-POSITION.md` ; les verifications reelles sont deleguees a une session locale.
**Regle** : Avant de promettre une verification, determiner si la session peut atteindre la ressource (fichier local, reseau externe). Sinon le dire d'emblee et deleguer ; ne jamais presenter du code non execute contre le vrai service comme valide.

### [2026-10-23] Outils Node/Prisma : versions et syntaxe
**Probleme** : `npx prisma` sans installation a recupere une version 7 incompatible ; `node --test` a refuse les "parameter properties" TypeScript.
**Cause racine** : `npx` telecharge la derniere version si le paquet local est absent ; Node ne fait que retirer les types (strip-only), il ne transforme pas la syntaxe TypeScript.
**Solution** : `npm ci --ignore-scripts` puis `./node_modules/.bin/prisma` ; attributs de classe declares explicitement.
**Regle** : Utiliser les binaires locaux du projet ; dans le code teste par `node --test`, pas d'enum, de namespace ni de parameter properties.

### [2026-10-23] Affichage de secrets en filtrant un .env avec sed
**Probleme** : Pour lister les noms de variables de `.env.local`, un `sed` a masque seulement ce qui suit `=` ; les lignes d'une cle privee SSH multi-lignes (sans `=`) se sont affichees en clair. J'ai aussi lu `.env`, non demande.
**Cause racine** : Filtre par remplacement sur toutes les lignes au lieu d'une extraction des seuls noms ; hypothese que chaque ligne est du type CLE=valeur.
**Solution** : Le porteur regenere la cle. Depuis, extraction des noms avec `grep -oE '^[A-Z_]+'` et lecture d'une valeur precise par `grep -m1 '^NOM='` sans affichage.
**Regle** : Pour lister des variables, n'extraire que les noms (`grep -oE`), jamais filtrer un fichier de secrets par masquage ; ne lire que le fichier demande.

### [2026-10-23] Pagination par curseur du chat GraphQL Twitch
**Probleme** : Le client chat, ecrit sans acces reseau, echouait des la page 2 avec "failed integrity check" ; sur une VOD en cours, les offsets 0 a 2 renvoient une liste vide.
**Cause racine** : Endpoint non documente : le curseur exige un jeton Client-Integrity, que l'offset ne demande pas ; comportement des VODs en cours different des VODs terminees.
**Solution** : Pagination par offset avec recouvrement et dedoublonnage, offset de depart >= 3 s, tests avec la forme reelle de reponse.
**Regle** : Tout client d'un endpoint non officiel se teste contre le vrai service, sur une VOD terminee ET une VOD en cours, avant d'etre declare valide.

### [2026-10-23] Environnement Python et playlists Twitch
**Probleme** : `pip install faster-whisper` a echoue dans un venv du dossier temporaire (chemin Windows trop long, droits admin pour l'activer) ; l'appel de decodage PyAV de faster-whisper a plante (`metadata_errors`) ; la playlist usher repondait 403 avec les parametres `sig/token`.
**Cause racine** : limite de 260 caracteres des chemins Windows ; incompatibilite de version PyAV ; pour une VOD, usher attend `nauth/nauthsig` et certaines VODs sont `vod_manifest_restricted`.
**Solution** : venv dans un chemin court, WAV lu par le script lui-meme (numpy), parametres `nauth/nauthsig`, erreur `restricted` explicite.
**Regle** : creer les venv Python dans un chemin court ; ne pas dependre du decodeur audio d'une bibliotheque quand ffmpeg produit deja le bon format ; tester un endpoint Twitch non officiel sur une VOD du porteur ET une VOD tierce.
