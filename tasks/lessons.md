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

### [2026-10-24] Ecrire du code avec des gabarits via le shell
**Probleme** : Un fichier TypeScript contenant des gabarits `${...}` et des antislashs, ecrit par un script `node -e` dans le shell, a ete corrompu (variables developpees par bash, expressions regulieres cassees).
**Cause racine** : Plusieurs niveaux d'echappement (bash, JavaScript, regex) pour du code qui n'en a pas besoin.
**Solution** : Reecriture avec l'outil d'ecriture de fichiers ; les scripts de correctif passent par un fichier `.cjs` et non par `node -e`.
**Regle** : Jamais de code contenant `${}`, des antislashs ou des guillemets imbriques dans une commande shell : ecrire le fichier directement.

### [2026-10-24] Zod 4 : valeurs par defaut des objets imbriques
**Probleme** : `z.object({...}).default({})` ne remplissait pas les valeurs par defaut internes ; un champ nullable sans `.default(null)` etait requis.
**Cause racine** : En zod 4, `.default(x)` court-circuite l'analyse ; il faut `.prefault({})` pour que l'objet par defaut soit analyse.
**Solution** : `.prefault({})` sur les objets imbriques et `.default(null)` sur les champs nullables facultatifs.
**Regle** : Tester le schema avec `parse({})` des qu'il comporte des objets imbriques.

### [2026-10-24] Le controle qualite doit utiliser le meme calcul que le rendu
**Probleme** : En lancant le worker sur une vraie VOD, un clip a ete refuse pour "titre sur 4 lignes" alors que le rendu dessinait 3 lignes ; un autre pour une duree montee de 18,3 s (minimum 20 s) alors que le plan croyait avoir fini.
**Cause racine** : (1) le controle recalculait le decoupage du titre avec son propre algorithme, different de celui du rendu, et la troncature "..." depassait la largeur ; (2) le planificateur n'etendait que le debut du clip, jamais la fin, quand les silences retires faisaient passer la duree sous le minimum. Les tests unitaires utilisaient des cas trop propres.
**Solution** : `countTitleLines` et `fitTitle` (assBuilder) servent au rendu, au titre par defaut ET au controle ; le planificateur prolonge la fin sur les phrases suivantes terminees (sans depasser la duree max).
**Regle** : Un controle de conformite appelle la fonction du producteur, il ne la reimplemente pas. Tester toute chaine de traitement sur une vraie donnee avant de la declarer valide : les cas reels revelent des ecarts que les fixtures ne montrent pas.

### [2026-10-24] Connexion base inactive pendant une longue tache
**Probleme** : Pendant le test complet du worker, l'enregistrement des moments echouait avec "Can't reach database server" (P1001) apres ~4 min de transcription sans requete ; un clip etait aussi marque en echec pour la meme raison.
**Cause racine** : Le worker enchaine de longues taches (Whisper, ffmpeg) entre deux acces a la base ; les connexions inactives sont coupees (et Neon se met en veille, reveil ~1 s), donc la premiere requete suivante echoue. Documente par Neon, mais absent du code.
**Solution** : `dbRetry.ts` : reessais (1 s, 3 s, 8 s) uniquement pour les erreurs de connexion (P1001, P1002, P1008, P1017) sur tous les stores du worker ; une ecriture refusee (contrainte) n'est jamais rejouee.
**Regle** : Tout processus de fond qui calcule longtemps entre deux acces base doit reessayer les erreurs de connexion transitoires. Distinguer un artefact de test (PGlite n'accepte qu'une session) d'un vrai risque avant de conclure : ici les deux existaient, seul le second justifiait un correctif.

### [2026-10-24] Commande destinee a une machine que je ne vois pas : verifier ses prerequis
**Probleme** : La commande de mesure donnee pour le VPS echouait (`.venv/bin/python: No such file`) : elle supposait que l'environnement Python et le script `transcribe.py` etaient deja presents, alors que le VPS etait encore sur l'ancien `main`.
**Cause racine** : Je n'avais pas de visibilite sur l'etat du serveur et j'ai enchaine des etapes dependantes (installation, deploiement du code, mesure) sans les rendre explicites ni les controler.
**Solution** : Commande complete et ordonnee : `git fetch` + extraction du script depuis la branche (sans toucher au code en production), controles `which`/`--version`, installation, telechargement du modele, puis mesure. `.venv` ajoute au `.gitignore`.
**Regle** : Pour toute commande a executer sur une machine hors de portee, commencer par des controles d'etat (existence, versions), ne rien presupposer sur ce qui est deploye, et rendre chaque prerequis explicite dans la meme commande.

