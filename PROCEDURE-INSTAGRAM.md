# Publier automatiquement sur Instagram (Reels) : procédure

**Mise à jour 2026-11-16 : connexion unifiée.** Meta n'offre plus la connexion Instagram directe (« API setup with Instagram login ») aux nouvelles applications : le tableau de bord ne propose que « API setup with Unified login » (Facebook Login for Business). Clippeak est donc codé pour la **connexion unifiée** (pages lues le 2026-11-16 : « Instagram API with Unified Login », « Get started », « Authentication », « Permissions »). Ce qui n'est pas dit sur ces pages est marqué **(non confirmé)**.

Pages officielles de Meta lues le 2026-11-15 et 2026-11-16 (developers.facebook.com : « Content Publishing », « Unified Login », « Create an Instagram app », « App Review », « Submission guide », « Screen recordings », « Business Verification », « App modes »). Ce qui n'est PAS écrit sur ces pages est marqué **(non confirmé)**. Meta change ses règles : relis les liens en bas avant de déposer.

## Ce qu'il faut comprendre d'abord
1. **Deux niveaux d'accès.**
   - *Standard* : seules les personnes qui ont un rôle sur ton application (toi, et les testeurs que tu ajoutes) peuvent connecter leur compte Instagram. C'est ce qui permet de **tester tout de suite, sans validation**.
   - *Avancé* : nécessaire pour que **n'importe quel streamer** connecte son compte. Il demande la **revue de l'application (App Review)** ET la **vérification de l'entreprise (Business Verification)**. Meta écrit : « Advanced Access now requires Business Verification ».
2. **Délai de la revue** : Meta écrit qu'après dépôt « tu dois recevoir une décision dans la semaine ». Le délai de la *vérification de l'entreprise* n'est **pas indiqué** sur les pages lues **(non confirmé)** : c'est probablement l'étape la plus longue, donc à lancer en premier.
3. **Vérification de l'entreprise** : se fait dans Meta Business Manager, par un administrateur de l'entreprise. Les pièces demandées (document officiel de l'entreprise, adresse, téléphone, site) ne sont pas détaillées sur les pages lues, et rien ne dit si un auto-entrepreneur peut la passer **(non confirmé)** : prépare ton avis d'inscription SIRENE / extrait Kbis et une facture ou un justificatif à l'adresse de l'entreprise.
4. **Mode de l'application** : elle naît en mode *Développement*. Meta écrit de ne passer en mode *Live* qu'**après** la revue (sinon l'application peut devenir inutilisable pour les comptes de test).
5. **Compte du streamer** : il doit être **professionnel** (Business ou Créateur, gratuit à activer dans les réglages Instagram). Un compte personnel ne marche pas. Avec la connexion unifiée, le streamer **n'a pas besoin de Page Facebook** (la doc le dit), mais Meta lui fait **choisir une entreprise (portefeuille business)** pendant la connexion **(non confirmé : à vérifier en test avec un compte qui n'en a jamais créé)**. Le jeton obtenu appartient à cette entreprise, pas à la personne ; selon la configuration choisie il n'expire pas, mais il cesse de marcher si le streamer retire Clippeak de son entreprise (il doit alors reconnecter).
6. **Limite de publications** : « 100 publications par compte sur 24 h glissantes » via l'API (la page parle aussi d'une ancienne limite de 50 pour les carrousels ; on prend la plus prudente en pratique, ce ne sera jamais atteint par un streamer). Maximum 400 conteneurs créés par 24 h.
7. **Caractéristiques de la vidéo** (celles de Clippeak y sont conformes : MP4 H.264/AAC, 1080x1920, 30 fps) : MP4 ou MOV, H.264 ou HEVC, AAC, 23-60 images/s, 3 s à 15 min, 300 Mo au plus, 9:16 recommandé. **Meta télécharge elle-même la vidéo depuis une URL publique** : Clippeak génère un lien signé qui ne marche que pour ce clip et expire après 2 heures.
8. **Pas de programmation côté Instagram** : Clippeak lance la publication quand le streamer clique sur « Publier » (comme TikTok), jamais avant.

