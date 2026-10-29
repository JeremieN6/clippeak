# BACKLOG Clippeak

> Mis a jour le 2026-10-29. Priorites : **P1** = avant d'ouvrir a d'autres streamers, **P2** = ensuite, **P3** = quand le besoin se confirme.
> Taille : S (< 1 jour), M (quelques jours), L (une semaine ou plus, ou dependance externe).

---

## 1. Demandes du porteur

### 1.1 Page « Prochainement » pour les streamers — P1, M
**But** (decision marketing du 2026-10-29) : montrer que l'outil est vivant, que l'equipe continue de travailler, que la fonction attendue arrive bientot. Reduit le churn, augmente la satisfaction.
- Page `/studio/roadmap` (ou onglet du studio), lisible par tout streamer connecte, avec un lien dans le tableau de bord (et une pastille « nouveau » quand une ligne change).
- Chaque ligne : titre, une phrase de benefice, statut (**En cours** / **Prochainement** / **A l'etude** / **Livre**), eventuellement un trimestre indicatif (jamais de date ferme).
- Section « Livre recemment » avec les 3 a 5 dernieres nouveautes : c'est ce qui prouve que l'outil vit.
- Premieres lignes demandees : **publication automatique vers TikTok**, **statistiques des videos par plateforme dans le tableau de bord**.
- Autres lignes possibles a afficher (voir sections suivantes) : Instagram, notifications par e-mail, YouTube en public.
- Etape 1 : contenu dans un fichier du depot (`app/data/roadmap.ts`), aucun risque, aucune migration. Etape 2 (facultative) : tables `roadmap_items` et `roadmap_votes` + edition dans `/admin`.
- **Bouton « Je veux ca »** (vote, un par streamer et par ligne) : donne un vrai signal de priorite et fait participer le streamer. Demande une table (migration a appliquer par le porteur).
- Piege a eviter : promettre une fonction qui depend d'un acces API pas encore obtenu (TikTok, Instagram). Utiliser « A l'etude » tant que l'acces n'est pas accorde.

### 1.2 Statistiques des videos par plateforme dans le tableau de bord — P2, L
- YouTube : vues, J'aime, commentaires par video publiee (YouTube Data API, lecture). Ajoute une portee OAuth de lecture : les streamers deja connectes devront reautoriser, et cela entre dans le dossier d'audit Google.
- TikTok / Instagram : seulement apres obtention des acces (voir 1.3 et 2.3).
- Stockage : table des statistiques par publication, relevee par le worker (1 releve/jour pendant 14 jours puis hebdomadaire), pour tracer une courbe.
- Interface : compteurs sur la carte du clip publie, bloc « Mes performances » dans le tableau de bord (total par plateforme, meilleur clip), filtre plateforme.
- Effet de bord utile : les statistiques peuvent nourrir la banque de reference (poids des clips qui performent).
- Depend de : au moins une plateforme avec lecture possible (YouTube suffit pour commencer).

### 1.3 Publication automatique vers TikTok — P2, L (dependance externe)
- Acces API TikTok a obtenir (Content Posting API) : demande a deposer, audit requis, **publication privee seulement** tant que l'audit n'est pas passe. Voir `ACCES-API-PLATEFORMES.md`.
- Le code ressemble a YouTube : connexion OAuth, jetons chiffres, `publications` avec plateforme `tiktok`, envoi par le worker, erreurs typees.
- A decider : « automatique » = programmer a l'avance (comme YouTube aujourd'hui) ou aussi « publier tout clip approuve sans clic » ? Recommandation : garder le clic ou la programmation, jamais de publication sans accord du streamer (regle du produit).

