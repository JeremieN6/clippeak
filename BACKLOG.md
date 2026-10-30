# BACKLOG Clippeak

> Mis a jour le 2026-10-29. Priorites : **P1** = avant d'ouvrir a d'autres streamers, **P2** = ensuite, **P3** = quand le besoin se confirme.
> Taille : S (< 1 jour), M (quelques jours), L (une semaine ou plus, ou dependance externe).

---

## 1. Demandes du porteur

### 1.1 Page « Prochainement » avec vote des streamers — P1, M
**But** (decision du 2026-10-29) : **prioriser les fonctions avec les streamers eux-memes** et montrer que l'outil est vivant (reduit le churn). Ce n'est PAS une liste de chantiers internes : pas d'audit Google, pas de relecture juridique, rien de technique.
- Page `/studio/roadmap`, lien dans le tableau de bord, pastille « nouveau » quand le bloc change.
- **Lignes de depart** : Acces TikTok, Acces Instagram, Statistiques des clips par plateforme.
- **Vote par blocs de 2 fonctions**, avec une echeance (2 semaines pour commencer) :
  - un vote = +1 pour la fonction choisie ; un vote par streamer et par bloc, modifiable jusqu'a l'echeance ;
  - les totaux ne s'affichent qu'apres le vote (pas d'effet de suiveur) ;
  - a l'echeance, la fonction la plus votee est developpee en priorite ; la perdante revient dans le bloc suivant avec ses votes conserves ;
  - egalite ou zero vote : l'admin tranche, et l'ecran le dit ;
  - un backlog cache (table en base) dit quelle fonction entre dans le bloc suivant ;
  - premier bloc : TikTok contre Instagram ; deuxieme : la perdante contre les statistiques.
- Statuts affiches : **En vote**, **En cours**, **En attente d'acces** (API de la plateforme pas encore accordee), **Livre**. Formulation « en priorite », jamais « on developpera ».
- Section « Livre grace a vos votes » pour montrer que le vote sert.
- **Champ « Propose une idee »** : les idees arrivent dans une section de `/admin` (table en base) et alimentent les prochains blocs.
- **Notifications** : message dans l'outil (pastille + bandeau) quand le vote du streamer gagne et quand la fonction sort.
- Tables : blocs de vote, fonctions, votes, idees (migration a appliquer par le porteur).
- Ordre : apres le recadrage UI (1.4), pour la construire avec les composants propres.

### 1.5 Refonte de l'onboarding (colonne de droite immersive) — P2, M a L
**Demande du porteur (2026-10-29)** : la colonne de gauche (suivi des etapes) est correcte et reste ; la partie droite doit devenir plus **immersive**, comme **une conversation**, avec une trame et un suivi : Clippeak « parle », le streamer repond, une question a la fois, au lieu d'un formulaire par etape.
- Reference : le porteur donnera l'exemple du site **rustine.io** au moment de s'y mettre ; ne rien concevoir avant.
- Garde : les 8 etapes, l'enregistrement a chaque reponse, « plus tard », le retour a une etape depuis la colonne de gauche, l'apercu en direct de l'etape « look ».
- A traiter apres le recadrage UI (composants propres) et avant l'ouverture aux streamers : c'est la premiere impression.

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
- **Etape 0 : audit — FAIT le 2026-10-29, voir `AUDIT-UI.md`** (ecarts mesures, plan en 6 etapes, 4 decisions a prendre). Etape initialement prevue : capturer chaque ecran bureau + telephone (connexion, 8 etapes, tableau de bord, cartes de clip, `/admin` et ses onglets, pages legales, landing) et lister les ecarts avec les maquettes : couleurs, rayons, espacements, typographies, etats (vide, chargement, erreur), boutons, libelles.
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


### 2.3 Publication Instagram — P3, L
- Application Meta a creer ; compte du porteur utilisable en mode developpement, revue Meta necessaire pour les autres comptes. Compte professionnel requis cote streamer.

### 2.4 Liste d'attente visible pour l'admin — P2, S — FAIT (2026-10-30, branche `feat/access-requests`)
- Un streamer non invite arrive sur `/attente` ; il clique « Prevenez-moi quand une place s'ouvre » (rien n'est enregistre sans ce clic). Identite lue dans un cookie SIGNE pose au retour de Twitch (15 min, `clippeak_wait`), jamais dans le corps de la requete : on ne peut demander que pour soi. Table `access_requests` (migration `202610301800_access_requests`, A APPLIQUER SUR NEON : `bash scripts/ops/migrations.sh apply`, le garde-fou du deploiement bloquera sinon). `/admin` > Invitations : section « Demandes d'acces » avec Inviter (cree l'invitation, retire la demande) et Ecarter ; purge a 90 jours a la lecture ; la demande disparait aussi a la premiere connexion reussie. Politique de confidentialite et page d'attente mises a jour. Tests d'integration etendus.

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

