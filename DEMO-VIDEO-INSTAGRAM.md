# Vidéo de démonstration Instagram pour Meta : mode d'emploi

Pour le dépôt de la revue (étape 5 de `PROCEDURE-INSTAGRAM.md`). Une seule vidéo montre les deux permissions : `instagram_basic` et `instagram_content_publish`. Écrit le 2026-11-16 d'après le vrai parcours essayé le jour même. Ce qui n'est pas confirmé par Meta est marqué **(non confirmé)**.

## Règles de Meta à respecter
Lues sur les pages « Submission guide » et « Screen recordings » : montrer la **connexion complète** (se connecter, accorder, utiliser, puis se déconnecter et se reconnecter), enregistrer **seulement la fenêtre du navigateur**, **sans son**, curseur bien visible, résolution **1080 de haut ou plus** (largeur d'écran 1440 maxi), interface en **anglais si possible, sinon des légendes en anglais**. Durée et poids maximaux : **non indiqués** (vise 3 à 5 minutes et moins de 100 Mo, ce sont nos choix, pas ceux de Meta).

## Avant d'enregistrer (10 minutes)
1. **Navigateur propre** : une seule fenêtre, aucun onglet perso, aucune notification, pas d'e-mail ni de nom visibles hors de ceux de la démo, barre d'adresse **visible** (le domaine `clippeak.sassify.fr` doit se voir).
2. **Facebook en anglais** (Paramètres Facebook > Langue) pour que les écrans de Meta soient en anglais. Le studio Clippeak reste en français : on ajoute des légendes.
3. **Dans Clippeak, déconnecte Instagram** (étape « Tes plateformes » > Déconnecter) pour pouvoir montrer la connexion depuis zéro.
4. **Un clip approuvé prêt** sur ta chaîne réelle (jamais une chaîne de test ou de démo : Clippeak refuse de publier pour elles).
5. **Compte Instagram professionnel** avec un rôle sur l'app Meta, et l'app en mode **Développement** (c'est normal avant la revue).
6. **Légende de démo neutre** : par exemple « Clippeak demo ». Tu pourras **supprimer le Reel** ensuite sur Instagram (l'appel d'API réussi dans les 30 jours est déjà fait, c'est lui que Meta vérifie).
7. **Enregistrement** : Windows `Win + Alt + R` (Xbox Game Bar), ou OBS (gratuit), en capturant la fenêtre du navigateur. Pas de micro. Curseur grossi : Windows > Paramètres > Accessibilité > Pointeur de souris.
8. **Sous-titres** : ajoute les légendes ci-dessous après coup (CapCut, Clipchamp ou DaVinci Resolve, tous gratuits). Une légende reste 3 à 5 secondes.

## Scénario (légendes en anglais à coller telles quelles)

| # | Ce que tu fais à l'écran | Légende |
|---|---|---|
| 1 | Ouvre `https://clippeak.sassify.fr` (domaine visible). Connecte-toi avec Twitch (bouton de la page de connexion) et arrive dans le studio. | Clippeak turns Twitch stream VODs into vertical clips that the streamer reviews and approves. The streamer signs in with Twitch. |
| 2 | Va à « Tes plateformes ». Montre Instagram : « Connecter ». | The streamer wants to publish approved clips as Instagram Reels. Instagram is not connected yet. |
| 3 | Clique **Connecter Instagram Reels**. La fenêtre de Meta s'ouvre. (Si « Changer de compte » apparaît, clique **Continuer**.) | Clippeak sends the streamer to Meta's login. |
| 4 | Écran « Sélectionnez les éléments professionnels » : montre le **portefeuille business** et le **compte Instagram**. Ne choisis **pas** de compte publicitaire. Clique **Suivant**. | The streamer chooses which business portfolio and which Instagram professional account to share with Clippeak. No ad account is requested. |
| 5 | Écrans « Associez votre compte » puis « … a été associé à Clippeak ». Clique **Terminer**. | Meta confirms the connection. Clippeak asks for two permissions only: instagram_basic and instagram_content_publish. |
| 6 | Retour dans le studio : le **nom du compte** s'affiche (`@…`). Si plusieurs comptes sont partagés, montre la liste **Choisir un autre compte Instagram**. | instagram_basic: Clippeak reads the account's ID and username, and shows them so the streamer knows which account will receive the Reel. |
| 7 | Ouvre un **clip approuvé**. Lis l'aperçu quelques secondes. | The streamer reviews the clip before anything is published. |
| 8 | Dans la zone Instagram : montre le compte cible, **modifie un peu la légende**. | The caption is editable. Nothing is published automatically. |
| 9 | Clique **Publier sur Instagram**. Attends « Publié » (1 à 5 minutes : laisse défiler ou coupe l'attente avec une légende). | instagram_content_publish: only when the streamer clicks this button, Clippeak publishes this single approved video as a Reel on the connected account. |
| 10 | Clique « Voir » : le **Reel apparaît sur le profil Instagram** (page Instagram du compte). | The Reel is live on the streamer's own Instagram account. |
| 11 | Retour dans Clippeak : clique **Déconnecter** pour Instagram. | The streamer can disconnect at any time. The access token is deleted from Clippeak. |
| 12 | Clique de nouveau **Connecter Instagram Reels** et refais rapidement les écrans de Meta jusqu'au nom du compte. | The streamer can reconnect at any time. |

## À savoir avant de déposer
- **Écran des permissions : (non confirmé)**. Avec la connexion unifiée, tes captures n'ont pas montré d'écran qui liste les deux permissions : les droits sont fixés dans la configuration de l'app. Meta demande de montrer « l'écran où l'utilisateur accorde chaque permission ». Si la relecture refuse pour cette raison, réponds dans le dépôt que la connexion unifiée n'a pas d'écran séparé, et montre la configuration (Instagram > API setup with Unified login) avec les deux permissions. Pour que ce soit visible, **ajoute une scène 5 bis** : ouvre le tableau de bord de l'app et montre la liste des permissions de la configuration, avec la légende « The configuration requests only these two permissions ».
- **Accès pour les relecteurs** : le studio est sur invitation (voir « Accès pour les relecteurs » dans `PROCEDURE-INSTAGRAM.md`). À régler **avant** de déposer.
- **Qualité** : relis la vidéo en entier avant l'envoi : aucune donnée perso visible, légendes lisibles, étapes dans l'ordre. Exporte en MP4.