### [2026-10-24] Fichier de configuration pm2 : le nom compte
**Probleme** : `pm2 start ecosystem.worker.vps.cjs` a lance le fichier comme un script (processus fantome `ecosystem.worker.vps`) au lieu de lire la configuration ; le vrai worker etait deja arrete.
**Cause racine** : pm2 ne reconnait un fichier de configuration que si son nom finit par `.config.js|cjs|mjs`.
**Solution** : processus fantome supprime, fichier renomme `ecosystem.worker.vps.config.cjs`, worker relance sous l'utilisateur dedie (verifie : utilisateur `clippeak`, 0 redemarrage, les 15 autres applications intactes).
**Regle** : Sur un serveur partage, nommer les fichiers de configuration selon la convention de l'outil, tester AVANT de supprimer l'ancien processus quand c'est possible, et verifier l'ensemble de `pm2 list` apres toute manipulation.

### [2026-10-24] Revoquer une cle : verifier d'abord quelle cle l'utilisateur emploie reellement
**Probleme** : En revoquant la cle de deploiement exposee, j'ai aussi coupe l'acces SSH du porteur depuis son PC : son fichier `~/.ssh/config` imposait cette meme cle (`sassify_deploy_new`) pour se connecter au VPS. J'ai cru a un probleme de sa cle personnelle (`id_ed25519_perso`, en realite celle de GitHub).
**Cause racine** : Je n'avais pas compare l'empreinte de la cle revoquee avec celles que l'utilisateur emploie (config ssh, agent), et mes connexions de test passaient par sa configuration sans que je m'en apercoive. Une ligne de `authorized_keys` polluee par des sequences de terminal a de plus fait echouer silencieusement mon premier script (`set -e`).
**Solution** : Acces garde pendant toute l'operation grace a la nouvelle cle (ajoutee et testee AVANT la revocation) puis installee dans le fichier que la configuration du porteur utilise deja ; sauvegarde de `authorized_keys` ; script de revocation qui conserve toute ligne illisible et refuse de rien modifier s'il ne retire pas exactement une ligne.
**Regle** : Avant de revoquer une cle, lister toutes les facons dont l'utilisateur se connecte (config ssh, agent, scripts) et comparer les empreintes ; toujours ajouter et tester la cle de remplacement avant de retirer l'ancienne ; tester avec `-F /dev/null -o IdentitiesOnly=yes -i <cle>` pour ne pas faire passer la configuration de l'utilisateur dans mes essais.

### [2026-10-24] Un reglage lu dans process.env n'est pas lu dans .env.local
**Probleme** : Le premier demarrage du worker sur le VPS (sous root, avec les variables dans .env.local) a ignore WHISPER_PYTHON : Whisper a ete lance avec le python du systeme (sans numpy), le pic a ete ignore et la VOD de test terminee sans moment. Le journal d'erreurs gardait la trace, que j'ai d'abord prise pour un vieux residu.
**Cause racine** : Le site Nuxt lit .env.local par un repli (`readEnv`), mais le worker lit WHISPER_*, CLIPPEAK_DATA_DIR, RENDER_THREADS... directement dans process.env, que pm2 ne remplit pas depuis .env.local. Le defaut est reste invisible parce que l'utilisateur dedie recoit ensuite ses variables par un fichier d'environnement.
**Solution** : `loadEnvFile` charge dans process.env les seules variables autorisees du worker depuis .env.local (jamais la cle SSH, SMTP ni le mot de passe admin ; jamais d'ecrasement d'une variable deja definie), importe en premier par le point d'entree du worker.
**Regle** : Une configuration doit etre lue par UNE seule voie dans tout le code, ou chargee explicitement au demarrage ; relire entierement les journaux d'erreurs d'un nouveau service, y compris les anciens fichiers, avant de le declarer sain.

### [2026-10-25] Comprendre la demande avant de substituer une source plus facile
**Probleme** : Le porteur voulait une banque de clips de reference importes (videos/liens de comptes) analysee par l'IA ; j'avais construit une banque issue de l'API Twitch Clips, plus simple a obtenir, qui ne correspondait pas au besoin.
**Cause racine** : J'ai remplace l'exigence (clips d'autres plateformes) par la donnee accessible par API, et je n'ai pas verifie avec lui que ce remplacement convenait.
**Solution** : Banque refaite : depot de videos + liens de comptes (yt-dlp), transcription + images cles analysees par Claude, statistiques facultatives, ressemblance avec les moments des lives.
**Regle** : Quand la source demandee est difficile d'acces, le dire et proposer des options AVANT de remplacer ; ne jamais presenter un substitut comme la fonction demandee.