### 3.5 Migrations Neon manuelles — P2, S — FAIT (2026-10-30, branche `ops/migrations-guard`)
- `bash scripts/ops/migrations.sh check|apply|resolve` (adresse jamais affichee, base DIRECTE de Neon) : `check` = lecture seule, code 3 s'il reste une migration ; `apply` = liste, demande « oui », applique ; `resolve <nom>` = enregistre une migration dont le SQL a ete colle a la main dans la console Neon.
- Garde-fou dans `deploy.yml` : apres le build et AVANT `pm2 reload`, `check` ; une migration manquante fait echouer le deploiement (le site reste sur l'ancienne version) avec le message qui dit quoi faire ; etat illisible = simple avertissement.
- Premier resultat reel : `roadmap_votes` et `notifications` etaient appliquees (tables presentes) mais jamais ENREGISTREES dans `_prisma_migrations` (le `migrate resolve --applied` avait ete oublie) : a regler avec `resolve` avant de fusionner la branche, sinon le deploiement s'arrete.

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

- **Statut « Publies »** — FAIT le 2026-10-30 (branche `feat/published-status`) : compteur et filtre « Publiés » dans le tableau de bord (un clip approuvé dont une publication est partie passe de « Approuvés » à « Publiés »), badge « Publié » sur la carte, date et lien dans le panneau de publication. La modale « Publier » des maquettes n'est pas reprise : le panneau existant (maintenant / programmer) fait le meme travail. Les statistiques par plateforme restent en 1.2.
- **Previsualisation sonore** des sons integres (fabriques au rendu) — P3, S.
- **Suivi PostHog** du parcours (onboarding, premiere approbation, premiere publication, retour a J+7) pour mesurer ce que la page « Prochainement » change — P2, S.
- **Parcours Twitch reel** : l'aller-retour de connexion apres la refonte `/connexion` -> `/studio` n'est pas verifie avec un vrai streamer invite — P1, S.
- **Telephone** : FAIT le 2026-10-30 (serveur de demonstration, 375 px) : tableau de bord, cartes de clip, Prochainement, menu du compte, Mes donnees et les etapes 2 a 8 de l'onboarding n'ont aucun debordement horizontal, aucune zone cliquable < 40 px, aucun texte < 12 px (mesure par script ; pas de jugement a l'oeil sur de petites captures).

---

## 6. Dette et nettoyage

- Supprimer les chaines de test d'Arthur et de Joel (photos et clips inclus) apres les essais — S.
- Fichiers `tmp_*.html` a la racine : residus de verification, a supprimer — S.
- Reconfirmer la connectivite Neon en dev et les secrets de deploiement / variables PostHog — S.
- Rotation periodique des cles (SSH, jeton de chiffrement `CLIPPEAK_TOKEN_KEY` : prevoir une procedure de rotation qui re-chiffre les jetons) — M.

---

## Ordre conseille

1. **Maintenant, sans code** : lancer l'audit Google (2.1), les acces TikTok et Instagram (1.3, 2.3), faire relire les pages legales (3.3).
2. **Court terme** : audit UI (1.4 etape 0), page « Prochainement » en version fichier (1.1), parcours Twitch reel (5).
3. **Avant l'ouverture** : recadrage UI, sauvegardes, suppression de compte, revue de securite, mesure de charge (2.6).
4. **Ensuite** : statistiques par plateforme (1.2), TikTok (1.3), liste d'attente, offres et quotas.


## Decisions du 2026-10-30
- **Onboarding conversationnel (1.5)** : conversation ECRITE A L'AVANCE, sans IA (le streamer repond avec des elements places dans le fil : depot, boutons, curseurs). Pas d'exemple externe (rustine.io abandonne). Le porteur veut une MAQUETTE Claude Design avant de coder : brief dans `BRIEF-UI-ONBOARDING-CONVERSATION.md` (4 ecrans). Ensuite : prototype des etapes 1 et 2, puis les 8.
- **Feedback dans le studio** : garder le formulaire de la landing (visiteurs, liste d'attente) ET ajouter une carte de feedback DANS le studio apres le PREMIER CLIP APPROUVE (moment de satisfaction), jamais obligatoire pour recuperer ses clips, 3-4 questions (ce qui manque, satisfaction), stockees avec la chaine (migration a prevoir).

## Etat des P1 au 2026-10-30 (branche `feat/p1-data-account`)
- **2.1 Audit Google** : tout est prepare dans `GOOGLE-AUDIT.md` (2 demarches : verification OAuth puis audit « YouTube API Services », textes en anglais prets). A faire par le porteur : domaine dans Search Console, ecran de consentement complet, VIDEO de demonstration (a tourner apres la mise en ligne de « Mes donnees »), passage en Production, formulaire d'audit.
- **2.2 Notifications** : cloche « Ton lot N est pret » ajoutee (`server/worker/bell.ts`, une fois par chaine et par lot). Telegram / e-mail par streamer : retire du backlog le 2026-10-30 (decision du porteur : outil pas encore public, rien a mesurer ; a rouvrir quand il y aura des streamers).
- **2.6 Charge VPS** : mesure du 2026-10-30 = 2 coeurs, 8 Go (5,2 Go disponibles), disque 46 %, charge 0,07 au repos, 16 applications. Delai honnete affiche (« Compte environ N min »). PAS encore mesure sous charge reelle (2-3 streamers en meme temps) : a faire quand plusieurs streamers sont actifs ; alerte de file non faite.
- **3.1 Sauvegardes** : `scripts/ops/backup-data.sh` pret (archive datee, 7 jours, base si pg_dump) ; PAS installe sur le VPS ; copie hors serveur = decision du porteur (RCLONE_REMOTE). Duree de conservation : videos des clips refuses ou en echec supprimees apres 14 jours (`server/worker/retention.ts`).
- **3.2 Suppression de compte et export** : fait (vue « Mes donnees » dans le menu du compte ; `GET /api/studio/account/export`, `POST /api/studio/account/delete` avec nom de chaine retape ; retire l'autorisation Google et l'ecoute Twitch au mieux, efface base + fichiers + invitation).
- **3.3 Relecture juridique** : faite par le porteur le 2026-10-30.
- **3.4 Revue de securite** : fait. Trouve et corrige : la limite d'essais lisait `X-Forwarded-For` que nginx transmet sans le reecrire (falsifiable : contournement de la limite sur le mot de passe admin) -> lecture de `X-Real-IP` ; ancienne route `/api/admin/twitch/channels` (comparaison non constante, sans limite) -> `requireStudioAdmin` ; formulaire public de feedback sans limite -> 5 envois par minute. Reste : supprimer `.env.local.bak-20261024` sur le VPS (accord du porteur).

## 3.1 Sauvegardes : etat du 2026-10-30
- INSTALLEES sur le VPS (fichiers + base, chiffrees, copie sur Mega, cron 3 h 30) ; voir `OPS-SAUVEGARDES.md`.
- Decision du porteur (2026-10-30) : pas de surveillance du journal pour le moment, l'outil n'est pas public ; on s'en occupera quand il y aura des streamers. Essai de restauration de la base REUSSI le 2026-10-30 (branche Neon jetable, chiffres identiques a la production).
