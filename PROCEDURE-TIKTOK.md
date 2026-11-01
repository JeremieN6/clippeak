# Publier automatiquement sur TikTok : procédure

Sources lues le 2026-11-01 sur developers.tiktok.com (pages « Content Posting API », « Content Sharing Guidelines », « Login Kit Web », « App Review Guidelines »). Ce qui n'a pas pu être lu est marqué **(non confirmé)**. TikTok change ses règles : relis les pages citées avant de soumettre.

## Ce qu'il faut comprendre d'abord
1. **Deux validations différentes.** (a) La *revue de l'application* : TikTok approuve ton application et tes autorisations (« scopes »). (b) L'*audit de l'API de publication* : sans lui, **tout ce qui est publié reste privé** (visibilité « Moi uniquement »), et **5 utilisateurs maximum par 24 h**, dont le compte TikTok doit être **privé** au moment de la publication.
2. **Délais** : la page officielle ne donne aucune durée. Des guides tiers parlent de plusieurs jours à deux semaines **(non confirmé)**.
3. **Règle d'usage** : l'application doit être destinée à de vrais créateurs, pas à un usage interne ni à des comptes que tu gères toi-même. Une application « en test » n'est pas approuvée. Clippeak (outil pour streamers, connexion de leur propre compte) correspond.
4. **Plafond** : environ 15 publications par jour et par compte créateur (variable), et 6 requêtes par minute et par jeton.

## Étape 1 : compte et application
1. Va sur https://developers.tiktok.com et connecte-toi avec un compte TikTok (le tien convient). Accepte les conditions développeur.
2. **Manage apps > Connect an app.** Choisis « Individual » (auto-entrepreneur) ou crée une organisation.
3. Renseigne :
   - **Nom** : « Clippeak » (ne doit pas contenir « TikTok »).
   - **Icône** : le logo de Clippeak, net, 1024 x 1024 conseillé.
   - **Catégorie** : outils pour créateurs / réseaux sociaux.
   - **Description** : « Clippeak transforme les VODs Twitch d'un streamer en clips verticaux. Le streamer valide chaque clip puis choisit de le publier sur son compte TikTok. »
   - **Site web** : `https://clippeak.sassify.fr` (page complète, pas une page de connexion).
   - **Politique de confidentialité** : `https://clippeak.sassify.fr/confidentialite` et **Conditions** : `https://clippeak.sassify.fr/conditions`. Elles doivent être visibles depuis la page d'accueil sans ouvrir de menu : c'est le cas dans le pied de page.
