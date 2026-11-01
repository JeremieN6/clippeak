# Liste de contrôle avant l'ouverture publique

Dernière mise à jour : 2026-11-01. État serveur mesuré le 2026-10-31 (voir « État mesuré » en bas).
Légende : ✅ fait et vérifié · 🔧 je peux le faire (code ou réglage) · 👤 à faire par le porteur · ⏳ dépend d'un tiers.

## 1. Pour que les gens trouvent l'outil
- ✅ Bouton « Se connecter » (en-tête) et « Se connecter avec Twitch » (héros, offres, appel final) vers `/connexion`. Une personne non invitée arrive sur `/attente` et peut demander un accès.
- ✅ Page d'accueil alignée sur le produit réel (bêta sur invitation, 40 clips gratuits par mois, faux témoignages supprimés, FAQ corrigée).
- ✅ Démo `/try-now` conservée comme **simulation annoncée** (aucun faux ZIP).
- 🔧 Plan du site (`sitemap.xml` absent) et image de partage (aperçu dans Discord, X, WhatsApp) : petit, utile pour l'ouverture.
- 👤 Choisir le canal de lancement (Discord, Twitch, X) et qui invite en premier. Aujourd'hui : **1 seule invitation** (jeremfut7), aucune demande d'accès.

## 2. Juridique et vie privée
- ✅ Politique de confidentialité et conditions en ligne, mises à jour pour Stripe, le plafond, les demandes d'accès, YouTube, les sauvegardes et les cookies.
- ✅ **Bandeau de consentement** : PostHog ne démarre qu'après « Accepter » (aucun cookie, stockage local seulement), « Refuser » aussi simple, retrait possible depuis le pied de page.
- 👤 **Relecture par un juriste (ou toi, attentivement) des deux pages**, surtout : l'éditeur écrit « Sassify » (hypothèse de ma part), la reconnaissance du visage (photos), les offres et la résiliation. Ce sont des brouillons.
- 👤 Mentions légales de l'éditeur : numéro d'immatriculation (SIREN), adresse, responsable de publication (obligatoires pour un service payant).

## 3. Paiement (Stripe)
- ✅ Mode test de bout en bout (paiement, portail, résiliation, plafond selon l'offre, annulation à la suppression du compte). Webhook de test vérifié en production (sans signature : 400 ; signature valide : 200).
- ✅ Prix décidé : **19 € par mois, sans TVA** (franchise en base, auto-entrepreneur). Mention « TVA non applicable, art. 293 B du CGI » dans les conditions (pas sous le prix sur la page d'accueil, à ta demande).
- ✅ Factures : tu as vérifié les réglages dans Stripe. Le code ajoute en plus la mention de TVA au pied de chaque facture, par client. **Si ton modèle de facture Stripe a déjà cette mention, mets `STRIPE_INVOICE_FOOTER=none` dans l'environnement du serveur pour éviter le doublon.**
- ✅ Compte Stripe **réel** lu le 2026-11-01 : produits « Starter » (0 €) et « Creator » (19 €/mois) déjà créés, prix Creator réel = `price_1UWPejIrL7WyQoMKr2CIrS37`. **Il manque encore** : le webhook de production et le portail client de production (aucun des deux n'existe).
- 👤 **Autoriser l'écriture sur le compte Stripe réel** pour que je crée le webhook et le portail (le connecteur a refusé : « permissions supplémentaires »), **ou** les créer toi-même (étapes dans la réponse du 2026-11-01).
- 🔧 **Passage en production** : poser `sk_live_` + `whsec_` de production + `STRIPE_PRICE_CREATOR` réel avec `bash scripts/ops/run-on-vps.sh stripe` (saisie masquée), puis un vrai paiement de 19 € que tu te fais rembourser. Je ne pose rien tant que tu n'as pas dit « on y va ».
- 👤 Politique d'annulation et de remboursement, à écrire dans les conditions.
- 👤 Informations publiques du compte Stripe (nom, adresse, SIREN, e-mail d'assistance) et envoi des reçus par e-mail.
- 👤 À confirmer auprès de l'administration : seuil de chiffre d'affaires de la franchise en base.

## 4. Google, YouTube, TikTok
- ✅ Vérification OAuth et audit YouTube envoyés le 2026-10-30. Un vrai envoi YouTube a été vérifié le 2026-10-29 (en privé).
- ⏳ **Réponses de Google et de YouTube** (par e-mail). Tant qu'elles ne sont pas là, les vidéos publiées restent **privées** et la publication n'est pas utilisable par d'autres.
- 👤 À la réponse : me la transmettre, puis renvoyer un clip de test pour vérifier qu'il sort en public. Pense aussi à déconnecter puis reconnecter YouTube sur jeremfut7.
- 👤 **TikTok** : procédure complète dans `PROCEDURE-TIKTOK.md` (créer l'application, la faire approuver, l'auditer). Le code de publication TikTok n'est pas écrit : on le fait une fois l'application créée.
- ⏳ Instagram : accès à obtenir chez Meta (voir `ACCES-API-PLATEFORMES.md`), pas bloquant pour l'ouverture.

## 5. Exploitation
- ✅ Serveur en bonne santé (voir mesures), certificat HTTPS valide jusqu'au 2027-01-29 avec renouvellement automatique, déploiement continu avec garde-fou des migrations, sauvegardes chiffrées (fichiers + base) avec copie sur Mega, essai de restauration réussi.
- 👤 **Première sauvegarde automatique** : le cron de 3 h 30 n'a pas été vérifié seul. À contrôler : `/var/log/clippeak-backup.log`.
- 🔧 **Chaînes de test** (Joel, Arthur) : à supprimer en fin d'essais, avec leurs photos et clips (données d'amis). Tu m'as demandé de les garder pour l'instant.
- 👤 **`jeremfut7` est plafonnée à 40 clips** comme tout le monde : la mettre en illimité dans `/admin` si tu veux continuer tes essais sans limite.
- ⏳ **Charge** : le serveur n'a que 2 cœurs pour 16 applications. À mesurer avec plusieurs streamers réels ; le plafond de 40 clips protège en attendant.
- ⏳ Analyse **pendant un live** : jamais vérifiée sur un vrai direct (non bloquant : le traitement reprend à la fin du live).
- 👤 Rotation des clés (SSH de déploiement, clé de chiffrement des jetons) : à planifier, pas urgent.
- Décisions du porteur : pas de surveillance des sauvegardes pour l'instant, pas de notifications par streamer tant que l'outil n'est pas public.

## 6. Suivi et premiers retours
- ✅ PostHog configuré (tableau de bord du parcours, événements nommés, espaces privés protégés). Les chiffres ne comptent que les visiteurs qui acceptent le bandeau.
- 👤 Regarder le tableau de bord PostHog après les premiers streamers : où ils abandonnent dans l'onboarding, combien approuvent un clip, combien reviennent à J+7.
- 🔧 Demandes d'accès : `/admin` > Invitations, à consulter régulièrement.

## État mesuré le 2026-10-31
- Site et worker en ligne ; charge 0,09 ; mémoire 5,1 Go disponibles sur 7,8 ; disque à 46 % ; dossier de données 1,1 Go.
- Base : 4 chaînes (jeremfut7, démonstration, 2 chaînes de test), 1 invitation, 0 demande d'accès.
- Certificat HTTPS : valide jusqu'au 2027-01-29, renouvellement automatique actif.
- `robots.txt` autorise l'indexation de la page d'accueil ; le studio, l'admin et l'attente sont en `noindex`. Pas de plan du site.