## Étape 1 : application Meta
1. Va sur https://developers.facebook.com, connecte-toi avec ton compte Facebook (celui qui administrera l'entreprise) et accepte les conditions développeur.
2. **Mes apps > Créer une app.** Choisis le type **Business** (obligatoire pour ajouter le produit Instagram). Nom : « Clippeak » ; e-mail de contact : `contact.clippeak@sassify.fr`.
3. **Cas d'utilisation** : « Gérer les messages et le contenu sur Instagram » (c'est celui qui donne l'onglet « API setup with Unified login » ; l'option « Autre » donne le même résultat aujourd'hui). La configuration se crée dans l'onglet « API setup with Unified login », **et non** dans « Configuration de l'API avec Facebook Login » (ancienne méthode, obsolète : ne pas l'utiliser).
4. **Paramètres de l'app > Général** :
   - **Icône** : 1024 x 1024, sans logo Meta. **Catégorie** : celle qui convient (outils pour créateurs ou réseaux sociaux).
   - **URL de la politique de confidentialité** : `https://clippeak.sassify.fr/confidentialite`
   - **URL des conditions d'utilisation** : `https://clippeak.sassify.fr/conditions`
   - **Domaine de l'app** : `clippeak.sassify.fr`
   - **Suppression des données** : « URL d'instructions » : `https://clippeak.sassify.fr/studio#mes-donnees`. Clippeak accepte aussi un rappel automatique sur `https://clippeak.sassify.fr/api/auth/instagram/data-deletion` **(non confirmé : le format du rappel pour la connexion unifiée n'est pas décrit sur les pages lues)**.
5. Dans **Instagram > API setup with Unified login > 1. Configurez votre application** :
   - **Créer une configuration** : variante « Général », token « Token d'accès utilisateur système (SUAT) », **expiration : Jamais**, éléments professionnels : **Compte Instagram obligatoire** (le compte publicitaire n'est pas utile), autorisations : **`instagram_basic` et `instagram_content_publish` seulement** (retire `ads_management`, `ads_read`, `instagram_manage_messages`, `instagram_manage_comments` : Clippeak ne s'en sert pas, et chaque permission en plus doit être justifiée à la revue).
   - **URL de redirection** : `https://clippeak.sassify.fr/api/auth/instagram/callback` (Meta compare **exactement** : ni paramètre, ni `/` de trop). Clique « Enregistrer », puis relis la liste.
   - Note l'**ID de configuration** (« ID de configuration : … » dans l'encadré de la configuration). Ce n'est pas un secret.
6. **Identifiants à noter** : l'**ID de l'application** et la **clé secrète** (Paramètres de l'app > Général : ce sont ceux de l'application Meta, pas d'une « application Instagram » à part), plus l'**ID de configuration**. Ne les colle jamais dans une conversation.

## Étape 2 : tester en mode Développement (sans attendre Meta)
1. **Rôles de l'app > Rôles** : Meta écrit d'« affecter le rôle de testeur(se) Instagram au compte dans l'onglet Rôles » avant de générer des jetons : ajoute ton compte Instagram **professionnel** (et celui d'un ami) comme **Instagram Tester** si l'onglet le propose, et accepte l'invitation côté Instagram **(non confirmé : à vérifier dans ton tableau de bord)**. En mode Développement, seuls les comptes qui ont un rôle sur l'app peuvent se connecter.
2. Pose les identifiants sur le serveur (voir « Identifiants » plus bas) : dès lors le bouton « Connecter Instagram » apparaît dans le studio.
3. Connecte ton compte dans Clippeak, approuve un clip, clique « Publier sur Instagram » : le Reel doit apparaître sur ton compte. **C'est la première vérification réelle** (le code n'a été essayé qu'avec un faux Meta).
4. **Tourne la vidéo de démonstration** pendant ce test (étape 4).

## Étape 3 : vérification de l'entreprise (à lancer en parallèle, c'est la plus longue)
1. https://business.facebook.com > Paramètres de l'entreprise > **Centre de sécurité > Lancer la vérification** (le chemin exact change : suis le lien « Business Verification » de https://developers.facebook.com/docs/apps/business-verification).
2. Associe l'application Meta à cette entreprise (Paramètres de l'app > Avancé, ou Paramètres de l'entreprise > Comptes > Apps).
3. Fournis les pièces demandées (voir point 3 plus haut).
4. Après approbation, Meta pose des questions sur le traitement des données : réponses ci-dessous (« Traitement des données »).

## Étape 4 : vidéo de démonstration (une par permission, mais une même vidéo peut montrer les deux)
Exigences de Meta (pages « Submission guide » et « Screen recordings ») : **chaque permission doit être vue de bout en bout**, avec la **connexion complète** (se déconnecter puis se reconnecter), l'écran où l'utilisateur **accorde chaque permission**, puis l'usage de la fonction. Résolution 1080 ou plus (largeur d'écran 1440 maxi), **sans son**, curseur grossi, enregistrer seulement la fenêtre de l'application, interface en **anglais** si possible (sinon légendes). Durée et poids maximaux : **non indiqués**.