4. Note le **Client key** et le **Client secret** (onglet de l'application). Ne les colle jamais dans une conversation : on les posera sur le serveur avec une saisie masquée.

## Étape 2 : produits et autorisations
1. Dans l'application, **Add products** : ajoute **Login Kit** et **Content Posting API**.
2. Dans **Content Posting API**, active la configuration **Direct Post**.
3. **Login Kit** : ajoute l'adresse de retour (redirect URI) exacte : `https://clippeak.sassify.fr/api/auth/tiktok/callback`. Règles : https, **sans paramètre ni #**, 10 maximum.
4. **Scopes** à demander, et seulement ceux-là :
   - `user.info.basic` (nom et avatar du compte, affichés avant la publication) ;
   - `video.publish` (publication directe).
   `video.upload` n'est pas nécessaire pour la publication directe.
5. Envoi des vidéos : Clippeak enverra le fichier lui-même (`FILE_UPLOAD`, mode fichier envoyé par morceaux). Cela évite de devoir faire vérifier un domaine. `PULL_FROM_URL` demanderait de vérifier `clippeak.sassify.fr` dans « Manage URL properties » : inutile.

## Étape 3 : environnement bac à sable (sandbox)
TikTok impose le bac à sable si l'application n'a jamais été approuvée.
1. **Sandbox** dans le portail : crée un environnement, ajoute ton compte TikTok comme **utilisateur cible** (target user).
2. Dans le bac à sable, la connexion et la publication fonctionnent avec ton compte, sans revue. C'est là qu'on testera le code avant de soumettre.

## Étape 4 : vidéo de démonstration (exigée pour la revue)
Jusqu'à 5 vidéos, 50 Mo chacune. Elle doit montrer **tout le parcours réel**, sur `clippeak.sassify.fr` (le domaine affiché doit correspondre au site déclaré) :
1. Connexion à Clippeak puis clic sur « Connecter TikTok » et écran d'autorisation TikTok (avec les deux scopes visibles).
2. Retour dans Clippeak : le **pseudo TikTok** du compte est affiché.
3. Choix d'un clip approuvé, **aperçu de la vidéo**.
4. Formulaire de publication conforme aux règles TikTok (voir étape 5).
5. Clic sur « Publier », attente, puis la vidéo visible sur le compte.
6. Déconnexion du compte TikTok.
Chaque produit et chaque scope demandé doit apparaître dans la vidéo, sinon la revue est retardée.

## Étape 5 : ce que l'écran de publication doit contenir (règles TikTok)
Ces points seront construits dans Clippeak (je m'en charge) :
- Afficher le **pseudo du compte** TikTok qui recevra la vidéo.
- Interroger TikTok avant (informations du créateur) : si le créateur ne peut pas publier maintenant, afficher « réessaie plus tard » ; vérifier la durée maximale autorisée.
- **Titre modifiable** (légende et hashtags modifiables).
- **Visibilité choisie à la main** dans une liste, **sans valeur par défaut**, limitée aux options renvoyées par TikTok.
- Cases **Commentaires / Duo / Stitch** : décochées par défaut, grisées si le compte les interdit.
- Interrupteur « Divulgation de contenu commercial » **désactivé par défaut** ; s'il est activé : « Ma marque » et/ou « Contenu de marque », au moins une cochée. Contenu de marque impossible en privé.
- Phrase de consentement avant le bouton : « En publiant, tu acceptes la Confirmation d'utilisation de la musique de TikTok » (avec lien ; variantes si contenu commercial).
- **Aperçu** de la vidéo, **aucun filigrane ni logo ni texte promotionnel** ajouté par Clippeak.
- Rien n'est envoyé sans clic explicite ; message « la vidéo peut mettre quelques minutes à apparaître ».
Conséquence produit : TikTok n'accepte pas une publication entièrement automatique. Le streamer doit **voir ce formulaire et cliquer** pour chaque vidéo. La **programmation différée** est donc à vérifier auprès de TikTok **(non confirmé)** : prévoir au moins « publier maintenant » avec validation du streamer.

## Étape 6 : soumettre la revue de l'application
1. Dans l'application : **Submit for review**.
2. Fournir pour chaque produit et scope : une explication de ce que fait la fonction (en anglais, par exemple « Direct Post lets the streamer publish an approved vertical clip to their own TikTok account after reviewing and consenting »).
3. Joindre la vidéo de l'étape 4.
4. Réponse par e-mail et dans le portail. En cas de refus, le motif est indiqué : corriger puis resoumettre.

## Étape 7 : audit pour publier en public
Après la revue, quand l'intégration fonctionne :
1. Demande d'audit de la Content Posting API depuis le portail (page « Content Posting API » de l'application). **Le formulaire n'a pas pu être lu (accès protégé) : champs et délai non confirmés.** Il faut prévoir : cas d'usage, estimation du nombre de créateurs actifs par jour (elle fixe ton plafond quotidien), preuve du respect des règles de l'étape 5.
2. Tant que l'audit n'est pas accordé : vidéos privées, 5 utilisateurs par 24 h, comptes privés.
3. Après l'audit : le streamer peut publier en public (il met son compte en public, puis choisit « Tout le monde »).

## Ce que je code une fois l'application créée
- Connexion TikTok à l'identique de YouTube : `GET /api/auth/tiktok` et son retour, état anti-falsification, **jetons chiffrés** (jeton d'accès valable 24 h, jeton de renouvellement 365 jours, à renouveler en tâche de fond ; le jeton de renouvellement peut changer).
- Plateforme `tiktok` dans `publications`, envoi en morceaux, suivi du statut, erreurs typées (plafond du jour, compte non audité, jeton invalide).
- L'écran de publication de l'étape 5.
- Sans les variables `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`, TikTok reste « bientôt disponible ».

## Ce que tu dois me donner
1. Application créée et sandbox configurée, avec l'adresse de retour ci-dessus.
2. Client key et Client secret, posés par saisie masquée (je te fournis la commande, comme pour Stripe).
3. Le pseudo du compte TikTok de test.

## Liens officiels
- https://developers.tiktok.com/doc/content-posting-api-get-started
- https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
- https://developers.tiktok.com/docs/en/content-sharing-guidelines
- https://developers.tiktok.com/doc/login-kit-web
- https://developers.tiktok.com/doc/app-review-guidelines
