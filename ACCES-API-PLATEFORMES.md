# Accès aux API de publication (YouTube, TikTok, Instagram)

Objectif : publier un clip approuvé par le streamer, à l'heure qu'il a choisie. Ces demandes sont **à déposer à la main** dans les consoles développeur (compte du porteur) et prennent du temps : à lancer avant que le code de publication soit fini.
Chiffres vérifiés par recherche le 2026-10-28 ; les limites changent, les relire sur les pages officielles au moment de déposer.

## Avant de déposer (commun aux trois)
- [x] Page de confidentialité : `https://clippeak.sassify.fr/confidentialite`
- [x] Conditions d'utilisation : `https://clippeak.sassify.fr/conditions`
- [x] Contact : `contact.clippeak@sassify.fr`
- [ ] Vidéo de démonstration (écran) : connexion Twitch -> parcours -> clip approuvé -> bouton « Publier » -> clip sur la plateforme. À tourner quand la publication existe (même en version test).
- [ ] Icône de l'application et description courte (une phrase : « Clippeak propose des clips de ton live ; tu les valides et ils partent à l'heure choisie »).
- [ ] Domaine vérifié (TikTok et Meta le demandent) : `clippeak.sassify.fr`.

## YouTube (Shorts) — en premier
- API : YouTube Data API v3, `videos.insert`, portée OAuth `https://www.googleapis.com/auth/youtube.upload`.
- Console : Google Cloud (nouveau projet) -> activer l'API -> écran de consentement OAuth -> identifiants « Application web ».
- **Blocage** : un projet non audité publie ses vidéos en **privé** uniquement. Il faut passer l'audit de conformité « YouTube API Services » pour lever la restriction.
- **Quota** : 10 000 unités/jour par défaut. Sources contradictoires sur le coût d'un envoi (100 ou 1 600 unités) : mesurer après un envoi test dans la console (onglet Quotas).
- Redirection OAuth à déclarer : `https://clippeak.sassify.fr/api/auth/youtube/callback` (à créer).

## TikTok
- API : Content Posting API (Direct Post), portée `video.publish` (et `video.upload` pour le brouillon).
- Console : developers.tiktok.com -> créer l'application -> ajouter « Content Posting API » -> vérifier le domaine.
- **Blocage** : sans audit, tout est publié en **privé**, 5 utilisateurs maximum par 24 h, et le compte doit lui-même être privé. L'audit demande la vidéo de démonstration, la politique de confidentialité et une estimation d'usage. Délai annoncé par des tiers : 2 à 4 semaines.
- Plan B immédiat : envoyer le clip dans les brouillons du compte (le streamer termine la publication dans l'application).

## Instagram (Reels)
- API : Instagram API with Instagram Login (ou Graph API), portée `instagram_business_content_publish` (`instagram_content_publish` côté Graph API).
- Le compte du streamer doit être **professionnel ou créateur**.
- La vidéo doit être sur une **URL publique** au moment de la publication (Meta la télécharge) : prévoir une URL signée de courte durée.
- Limite : 100 publications par compte et par 24 h (50 dans d'anciennes pages de la documentation).
- Validation par Meta (App Review) nécessaire pour des utilisateurs qui n'ont pas de rôle sur l'application.

## Ce que le code fait (YouTube : fait le 2026-10-28, TikTok et Instagram : à faire)
- Table de connexions par chaîne et plateforme (jetons chiffrés, clé hors dépôt), table de publications (plateforme, créneau, statut, identifiant externe, erreur).
- Statuts de clip : `approved` -> `scheduled` -> `published` / `publish_failed`.
- Étape du worker qui publie à l'heure prévue, avec nouvelle tentative limitée et message clair en cas d'échec.
- Aucune publication sans action explicite du streamer.
