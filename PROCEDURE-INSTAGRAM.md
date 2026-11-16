# Publier automatiquement sur Instagram (Reels) : procédure

Pages officielles de Meta lues le 2026-11-15 (developers.facebook.com : « Content Publishing », « Business Login for Instagram », « Create an Instagram app », « App Review », « Submission guide », « Screen recordings », « Business Verification », « App modes »). Ce qui n'est PAS écrit sur ces pages est marqué **(non confirmé)**. Meta change ses règles : relis les liens en bas avant de déposer.

## Ce qu'il faut comprendre d'abord
1. **Deux niveaux d'accès.**
   - *Standard* : seules les personnes qui ont un rôle sur ton application (toi, et les testeurs que tu ajoutes) peuvent connecter leur compte Instagram. C'est ce qui permet de **tester tout de suite, sans validation**.
   - *Avancé* : nécessaire pour que **n'importe quel streamer** connecte son compte. Il demande la **revue de l'application (App Review)** ET la **vérification de l'entreprise (Business Verification)**. Meta écrit : « Advanced Access now requires Business Verification ».
2. **Délai de la revue** : Meta écrit qu'après dépôt « tu dois recevoir une décision dans la semaine ». Le délai de la *vérification de l'entreprise* n'est **pas indiqué** sur les pages lues **(non confirmé)** : c'est probablement l'étape la plus longue, donc à lancer en premier.
3. **Vérification de l'entreprise** : se fait dans Meta Business Manager, par un administrateur de l'entreprise. Les pièces demandées (document officiel de l'entreprise, adresse, téléphone, site) ne sont pas détaillées sur les pages lues, et rien ne dit si un auto-entrepreneur peut la passer **(non confirmé)** : prépare ton avis d'inscription SIRENE / extrait Kbis et une facture ou un justificatif à l'adresse de l'entreprise.
4. **Mode de l'application** : elle naît en mode *Développement*. Meta écrit de ne passer en mode *Live* qu'**après** la revue (sinon l'application peut devenir inutilisable pour les comptes de test).
5. **Compte du streamer** : il doit être **professionnel** (Business ou Créateur, gratuit à activer dans les réglages Instagram). Un compte personnel ne marche pas. La page de Meta dit seulement « professional account » **(« créateur » n'est pas cité : à vérifier en test)**.
6. **Limite de publications** : « 100 publications par compte sur 24 h glissantes » via l'API (la page parle aussi d'une ancienne limite de 50 pour les carrousels ; on prend la plus prudente en pratique, ce ne sera jamais atteint par un streamer). Maximum 400 conteneurs créés par 24 h.
7. **Caractéristiques de la vidéo** (celles de Clippeak y sont conformes : MP4 H.264/AAC, 1080x1920, 30 fps) : MP4 ou MOV, H.264 ou HEVC, AAC, 23-60 images/s, 3 s à 15 min, 300 Mo au plus, 9:16 recommandé. **Meta télécharge elle-même la vidéo depuis une URL publique** : Clippeak génère un lien signé qui ne marche que pour ce clip et expire après 2 heures.
8. **Pas de programmation côté Instagram** : Clippeak lance la publication quand le streamer clique sur « Publier » (comme TikTok), jamais avant.

## Étape 1 : application Meta
1. Va sur https://developers.facebook.com, connecte-toi avec ton compte Facebook (celui qui administrera l'entreprise) et accepte les conditions développeur.
2. **Mes apps > Créer une app.** Choisis le type **Business** (obligatoire pour ajouter le produit Instagram). Nom : « Clippeak » ; e-mail de contact : `contact.clippeak@sassify.fr`.
3. Dans le tableau de bord de l'app > **Ajouter un produit > Instagram**. Choisis **« API setup with Instagram login »** (« Instagram API with Instagram Login »). Ne prends PAS l'option avec Facebook Login.
4. **Paramètres > Général** :
   - **Icône** : 1024 x 1024, sans logo Meta. **Catégorie** : outils pour créateurs ou réseaux sociaux.
   - **URL de la politique de confidentialité** : `https://clippeak.sassify.fr/confidentialite`
   - **URL des conditions d'utilisation** : `https://clippeak.sassify.fr/conditions` (le champ n'est pas cité sur les pages lues : renseigne-le s'il existe)
   - **Domaine de l'app** : `clippeak.sassify.fr`
   - **Objectif de l'app** : « Clients » (les streamers ne sont pas toi).
5. Dans **Instagram > API setup with Instagram login > Business login settings** :
   - **Valid OAuth redirect URIs** : `https://clippeak.sassify.fr/api/auth/instagram/callback` (Meta compare **exactement** : ni paramètre, ni `/` de trop. Le tableau de bord peut en ajouter un : relis la liste.)
   - **Deauthorize callback URL** : `https://clippeak.sassify.fr/api/auth/instagram/deauthorize`
   - **Data deletion request URL** : `https://clippeak.sassify.fr/api/auth/instagram/data-deletion`
   (Le format exact de ces rappels n'est pas décrit sur les pages lues ; Clippeak suit le format standard de Meta, `signed_request`, vérifié avec le secret de l'application. **Non confirmé tant qu'un vrai rappel n'a pas été reçu.**)
   - **Permissions** : coche seulement `instagram_business_basic` et `instagram_business_content_publish`. (La page de revue écrit `instagram_business_content_publishing` : **regarde le nom exact affiché dans ton tableau de bord** ; le code demande `instagram_business_content_publish`, nom du lien d'autorisation de Meta. Si ton tableau affiche l'autre, dis-le-moi.)
6. Note l'**ID de l'app Instagram** et le **secret de l'app Instagram** (section « Business login settings » : ce sont ceux d'Instagram, **pas** ceux de l'application Meta en général). Ne les colle jamais dans une conversation.

## Étape 2 : tester en mode Développement (sans attendre Meta)
1. **Rôles de l'app > Rôles > Ajouter des personnes > Instagram Testers** : ajoute ton compte Instagram **professionnel** (et celui d'un ami). Le compte invité doit accepter l'invitation dans Instagram (Paramètres > Applications et sites web > Invitations de testeur) **(non confirmé : lu de mémoire, la page de Meta n'a pas pu être lue sur ce point)**.
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
3. Écran d'autorisation Instagram : montre bien les **deux permissions** (« Access profile info » et « Create and publish content »), puis clique **Autoriser**.
4. Retour dans Clippeak : le **nom d'utilisateur Instagram** du compte est affiché (*permission `instagram_business_basic`*).
5. Ouvre un clip approuvé, lis l'aperçu. Clique **« Publier »** dans la zone Instagram : légende modifiable, bouton explicite (*permission `instagram_business_content_publish`*).
6. Attends « Publié », clique « Voir » : montre le Reel sur le compte Instagram.
7. Reviens à Clippeak, clique **Déconnecter**, puis **reconnecte** (la page de Meta demande de montrer se déconnecter/reconnecter).