### 1.4 Recadrage de l'interface avec le kit — P1, M a L
Constat du porteur : tout n'est pas propre ni a 100 % conforme au kit (maquettes Claude Design, `BRIEF-UI-ONBOARDING.md`).
- **Etape 0 : audit** (une demi-journee) : capturer chaque ecran bureau + telephone (connexion, 8 etapes, tableau de bord, cartes de clip, `/admin` et ses onglets, pages legales, landing) et lister les ecarts avec les maquettes : couleurs, rayons, espacements, typographies, etats (vide, chargement, erreur), boutons, libelles.
- **Etape 1 : jeu de composants** : regrouper les classes `st-*` en composants communs (bouton, carte, champ, badge, onglets, alerte, modale) avec des variables de design uniques ; supprimer les doublons et les styles ecrits en dur.
- **Etape 2 : passage ecran par ecran**, en commencant par ce que voit un nouveau streamer (connexion, etape 1, tableau de bord).
- Inclut : accessibilite (contrastes, focus visible, libelles), etats vides soignes, messages d'erreur lisibles, coherence du francais (accents, tutoiement).
- Condition : decider avant de commencer si le kit fait foi **partout** (y compris `/admin`) ou seulement cote streamer. Recommandation : streamer d'abord, admin ensuite.

---

## 2. Ouvrir l'outil a d'autres streamers

### 2.1 Audit Google / YouTube (passage en production) — P1, L (delai externe)
- Aujourd'hui : application Google en etat « Test », acces expire apres 7 jours, videos **privees**, limite d'utilisateurs de test.
- A faire : verification OAuth du projet Google (page de confidentialite et conditions deja en ligne, video de demonstration, justification de la portee), puis audit de conformite de l'API YouTube pour lever la restriction « prive ».
- A lancer **des maintenant** : les delais de Google sont longs et ne dependent pas de nous. C'est le vrai chemin critique.

### 2.2 Notifications pour chaque streamer — P1, M
- **Constat** : Telegram/Discord envoient aujourd'hui vers le bot du porteur, pas vers chaque streamer. Un streamer invite ne saurait pas qu'un lot est pret.
- A faire : canal de notification par chaine (e-mail en priorite, puis Discord/Telegram au choix dans les reglages), message « ton lot est pret » avec lien vers le studio.
- E-mail : ajouter une dependance d'envoi (SMTP ou service transactionnel) : decision a prendre.

### 2.3 Publication Instagram — P3, L
- Application Meta a creer ; compte du porteur utilisable en mode developpement, revue Meta necessaire pour les autres comptes. Compte professionnel requis cote streamer.

### 2.4 Liste d'attente visible pour l'admin — P2, S
- La page `/attente` n'enregistre rien. Ajouter une table « demandes d'acces » pour voir qui s'est connecte sans invitation et inviter en un clic (migration).

### 2.5 Offres, quotas et paiement — P2, L (a decider)
- Aucun quota ni paiement aujourd'hui. Avant d'ouvrir : decider du modele (gratuit invite / forfait / au clip), limiter le nombre de clips et de VODs par streamer et par mois, puis brancher le paiement.
- A traiter avec la charge VPS (2.6) : le CPU est la vraie ressource limitee.

### 2.6 Charge et fiabilite du VPS — P1, M
- Un seul rendu a la fois ; Whisper ~4x le temps reel sur 2 coeurs, et 16 autres applications partagent le serveur. Avec plusieurs streamers, les files vont s'allonger.
- A faire : mesurer en conditions reelles (2-3 streamers en meme temps), alerte quand la file depasse un seuil, affichage honnete du delai au streamer (« ton lot sera pret vers... »), et decision sur un serveur dedie au worker si besoin.

---

## 3. Donnees, securite, juridique

### 3.1 Sauvegardes et duree de conservation — P1, S a M
- `/srv/saas/clippeak-data` (clips, photos, fichiers deposes) n'a **aucune sauvegarde** documentee. Definir : sauvegarde reguliere (hors serveur), duree de conservation des clips rendus (aujourd'hui seuls les extraits sont purges apres 14 jours).

### 3.2 Suppression de compte et export des donnees — P1, M
- Les photos servent a reconnaitre un visage : donnee sensible. Prevoir pour le streamer : « supprimer mon compte et toutes mes donnees » (photos, clips, fichiers, jetons de plateformes, connexion revoquee) et un export. Meme logique que la suppression d'une chaine de test, a exposer proprement.

