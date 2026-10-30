# Audit Google / YouTube : passer de « vidéos privées » à « vidéos publiques »

Dernière mise à jour : 2026-10-30. Les formulaires de Google changent : en cas de doute, suivre la page officielle. Référence : la doc de `videos` de l'API YouTube indique que les vidéos envoyées par `videos.insert` depuis un projet **non audité** (créé après le 28 juillet 2020) restent **privées**, et que le projet doit passer un **audit** pour lever cette restriction (https://developers.google.com/youtube/v3/docs/videos).

## Pourquoi il y a DEUX démarches (elles se préparent ensemble)
1. **Vérification OAuth** de l'application (console Google Cloud). Elle fait passer l'écran de consentement de « Test » à « Production ». Effets : plus d'expiration de l'accès au bout de 7 jours, plus de limite à 100 comptes de test, plus d'écran « application non vérifiée ». La portée `youtube.upload` est une portée **sensible** (pas « restreinte »), donc **pas d'évaluation de sécurité par un tiers**.
2. **Audit « YouTube API Services » et extension de quota** (formulaire séparé de YouTube). Il lève la restriction « vidéos privées ». C'est celui-ci qui porte le vrai blocage.

Les vidéos déjà envoyées en privé restent privées : après l'audit, il faut les renvoyer.

## Ce qui est déjà prêt
- Pages publiques : `https://clippeak.sassify.fr/confidentialite` et `https://clippeak.sassify.fr/conditions` (relues par le porteur le 2026-10-30).
- Contact : `contact.clippeak@sassify.fr`.
- Redirection OAuth déclarée : `https://clippeak.sassify.fr/api/auth/youtube/callback`.
- Un envoi réel vérifié en production (vidéo privée).
- Une seule portée demandée : `https://www.googleapis.com/auth/youtube.upload` (envoi seulement ; aucune lecture ni suppression).

## Ce qu'il reste à faire, dans l'ordre (par le porteur : il faut le compte propriétaire du projet Google Cloud)
1. **Vérifier le domaine** `clippeak.sassify.fr` dans Google Search Console (propriété « Domaine » ou « Préfixe d'URL »), avec le compte propriétaire du projet Cloud. Puis, dans Cloud Console > API et services > Écran de consentement OAuth > **Domaines autorisés**, ajouter `sassify.fr`.
2. **Compléter l'écran de consentement** : nom de l'application (Clippeak), e-mail d'assistance, logo (120 × 120 px), page d'accueil (`https://clippeak.sassify.fr`), lien vers la politique de confidentialité et vers les conditions (les mêmes que ci-dessus), e-mail de contact du développeur. **Le lien vers la politique de confidentialité doit aussi figurer sur la page d'accueil** : à vérifier sur la landing (pied de page).
3. **Tourner la vidéo de démonstration** (écran, 3 à 4 minutes, à mettre sur YouTube en « non répertoriée ») qui montre, en anglais ou avec sous-titres anglais : (a) la connexion à Clippeak ; (b) le clic sur « Connecter YouTube » ; (c) **l'écran de consentement de Google en entier, avec l'identifiant du projet visible dans l'URL** ; (d) un clip approuvé dans le studio ; (e) le bouton « Publier » ; (f) le résultat sur la chaîne YouTube ; (g) « Déconnecter YouTube » qui retire l'accès. Voir le scénario ci-dessous.
4. **Passer l'application en « Production »** (bouton « Publier l'application » de l'écran de consentement) et **envoyer la demande de vérification** avec la justification de portée ci-dessous et le lien de la vidéo. Délai habituel : quelques jours à quelques semaines ; Google répond par e-mail et peut poser des questions.
5. **Remplir le formulaire « YouTube API Services Audit and Quota Extension »** (formulaire officiel de YouTube) : numéro du projet Cloud, description de l'usage, vidéo de démonstration, confirmation du respect des conditions de YouTube (Developer Policies), pas de stockage des vidéos des utilisateurs au-delà de ce qui est nécessaire, suppression des données sur demande. Les réponses sont prêtes ci-dessous.
6. Quand Google confirme : **renvoyer** un clip de test pour vérifier qu'il sort en **public**.

## Justification de la portée (à coller, en anglais)
> Clippeak turns a Twitch streamer's live streams into short vertical clips. The streamer reviews each clip and explicitly approves it; only then can they schedule or publish it to their own YouTube channel as a Short. We request the single scope `youtube.upload` so that, on the streamer's explicit action, the application can upload the approved video file to the channel the streamer connected. We do not read, list, modify or delete any existing video, playlist, comment or channel data, and we never publish anything without the streamer's explicit approval. The streamer can disconnect YouTube at any time from the application, which revokes the access token.

## Réponses types pour le formulaire d'audit (en anglais)
- **What does your application do?** Clippeak helps Twitch streamers produce short vertical clips from their streams. The streamer validates each clip, then chooses to publish it to their own YouTube channel at a time of their choosing.
- **How do you use the YouTube API?** Only `videos.insert` (resumable upload) with the `youtube.upload` scope, once per clip, after an explicit click on "Publish" by the channel owner.
- **Who are your users?** French-speaking Twitch streamers invited by us; each one connects their own YouTube channel with OAuth.
- **What user data do you store from YouTube?** An encrypted (AES-256-GCM) OAuth access/refresh token and the connected account name. Nothing else. Tokens are deleted when the user disconnects YouTube or deletes their account.
- **Do you share YouTube data with third parties?** No.
- **Can users delete their data?** Yes: disconnect YouTube (revokes the token at Google) and delete the account, which erases all stored data.
- **Estimated volume:** a few clips per streamer per week (well under the default quota).
- **Links:** privacy policy https://clippeak.sassify.fr/confidentialite ; terms https://clippeak.sassify.fr/conditions ; contact contact.clippeak@sassify.fr.

## Scénario de la vidéo de démonstration (≈ 3 min)
1. Page d'accueil de Clippeak (privacy policy visible en pied de page). 2. Connexion avec Twitch. 3. Studio > « Tes plateformes » > « Connecter YouTube ». 4. Écran de consentement Google, avec la portée lisible et l'URL (le client ID visible). 5. Retour dans Clippeak : « YouTube connecté ». 6. Tableau de bord : un clip approuvé, bouton « Publier » > « Maintenant ». 7. La vidéo apparaît sur la chaîne YouTube. 8. Menu du compte : « Déconnecter YouTube » puis « Supprimer mes données ».
(Le point 8 demande la suppression de compte, en cours de construction : tourner la vidéo après sa mise en ligne.)

## Ce que je peux faire pour toi
- Relire la landing pour vérifier que le lien de confidentialité est bien visible dans le pied de page.
- Préparer un clip de test prêt à publier pour le tournage.
- Te dire quand coller chaque texte, étape par étape, en regardant ton écran avec toi si tu le souhaites.