## Étape 5 : soumettre la revue
Chemin (page Instagram de Meta) : tableau de bord > Produits > Instagram > API setup with Instagram login > **Complete app review** > Continue to app review > **Requests > Edit**.
Pour **chaque permission**, Meta demande : une description (« chaque permission doit avoir sa propre description, pas de copier-coller »), la vidéo, l'acceptation de l'usage autorisé, et **au moins un appel API réussi avec cette permission dans les 30 jours précédant le dépôt** (visible dans les 2 jours) : l'essai de l'étape 2 sert à ça, donc **fais-le avant de déposer**. Fournis aussi des **instructions de test pas à pas** pour l'équipe de Meta. Ne donne **jamais** tes identifiants personnels (Meta utilise ses propres comptes de test) ; en revanche Clippeak est sur invitation (voir « Accès pour les relecteurs » ci-dessous). Accepte les « Platform Onboarding Terms » au dépôt.

### Texte d'explication des permissions (anglais, à coller)
**instagram_business_basic**
> Clippeak is a tool for Twitch streamers: it turns their stream VODs into vertical clips that the streamer reviews and approves. After the streamer connects their own Instagram professional account, we use instagram_business_basic only to read the account's Instagram user ID (needed to address the publishing API) and its username, which we show on the publishing screen so the streamer knows exactly which account will receive the Reel. We do not read followers, media, messages or insights, and we do not share this data with anyone. The username and the token are stored (the token encrypted) until the streamer disconnects.

**instagram_business_content_publish**
> After a streamer has approved a clip in Clippeak and explicitly clicks "Publish on Instagram" (with an editable caption), we use instagram_business_content_publish to publish that single approved video as a Reel on the streamer's own Instagram professional account: we create a Reel container with a short-lived signed video URL, wait for processing, then call media_publish. Clippeak never publishes anything automatically or without that click, never publishes on accounts the streamer did not connect, and adds no watermark. The streamer can disconnect at any time from the "Your platforms" step.

