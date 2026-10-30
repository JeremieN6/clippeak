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

## Où on en est (2026-10-30)
- [x] **Domaine vérifié** dans Google Search Console (balise meta dans `nuxt.config.ts`, ne jamais la retirer).
- [x] **Écran de consentement configuré** (fait le 2026-10-28 pour le test d'envoi YouTube) : il reste seulement à **vérifier** que la page « Branding » contient bien logo, page d'accueil, liens confidentialité / conditions et le domaine autorisé `sassify.fr` (rien à refaire si c'est déjà rempli).
- [ ] **Vidéo de démonstration** (voir « Où trouver chaque écran » ci-dessous).
- [ ] **Passage en Production + demande de vérification** (Google Cloud Console).
- [ ] **Formulaire d'audit YouTube**.

## Où trouver chaque écran
**Dans Clippeak (`https://clippeak.sassify.fr/studio`, connecté avec Twitch) :**
- « Tes plateformes » = l'**étape 7** de la liste des étapes à gauche. Depuis le tableau de bord : colonne de gauche « Mes réglages » > « Tes plateformes ». On y trouve « Connecter YouTube » et, une fois connecté, « Déconnecter ».
- « Publier » = sur la **carte d'un clip approuvé** du tableau de bord (bloc « Publier » : publier maintenant ou programmer). Il faut un clip approuvé avec une vidéo : ne jamais utiliser un clip d'un ami ; l'assistant peut préparer un clip de test à partir d'une vidéo du porteur (comme l'essai du 2026-10-29).
- « Mes données » = **menu du compte** (rond avec ton initiale, en haut à droite) > « Mes données ».

**Dans Google Cloud Console (`https://console.cloud.google.com`, projet « Clippeak ») :**
- Menu > « Google Auth Platform » (ancien « Écran de consentement OAuth »). Pages : « Branding » (nom, logo, liens, domaines autorisés), « Audience » (état « Test » ou « En production », bouton **« Publier l'application »**), « Accès aux données » (portées), « Centre de validation » (**soumettre la vérification**).
- Les libellés exacts peuvent varier selon la langue et les mises à jour de Google.

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