### 3.3 Relecture juridique — P1, S (action du porteur)
- `/confidentialite` et `/conditions` sont des brouillons non relus. A verifier : l'editeur est ecrit « Sassify » (hypothese), mentions sur la reconnaissance de visage et le consentement, contact `contact.clippeak@sassify.fr`.

### 3.4 Revue de securite avant ouverture — P1, S
- Relire les routes ajoutees depuis la derniere revue (connexion Twitch, sessions, YouTube, deplacement de VOD, chaines de test, ajout manuel de VOD).
- Points deja notes : limite d'essais basee sur `x-forwarded-for` (a proteger cote nginx), deux cles SSH de deploiement a surveiller (`github-deploy-tifo` distincte, conservee), sauvegardes de `.env.local` sur le VPS a supprimer.

### 3.5 Migrations Neon manuelles — P2, S
- Chaque migration est appliquee a la main par le porteur (le classifieur refuse `migrate deploy`). Pratique tant qu'on est seul, risquee des qu'on deploie vite : documenter une procedure en 3 commandes, ou un pas de deploiement explicite avec verification avant le redemarrage.

---

## 4. Qualite des clips

### 4.1 Clip « pas assez de parole » — P3, S
- Aujourd'hui le moment est refuse. Option : tolerer 10 % sous le minimum, ou repartir sur un autre moment proche, ou proposer au streamer « garder quand meme ».

### 4.2 Camera tres petite ou panneau cote a cote — P3, M
- La disposition en panneau n'est verifiee que sur des mesures simulees. A tester des qu'un vrai exemple se presente. Extraits en 1080p : decision du porteur = on ne revient dessus que si plusieurs streamers se plaignent de la nettete.

### 4.3 Valider les reglages sur de vraies paroles — P3, S
- Seuils des mots mis en valeur (etirement, pause) et fin de clip prolongee (jusqu'a 2 phrases) : a ajuster apres retours de streamers sur plusieurs clips.

### 4.4 Analyse pendant le live et ressemblance — P2, M
- Non verifiees sur un vrai live (lecture video d'une VOD en cours, balayage par ressemblance). A tester avec le prochain live de `jeremfut7`.
- VOD reservee aux abonnes : reste inaccessible pendant le live.

---

## 5. Produit et interface (reste de la liste d'origine)

- **Statut « Publies »** dans le tableau de bord et modale « Publier » des maquettes — P2, M (se rejoint avec 1.2).
- **Previsualisation sonore** des sons integres (fabriques au rendu) — P3, S.
- **Suivi PostHog** du parcours (onboarding, premiere approbation, premiere publication, retour a J+7) pour mesurer ce que la page « Prochainement » change — P2, S.
- **Parcours Twitch reel** : l'aller-retour de connexion apres la refonte `/connexion` -> `/studio` n'est pas verifie avec un vrai streamer invite — P1, S.
- **Telephone** : verifier tout le studio en 375 px apres le recadrage UI.

---

## 6. Dette et nettoyage

- Supprimer les chaines de test d'Arthur et de Joel (photos et clips inclus) apres les essais — S.
- Fichiers `tmp_*.html` a la racine : residus de verification, a supprimer — S.
- Reconfirmer la connectivite Neon en dev et les secrets de deploiement / variables PostHog — S.
- Rotation periodique des cles (SSH, jeton de chiffrement `CLIPPEAK_TOKEN_KEY` : prevoir une procedure de rotation qui re-chiffre les jetons) — M.

---

## Ordre conseille

1. **Maintenant, sans code** : lancer l'audit Google (2.1), les acces TikTok et Instagram (1.3, 2.3), faire relire les pages legales (3.3).
2. **Court terme** : audit UI (1.4 etape 0), page « Prochainement » en version fichier (1.1), notifications par streamer (2.2), parcours Twitch reel (5).
3. **Avant l'ouverture** : recadrage UI, sauvegardes, suppression de compte, revue de securite, mesure de charge (2.6).
4. **Ensuite** : statistiques par plateforme (1.2), TikTok (1.3), liste d'attente, offres et quotas.