### Accès pour les relecteurs
Clippeak n'ouvre le studio que sur invitation. Prévois pour Meta une **invitation Twitch de démonstration** : demande au développeur de te créer une chaîne de démonstration (l'admin a des « chaînes de test et de démo ») et décris dans les instructions comment se connecter. **À décider avec moi** : Meta doit pouvoir se connecter sans compte Twitch perso ; une page de connexion de démonstration est peut-être nécessaire **(non confirmé : à vérifier avant de déposer ; sinon la revue sera refusée pour « impossible de tester »)**.

### Traitement des données (questions de Meta après la vérification)
- Données reçues : identifiant et nom d'utilisateur Instagram, jeton d'accès. Rien d'autre.
- Usage : afficher le compte et publier les clips approuvés. Aucune revente, aucun partage, aucune publicité.
- Stockage : base chiffrée au repos côté hébergeur ; jeton chiffré en AES-256-GCM, clé hors base. Serveur en Europe.
- Suppression : « Déconnecter » ou suppression du compte efface le jeton immédiatement ; Meta peut aussi nous prévenir (rappels de désautorisation et de suppression des données ci-dessus).
- Contact : `contact.clippeak@sassify.fr`.
- Le **contrôle annuel d'utilisation des données (Data Use Checkup)** : la page de Meta n'a pas pu être lue (erreur 404) : renseigne-toi dans ton tableau de bord, il t'enverra une alerte.

## Identifiants à poser sur le serveur
Sur le VPS (terminal root, dossier `/srv/saas/clippeak`, après la fusion et le déploiement). Les valeurs sont saisies masquées, jamais affichées :
```bash
cd /srv/saas/clippeak && bash scripts/ops/vps-instagram.sh
```
Le script demande l'ID de l'app Instagram puis le secret, les écrit pour le site ET pour le worker, pose aussi `CLIPPEAK_PUBLIC_URL` pour le worker s'il manque, puis recharge. Sans ces valeurs, Instagram reste « bientôt disponible ».

## Ce qui est codé (2026-11-15)
- Connexion Instagram (`/api/auth/instagram` + retour) : état anti-falsification en cookie, échange du code, jeton de **longue durée (60 jours)** chiffré. Il est **renouvelé automatiquement** (Meta l'exige au plus tôt 24 h après sa création) quand il reste moins de 50 jours : à l'ouverture du studio et à chaque publication ; s'il expire malgré tout (streamer absent plus de 60 jours), le studio affiche « Reconnecter Instagram ».
- Compte professionnel exigé (message clair sinon). Plateforme `instagram` dans les publications : conteneur Reel, attente du traitement (une lecture par 10 s, 5 minutes au plus), publication, lien du Reel. Un envoi parti n'est jamais rejoué (risque de doublon).
- URL vidéo publique **signée, propre au clip, 2 heures** (`/api/media/instagram/<clip>`), qui n'ouvre jamais un autre clip.
- Écran de publication dans le studio (nom du compte, légende modifiable, bouton explicite) ; pas de programmation ; jamais pour une chaîne de test ou de démonstration (refus 403, et la connexion Instagram leur est refusée).
- Déconnexion et suppression du compte : le jeton est effacé chez nous. **Meta ne propose pas de méthode pour révoquer un jeton Instagram** (aucune n'est décrite sur les pages lues) : on dit au streamer de retirer Clippeak dans Instagram > Paramètres > Applications et sites web. Les rappels « désautorisation » et « suppression des données » de Meta effacent aussi la connexion chez nous.
- **Non testé contre le vrai Meta** (faux Meta dans les tests) : le premier vrai essai se fait en mode Développement, étape 2.

## Ce que tu dois me donner / faire
1. Application créée, produit Instagram ajouté, adresses ci-dessus saisies, testeur ajouté.
2. Identifiants posés avec la commande ci-dessus.
3. Un essai réel de publication (étape 2), puis la vidéo (étape 4), puis le dépôt (étape 5).
4. Lancer **dès maintenant** la vérification de l'entreprise (étape 3), sans attendre le code.

## Liens officiels
- https://developers.facebook.com/docs/instagram-platform/content-publishing
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
- https://developers.facebook.com/documentation/instagram-platform/create-an-instagram-app
- https://developers.facebook.com/docs/instagram-platform/app-review
- https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review/submission-guide
- https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings
- https://developers.facebook.com/docs/apps/business-verification
- https://developers.facebook.com/documentation/development/build-and-test/app-modes