Scénario conseillé (3 à 4 minutes, sous-titres en anglais ; la langue de l'interface Clippeak est le français : ajoute des légendes) :
1. Ouvre `https://clippeak.sassify.fr` (le domaine doit être visible) et connecte-toi avec Twitch.
2. Étape « Tes plateformes » : clique **« Connecter Instagram Reels »**.
3. Fenêtre de connexion de Meta : montre le choix de l'**entreprise** et du **compte Instagram**, puis l'écran qui liste les **deux permissions**, puis autorise **(non confirmé : l'enchaînement exact des écrans se voit au premier essai ; adapte le scénario)**.
4. Retour dans Clippeak : le **nom d'utilisateur Instagram** du compte est affiché (*permission `instagram_basic`*).
5. Ouvre un clip approuvé, lis l'aperçu. Clique **« Publier »** dans la zone Instagram : légende modifiable, bouton explicite (*permission `instagram_content_publish`*).
6. Attends « Publié », clique « Voir » : montre le Reel sur le compte Instagram.
7. Reviens à Clippeak, clique **Déconnecter**, puis **reconnecte** (la page de Meta demande de montrer se déconnecter/reconnecter).

## Étape 5 : soumettre la revue
Chemin (page Instagram de Meta) : tableau de bord > Produits > Instagram > API setup with Instagram login > **Complete app review** > Continue to app review > **Requests > Edit**.
Pour **chaque permission**, Meta demande : une description (« chaque permission doit avoir sa propre description, pas de copier-coller »), la vidéo, l'acceptation de l'usage autorisé, et **au moins un appel API réussi avec cette permission dans les 30 jours précédant le dépôt** (visible dans les 2 jours) : l'essai de l'étape 2 sert à ça, donc **fais-le avant de déposer**. Fournis aussi des **instructions de test pas à pas** pour l'équipe de Meta. Ne donne **jamais** tes identifiants personnels (Meta utilise ses propres comptes de test) ; en revanche Clippeak est sur invitation (voir « Accès pour les relecteurs » ci-dessous). Accepte les « Platform Onboarding Terms » au dépôt.

### Texte d'explication des permissions (anglais, à coller)
**instagram_basic**
> Clippeak is a tool for Twitch streamers: it turns their stream VODs into vertical clips that the streamer reviews and approves. After the streamer connects their own Instagram professional account, we use instagram_basic only to read the account's Instagram user ID (needed to address the publishing API) and its username, which we show on the publishing screen so the streamer knows exactly which account will receive the Reel. We do not read followers, media, messages or insights, and we do not share this data with anyone. The username and the token are stored (the token encrypted) until the streamer disconnects.

**instagram_content_publish**
> After a streamer has approved a clip in Clippeak and explicitly clicks "Publish on Instagram" (with an editable caption), we use instagram_content_publish to publish that single approved video as a Reel on the streamer's own Instagram professional account: we create a Reel container with a short-lived signed video URL, wait for processing, then call media_publish. Clippeak never publishes anything automatically or without that click, never publishes on accounts the streamer did not connect, and adds no watermark. The streamer can disconnect at any time from the "Your platforms" step.

### Accès pour les relecteurs
Clippeak n'ouvre le studio que sur invitation. Prévois pour Meta une **invitation Twitch de démonstration** : demande au développeur de te créer une chaîne de démonstration (l'admin a des « chaînes de test et de démo ») et décris dans les instructions comment se connecter. **À décider avec moi** : Meta doit pouvoir se connecter sans compte Twitch perso ; une page de connexion de démonstration est peut-être nécessaire **(non confirmé : à vérifier avant de déposer ; sinon la revue sera refusée pour « impossible de tester »)**.

### Traitement des données (questions de Meta après la vérification)
- Données reçues : identifiant et nom d'utilisateur du compte Instagram partagé, jeton d'accès de l'entreprise. Rien d'autre.
- Usage : afficher le compte et publier les clips approuvés. Aucune revente, aucun partage, aucune publicité.
- Stockage : base chiffrée au repos côté hébergeur ; jeton chiffré en AES-256-GCM, clé hors base. Serveur en Europe.
- Suppression : « Déconnecter » ou suppression du compte efface le jeton immédiatement ; Meta peut aussi nous prévenir (rappels de désautorisation et de suppression des données ci-dessus).
- Contact : `contact.clippeak@sassify.fr`.
- Le **contrôle annuel d'utilisation des données (Data Use Checkup)** : la page de Meta n'a pas pu être lue (erreur 404) : renseigne-toi dans ton tableau de bord, il t'enverra une alerte.

## Identifiants à poser sur le serveur
Sur le VPS (terminal root, dossier `/srv/saas/clippeak`, après la fusion et le déploiement). Le secret est saisi masqué, jamais affiché :
```bash
cd /srv/saas/clippeak && bash scripts/ops/vps-instagram.sh
```
Le script demande l'**ID de l'app Meta**, le **secret de l'app Meta** (masqué) puis l'**ID de configuration**, les écrit pour le site ET pour le worker, pose aussi `CLIPPEAK_PUBLIC_URL` pour le worker s'il manque, puis recharge. Sans ces trois valeurs, Instagram reste « bientôt disponible ».

## Ce qui est codé (2026-11-16, connexion unifiée)
- Connexion Instagram (`/api/auth/instagram` + retour) : état anti-falsification en cookie, ouverture de la fenêtre de connexion de Meta (`https://www.facebook.com/dialog/oauth?client_id=…&config_id=…&redirect_uri=…&response_type=code&state=…`), échange du code contre le **jeton de l'entreprise** (`GET graph.facebook.com/v27.0/oauth/access_token`), chiffré. Pas de renouvellement : s'il a une échéance et qu'elle passe, ou si Meta le refuse, le studio affiche « Reconnecter Instagram ». Le paramètre `state` n'est pas cité sur les pages lues de Meta **(non confirmé : standard du protocole OAuth de Facebook)**.
- Compte : `GET /me/assigned_instagram_accounts?fields=id,username` (premier compte partagé). Aucun compte partagé : message clair, rien n'est enregistré.
- Publication sur `graph.facebook.com` : conteneur Reel, attente du traitement (une lecture par 10 s, 5 minutes au plus ; Meta conseille une lecture par minute, 5 minutes au plus), publication, lien du Reel. Un envoi parti n'est jamais rejoué (risque de doublon).
- URL vidéo publique **signée, propre au clip, 2 heures** (`/api/media/instagram/<clip>`), qui n'ouvre jamais un autre clip.
- Écran de publication dans le studio (nom du compte, légende modifiable, bouton explicite) ; pas de programmation ; jamais pour une chaîne de test ou de démonstration (refus 403, et la connexion Instagram leur est refusée).
- Déconnexion et suppression du compte : le jeton est effacé chez nous. **Meta ne décrit pas de méthode de révocation côté Clippeak** : on dit au streamer de retirer Clippeak dans les paramètres de son entreprise Meta. Les rappels « désautorisation » et « suppression des données » (`/api/auth/instagram/deauthorize` et `/data-deletion`) existent, mais **leur format pour la connexion unifiée n'est pas documenté (non confirmé)** : ils retrouvent la connexion par l'identifiant du compte Instagram, alors que Meta peut envoyer un autre identifiant ; la suppression par le streamer depuis « Mes données » reste le moyen sûr.
- **Non testé contre le vrai Meta** (faux Meta dans les tests) : le premier vrai essai se fait en mode Développement, étape 2. À vérifier à ce moment-là : le jeton est accepté sur `graph.facebook.com/v27.0/<id>/media` ; `redirect_uri` demandé à l'échange du code ; le nom exact des permissions dans la configuration.

## Ce que tu dois me donner / faire
1. Application créée, configuration « Unified login » créée (2 permissions, jeton sans expiration, adresse de retour), adresses légales saisies, testeur ajouté.
2. Identifiants posés avec la commande ci-dessus.
3. Un essai réel de publication (étape 2), puis la vidéo (étape 4), puis le dépôt (étape 5).
4. Lancer **dès maintenant** la vérification de l'entreprise (étape 3), sans attendre le code.

## Liens officiels
- https://developers.facebook.com/docs/instagram-platform/content-publishing
- https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login
- https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/permissions
- https://developers.facebook.com/documentation/instagram-platform/create-an-instagram-app
- https://developers.facebook.com/docs/instagram-platform/app-review
- https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review/submission-guide
- https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings
- https://developers.facebook.com/docs/apps/business-verification
- https://developers.facebook.com/documentation/development/build-and-test/app-modes
