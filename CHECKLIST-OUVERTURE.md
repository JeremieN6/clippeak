# Liste de contrôle avant l'ouverture publique

Dernière mise à jour : 2026-10-31. État mesuré le même jour sur le serveur de production (voir « État mesuré » en bas).
Légende : ✅ fait et vérifié · 🔧 je peux le faire (code ou réglage) · 👤 à faire par le porteur · ⏳ dépend d'un tiers.

## 1. Pour que les gens trouvent l'outil
- 🔧 **La page d'accueil n'a aucun lien vers « Se connecter ».** Un visiteur ne peut pas arriver sur `/connexion` ni sur la page d'attente. Ajouter dans l'en-tête et le héros un bouton « Se connecter / Demander un accès ». Décision : le texte du bouton.
- 🔧 Page d'accueil : mentionner la bêta sur invitation et le plafond gratuit (40 clips par mois) pour ne rien promettre de plus.
- 🔧 Plan du site (`sitemap.xml` absent) et image de partage (aperçu dans Discord, X, WhatsApp) : petit, utile pour l'ouverture.
- 👤 Choisir le canal de lancement (Discord, Twitch, X) et qui invite en premier. Aujourd'hui : **1 seule invitation** (jeremfut7), aucune demande d'accès.

## 2. Juridique et vie privée
- ✅ Politique de confidentialité et conditions en ligne, mises à jour pour Stripe, le plafond, les demandes d'accès, YouTube et les sauvegardes.
- 🔧 **Cookies de mesure d'audience.** PostHog tourne sur le site public (cookie et stockage local) **sans bannière de consentement**, et la politique ne cite que le cookie de session. Pour un public français ce n'est pas conforme. Deux options : une bannière « Accepter / Refuser » (PostHog ne démarre qu'après accord), ou une mesure sans cookie (moins précise, aucune bannière). À trancher.
- 👤 **Relecture par un juriste (ou toi, attentivement) des deux pages**, surtout : l'éditeur écrit « Sassify » (hypothèse de ma part), la reconnaissance du visage (photos), les offres et la résiliation. Ce sont des brouillons.
- 👤 Mentions légales de l'éditeur : numéro d'immatriculation, adresse, responsable de publication (obligatoires pour un service payant).

## 3. Paiement (Stripe)
- ✅ Mode test de bout en bout (paiement, portail, résiliation, plafond selon l'offre, annulation à la suppression du compte).
- 👤 **Décider le prix et le nombre de clips de l'offre Creator** (aujourd'hui 19 € et 120 clips, choisis au hasard).
- 👤 TVA : numéro de TVA, taux, factures (Stripe sait les produire, il faut les renseigner).
- 👤 Politique d'annulation et de remboursement, à écrire dans les conditions.
- 🔧 **Passage en production** : je prépare, tu valides. Étapes : créer le produit et le prix en production, le webhook de production, configurer le portail client de production, poser les clés `sk_live_` (saisie masquée) et faire un vrai paiement de 19 € que tu te fais rembourser.
- 👤 Activer les paiements sur le compte Stripe (informations de l'entreprise, compte bancaire) : seul le porteur peut le faire.

## 4. Google et YouTube
- ✅ Vérification OAuth et audit YouTube envoyés le 2026-10-30.
- ⏳ **Réponses de Google et de YouTube** (par e-mail). Tant qu'elles ne sont pas là, les vidéos publiées restent **privées** et la publication n'est pas utilisable par d'autres.
- 👤 À la réponse : me la transmettre, puis renvoyer un clip de test pour vérifier qu'il sort en public.
- ⏳ TikTok et Instagram : accès à obtenir chez eux (voir `ACCES-API-PLATEFORMES.md`), pas bloquant pour l'ouverture.

## 5. Exploitation
- ✅ Serveur en bonne santé (voir mesures), certificat HTTPS valide jusqu'au 2027-01-29 avec renouvellement automatique, déploiement continu avec garde-fou des migrations, sauvegardes chiffrées (fichiers + base) avec copie sur Mega, essai de restauration réussi.
- 👤 **Première sauvegarde automatique** : le cron de 3 h 30 n'a encore jamais tourné seul (seules les exécutions manuelles du 30 octobre existent). À vérifier demain matin : `/var/log/clippeak-backup.log`.
- 🔧 **Chaînes de test** (Joel, Arthur) : à supprimer en fin d'essais, avec leurs photos et clips (données d'amis). Tu m'as demandé de les garder pour l'instant.
- 👤 **`jeremfut7` est plafonnée à 40 clips** comme tout le monde : la mettre en illimité dans `/admin` si tu veux continuer tes essais sans limite.
- ⏳ **Charge** : le serveur n'a 2 cœurs que pour 16 applications. À mesurer avec plusieurs streamers réels ; le plafond de 40 clips protège en attendant. Prévoir une alerte si la file s'allonge.
- ⏳ Analyse **pendant un live** : jamais vérifiée sur un vrai direct. À tester au prochain live de `jeremfut7` (non bloquant : le traitement reprend à la fin du live).
- 👤 Rotation des clés (SSH de déploiement, clé de chiffrement des jetons) : à planifier, pas urgent.

## 6. Suivi et premiers retours
- ✅ PostHog configuré (tableau de bord du parcours, événements nommés, espaces privés protégés).
- 👤 Regarder le tableau de bord PostHog après les premiers streamers : où ils abandonnent dans l'onboarding, combien approuvent un clip, combien reviennent à J+7.
- 🔧 Notifications par streamer (Telegram ou e-mail) : volontairement retirées tant qu'il n'y a pas de streamers.
- 🔧 Demandes d'accès : `/admin` > Invitations, à consulter régulièrement.

## État mesuré le 2026-10-31
- Site et worker en ligne ; charge 0,09 ; mémoire 5,1 Go disponibles sur 7,8 ; disque à 46 % ; dossier de données 1,1 Go.
- Base : 4 chaînes (jeremfut7, démonstration, 2 chaînes de test), 1 invitation, 0 demande d'accès.
- Certificat HTTPS : valide jusqu'au 2027-01-29, renouvellement automatique actif.
- `robots.txt` autorise l'indexation de la page d'accueil ; le studio, l'admin et l'attente sont en `noindex`. Pas de plan du site.
