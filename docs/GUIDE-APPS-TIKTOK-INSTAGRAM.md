# Créer l'app TikTok et l'app Instagram pour un nouveau SaaS (leçons de Clippeak)

Document à donner tel quel à Claude dans la conversation du nouveau projet (Plotline). Il vient de l'expérience réelle de Clippeak (novembre 2026). Remplace les `[CROCHETS]` par les valeurs du projet. Ce qui n'a pas été confirmé est marqué **(non confirmé)** : TikTok et Meta changent leurs règles, relire leurs pages avant de soumettre.

## 0. Ce que Claude doit savoir avant de commencer
- Le porteur n'est pas technique, parle français, avance pas à pas. Il crée les comptes et saisit les secrets lui-même ; Claude code, teste, rédige les textes. **Jamais de clé ou de secret collé dans une conversation** : saisie masquée sur le serveur.
- Les deux plateformes font **deux niveaux** : un mode test (sans validation, réservé aux comptes ajoutés à la main) et un accès public (revue + audit). Tout se code et se teste d'abord en mode test.
- **Les revues sont longues et peuvent refuser pour des détails.** Lancer les démarches les plus longues en premier (vérification d'entreprise Meta).

## 1. Cohérence de l'identité : le refus qu'on a eu (à éviter dès le départ)
TikTok a refusé Clippeak à la première revue : « l'icône de l'app ne correspond pas à celle du site ni du favicon ».
Règle : **la même image partout, avant de soumettre** :
1. Icône de l'app sur le portail TikTok **et** Meta (1024 x 1024, PNG, sans logo de la plateforme dedans).
2. Favicon du site (`favicon.ico` 16/32/48, `favicon-32.png`, `icon-192.png`, `apple-touch-icon.png` 180) générés depuis cette même image, déclarés dans le `<head>` de toutes les pages.
3. Logo visible dans l'en-tête du site et le pied de page : **la même image**, pas un rond avec des initiales.
4. **Nom de l'app** : unique chez la plateforme (« [NOM] » est peut-être déjà pris : prévoir « [NOM]-app » ou autre) ; ne contient jamais « TikTok », « Instagram », « Facebook ». Le nom affiché sur le site doit rester reconnaissable.
5. Si l'icône est trop détaillée pour 16 px (logo avec texte), préférer un **symbole simple** pour l'app ET le favicon. Ne pas changer le site pendant une revue en cours : le relecteur compare le site à ce qu'il a reçu.

## 2. Ce que le site doit avoir (commun aux deux)
- Site public complet, en HTTPS, sur un **domaine à soi** ; pas une simple page de connexion.
- **Politique de confidentialité** et **Conditions d'utilisation** accessibles depuis la page d'accueil, sans ouvrir de menu (pied de page). Elles doivent dire précisément :
  - quelles données de la plateforme sont lues (juste ce qui est demandé) et pourquoi ;
  - que les jetons sont stockés **chiffrés** et jamais partagés ;
  - comment **révoquer** : bouton « Déconnecter » et suppression du compte ; délai maximal de conservation (30 jours après retrait de l'accès chez Clippeak) ;
  - qu'**aucun contenu n'est publié sans clic explicite** de l'utilisateur ;
  - l'acceptation des conditions de la plateforme (liens vers leurs conditions) ;
  - un e-mail de contact réel.
- Une page de **suppression des données** (instructions) : `[DOMAINE]/[page compte]#mes-donnees` par exemple.
- Adresse e-mail de contact qui fonctionne.

## 3. TikTok

### Fonctionnement et limites
- Produits : **Login Kit** (connexion du compte du créateur) + **Content Posting API, Direct Post**.
- Scopes à demander, et **seulement** ceux-là : `user.info.basic` et `video.publish`.
- Deux validations : (a) **revue de l'app** ; (b) **audit de l'API de publication**. Sans l'audit : toutes les vidéos publiées sont **privées** (« Moi uniquement »), 5 utilisateurs par 24 h, compte TikTok privé.
- Plafond : environ 15 publications par jour et par créateur ; 6 requêtes par minute et par jeton.
- Jetons : accès 24 h, renouvellement 365 jours, **le jeton de renouvellement peut changer** à chaque renouvellement : toujours enregistrer le nouveau, même si l'envoi échoue.

### Étapes
1. https://developers.tiktok.com : compte, conditions développeur. **Manage apps > Connect an app**. Type « Individual » (auto-entrepreneur) ou organisation.
2. Renseigner : nom, icône 1024 x 1024 (voir §1), catégorie, description (ce que fait le site, 120 caractères environ pour le champ court), URL du site, URL des conditions, URL de la politique, plateforme « Web » avec l'URL du site.
3. **Add products** : Login Kit + Content Posting API (activer **Direct Post**). Login Kit : **redirect URI exacte** `https://[DOMAINE]/api/auth/tiktok/callback` (https, sans paramètre ni `#`).
4. Envoi des vidéos : mode **fichier envoyé** (`FILE_UPLOAD`) pour ne pas avoir à faire vérifier un domaine (`PULL_FROM_URL` demande de vérifier le domaine).
5. **Sandbox** : créer l'environnement test, ajouter son compte TikTok comme utilisateur cible. Les identifiants du bac à sable sont **différents** de ceux de production : poser les identifiants de production seulement après l'approbation.
6. Coder la connexion et la publication, tester dans le bac à sable.
7. **Vidéo de démonstration** (jusqu'à 5 vidéos, 50 Mo chacune, MP4/MOV), qui montre **tout le parcours réel** sur `[DOMAINE]` : connexion au site, clic « Connecter TikTok », écran d'autorisation TikTok avec les deux scopes, retour avec le pseudo affiché, choix d'un contenu, aperçu, formulaire de publication, clic « Publier », la vidéo visible sur le compte, déconnexion. Chaque produit et chaque scope demandé doit apparaître.
8. Champ « Explain how each product and scope works » (1000 caractères max, anglais) : décrire Login Kit (pseudo et avatar affichés avant la publication) et Direct Post (l'utilisateur relit, choisit visibilité et options, accepte, clique Publier ; rien sans accord).
9. **Submit for review**. Réponse par e-mail et dans le portail. Un refus donne un motif : corriger, **Return to Draft**, resoumettre avec une raison courte (120 caractères max).
10. Après la revue : demander l'**audit** de la Content Posting API (formulaire protégé, champs et délai **non confirmés**).

### Règles de l'écran de publication (TikTok les vérifie dans la vidéo)
- Afficher le **pseudo** du compte qui recevra la vidéo.
- Interroger TikTok avant (infos du créateur) : durée maximale, options autorisées.
- **Titre modifiable** (légende et hashtags).
- **Visibilité choisie à la main, sans valeur par défaut**, limitée aux options renvoyées par TikTok.
- Commentaires / Duo / Stitch : **décochés par défaut**, grisés si le compte les interdit.
- « Divulgation de contenu commercial » **désactivée par défaut** ; si activée, « Ma marque » et/ou « Contenu de marque » (au moins un) ; contenu de marque impossible en privé.
- Phrase de consentement avant le bouton, avec lien vers la « Confirmation d'utilisation de la musique » de TikTok.
- **Aperçu** de la vidéo ; **aucun filigrane** ni texte promotionnel ajouté.
- Rien n'est envoyé sans clic ; pas de publication 100 % automatique.

### Texte prêt pour « Explain how each product and scope works » (adapter [CROCHETS])
```
[NOM] helps [CIBLE] turn [SOURCE] into short vertical videos. The user reviews and approves each video in our studio ([DOMAINE]) before anything is posted.

Login Kit (user.info.basic): the user connects their own TikTok account so we can display their nickname and avatar on the publishing screen and make clear which account will receive the video.

Content Posting API, Direct Post (video.publish): for each approved video, the user opens the publishing screen, sees the account nickname, edits the title, chooses the privacy level (no default), sets comments/duet/stitch (unchecked by default), optionally discloses commercial content, accepts TikTok's Music Usage Confirmation and clicks Publish. Nothing is posted without this explicit action. No watermark is added.

Tokens are stored encrypted, and the user can disconnect at any time (the authorization is revoked).
```

## 4. Instagram (publication de Reels)

### Fonctionnement et limites
- Meta **n'offre plus** la connexion Instagram directe aux nouvelles apps : utiliser **« API setup with Unified login »** (Facebook Login for Business). Ne pas utiliser l'ancienne configuration « Facebook Login ».
- **Deux niveaux d'accès** : *Standard* (seuls les comptes ayant un rôle sur l'app : test immédiat, sans validation) et *Avancé* (n'importe quel utilisateur : demande **revue de l'app (App Review) + vérification de l'entreprise (Business Verification)**).
- La **vérification de l'entreprise** est probablement l'étape la plus longue (délai non indiqué) : à lancer **tout de suite**, dans Meta Business Manager, par un administrateur. Prévoir justificatif d'entreprise (SIRENE/Kbis, facture à l'adresse) ; si un auto-entrepreneur peut la passer : **non confirmé**.
- L'utilisateur doit avoir un compte Instagram **professionnel** (Business ou Créateur). Un compte personnel ne marche pas. Pendant la connexion Meta lui fait choisir une entreprise (portefeuille business) et le compte Instagram.
- Limites : 100 publications par compte par 24 h ; vidéo MP4/MOV, H.264, AAC, 3 s à 15 min, 300 Mo max, 9:16 conseillé ; **Meta télécharge la vidéo depuis une URL publique** (prévoir un lien signé, propre au contenu, qui expire après 2 h).
- Pas de programmation côté API pour ce cas : la publication part au clic de l'utilisateur.

### Étapes
1. https://developers.facebook.com : compte Facebook de l'administrateur, conditions développeur.
2. **Mes apps > Créer une app**, type **Business**. Nom, e-mail de contact. Cas d'utilisation : « Gérer les messages et le contenu sur Instagram » (donne l'onglet « API setup with Unified login »).
3. **Paramètres de l'app > Général** : icône 1024 x 1024 (voir §1), catégorie, URL de la politique, URL des conditions, **domaine de l'app** (`[DOMAINE]`), instructions de suppression des données.
4. Instagram > **API setup with Unified login** > « 1. Configurez votre application » : créer une **configuration** (variante Général, jeton « Token d'accès utilisateur système », expiration **Jamais**, compte Instagram obligatoire), permissions **`instagram_basic` et `instagram_content_publish` seulement** (chaque permission en plus doit être justifiée à la revue). **URL de redirection exacte** : `https://[DOMAINE]/api/auth/instagram/callback`. Noter l'**ID de configuration** (pas un secret).
5. Noter l'**ID de l'application** et la **clé secrète** (Paramètres de l'app > Général) : jamais dans une conversation.
6. **Mode Développement** : ajouter son compte Instagram professionnel comme testeur (onglet Rôles), accepter l'invitation côté Instagram. Coder la connexion et la publication, **faire au moins un vrai appel réussi par permission** (Meta l'exige dans les 30 jours avant la soumission).
7. **Ne passer en mode Live qu'après la revue.**
8. **Vidéo de démonstration** : chaque permission vue de bout en bout, avec **connexion complète** (se déconnecter puis se reconnecter), l'écran où l'utilisateur accorde les permissions, puis l'usage (compte affiché, publication, Reel visible sur le compte). Sans son, 1080 de large ou plus, curseur grossi, seulement la fenêtre de l'application, interface en anglais si possible (sinon légendes).
9. **Complete app review** : pour chaque permission, une description propre (pas de copier-coller), la vidéo, l'usage autorisé, des **instructions de test pas à pas**.
10. Avant ou pendant : **Business Verification**, puis réponses aux questions sur le traitement des données.

### Accès pour les relecteurs (important)
Meta ne peut pas se connecter à un site « sur invitation » ni avec un compte de service tiers (chez Clippeak : Twitch). Clippeak a donc une page `/relecteur` où l'on saisit un **code** qui ouvre un espace d'exemple avec un contenu déjà approuvé ; on la ferme après la revue. Le même besoin existe pour [PROJET] si la connexion passe par un service que Meta n'a pas : **prévoir ce chemin d'accès dès le départ** et le décrire dans les « instructions pour l'examen ».

### Textes prêts (anglais, adapter [CROCHETS])
**instagram_basic**
```
[NOM] is a tool for [CIBLE]: it [DÉCRIRE EN UNE PHRASE]. After the user connects their own Instagram professional account, we use instagram_basic only to read the account's Instagram user ID (needed to address the publishing API) and its username, which we show on the publishing screen so the user knows exactly which account will receive the Reel. We do not read followers, media, messages or insights, and we do not share this data with third parties.
```
**instagram_content_publish**
```
After a user has approved a video in [NOM] and explicitly clicks "Publish on Instagram" (with an editable caption), we use instagram_content_publish to publish that single approved video as a Reel on the user's own Instagram professional account: we create a Reel container with a short-lived signed video URL, wait for processing, then call media_publish. [NOM] never publishes anything automatically or without that click, never publishes on accounts the user did not connect, and adds no watermark.
```

## 5. Ordre recommandé et délais
1. Jour 1 : logo unique + favicon, pages légales complètes, site public. Créer les deux apps, lancer la **vérification d'entreprise Meta**.
2. Mode test des deux plateformes : coder, tester avec de vrais comptes (bac à sable TikTok, rôle testeur Meta).
3. Tourner les deux vidéos de démonstration pendant ces tests.
4. Soumettre TikTok (revue) ; soumettre Meta quand la vérification d'entreprise est faite et qu'un appel réussi existe pour chaque permission.
5. Après acceptation : poser les identifiants **de production** sur le serveur (saisie masquée), recharger.
6. Demander l'audit de publication TikTok ; Meta : passer en mode Live après la revue.

## 6. Pièges à retenir
- Icône, nom, favicon et en-tête du site : **identiques** (refus TikTok à la première soumission).
- Nom d'app déjà pris : le chercher avant de créer l'app.
- Identifiants du bac à sable ≠ identifiants de production.
- Jeton de renouvellement TikTok qui change : l'enregistrer toujours.
- Un envoi déjà parti n'est jamais rejoué (risque de doublon sur la plateforme).
- Une permission de plus = une justification de plus à la revue : demander le strict minimum.
- Ne jamais publier sans clic de l'utilisateur ; aucun filigrane ajouté.
- Pour Meta : un compte déjà partagé reste partagé même si on le décoche dans la fenêtre ; afficher la liste et laisser l'utilisateur choisir le compte.
- Les textes légaux ne doivent promettre que ce que le code fait vraiment (révocation du jeton chez la plateforme, délai de suppression).

## 7. Liens officiels
- TikTok : https://developers.tiktok.com/doc/content-posting-api-get-started · https://developers.tiktok.com/doc/content-posting-api-reference-direct-post · https://developers.tiktok.com/docs/en/content-sharing-guidelines · https://developers.tiktok.com/doc/login-kit-web · https://developers.tiktok.com/doc/app-review-guidelines
- Meta : https://developers.facebook.com/docs/instagram-platform/content-publishing · https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login · https://developers.facebook.com/docs/instagram-platform/app-review · https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review/submission-guide · https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings · https://developers.facebook.com/docs/apps/business-verification
