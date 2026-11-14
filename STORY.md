# STORY.md -- Memoire Narrative

> Ce fichier raconte le projet pour un public exterieur (article de blog, presentation,
> nouvel arrivant non technique). Il complete CLAUDE.md, qui reste la memoire technique.
> A mettre a jour apres toute decision business, pivot ou apprentissage terrain --
> pas apres un simple changement de code.

---

## Objectif produit
Donner a voir, sans backend de production reel, ce a quoi ressemblerait un service qui transforme automatiquement une VOD Twitch en clips prets a poster -- pour valider l'interet du produit et collecter des retours qualifies avant de construire le vrai moteur de traitement.

---

## Statut actuel
Clippeak est un vrai produit en bêta sur invitation. Un streamer se connecte avec Twitch ; l'outil détecte ses VODs, repère les moments forts (chat + transcription), découpe et monte des clips verticaux avec sa direction artistique, et lui propose des lots à valider dans un studio. Rien n'est publié sans son accord ; la publication YouTube fonctionne (en privé tant que Google n'a pas audité l'application). Un plafond gratuit de 40 clips par mois protège le serveur ; un plan payant « Creator » à 19 EUR par mois est branché sur Stripe, passé en production le 2026-11-02. La page d'accueil décrit le produit réel, la démo `/try-now` reste une simulation annoncée comme telle.

Pas encore ouvert au public : réponses de Google et YouTube attendues, TikTok et Instagram à obtenir, premiers vrais streamers à inviter. Le suivi détaillé est dans `CHECKLIST-OUVERTURE.md`.

---

## Historique des pivots

### 2026-07-01/02 -- D'une landing monolithique a un parcours structure
**Contexte** : la premiere version de la landing a ete livree d'un bloc, sans respecter la structure section par section attendue dans le brief initial.
**Decision** : refonte complete en composants dedies par section, avec une navigation par ancres et un CTA principal clair.
**Resultat** : parcours conforme au brief, plus facile a faire evoluer section par section par la suite.

### 2026-07-02 -- Le feedback devient un moment du parcours, pas une barriere
**Contexte** : une premiere version verrouillait le bouton de telechargement du ZIP tant que le formulaire de feedback n'etait pas rempli.
**Decision** : le formulaire reste visible et encourage juste apres le resultat de la simulation, mais ne bloque plus la sortie -- le feedback devient une conversion volontaire a forte intention plutot qu'une contrainte.
**Resultat** : parcours plus fluide, coherent avec l'objectif de recueillir des avis sinceres plutot que des reponses forcees.

### 2026-07-02 -- Simplification du formulaire de feedback
**Contexte** : le formulaire posait deux questions qui se recoupaient sur la maniere dont l'utilisateur recevrait son ZIP.
**Decision** : suppression de la question redondante, conservation d'une seule question source de verite sur la plateforme de reception preferee.
**Resultat** : formulaire plus court, donnees plus propres a analyser cote admin.

### 2026-07-02 -- Choix d'un deploiement continu sur infrastructure propre
**Contexte** : le projet avait besoin d'un chemin de mise en production simple pour que la landing soit accessible en dehors du poste de dev.
**Decision** : mise en place d'un pipeline GitHub Actions qui deploie automatiquement sur `main` vers un VPS via SSH, gere par pm2.
**Resultat** : chaque merge sur `main` se retrouve en production sans etape manuelle.

### 2026-10-23 -- De la simulation au vrai produit
**Contexte** : Clippeak etait une landing de validation. Un streamer suivi par le porteur a montre en direct qu'il avait construit lui-meme, avec une IA, un pipeline de clipping (VODs, pics de chat, montage vertical, DA personnelle) ; un second streamer present a dit etre interesse. L'idee avait ete envisagee des mois plus tot.
**Decision** : considerer ce signal comme suffisant pour lancer la V2 sans attendre l'analyse des feedbacks de la landing ; construire le vrai pipeline par briques, en commencant par la detection des moments forts. Differenciation voulue : ce que le streamer a fait pour lui seul, propose clef en main et parametrable (mots-cles, style, duree) pour les autres.
**Resultat** : en cours. Signal de demande anecdotique (deux streamers), non chiffre.

---

### 2026-10-24 -- Le pipeline de clips existe, verifie en local
**Contexte** : apres la validation technique de Twitch (VOD en direct, chat, EventSub), le porteur a demande de terminer toute la chaine du brief : coupe, rendu vertical, DA, illustrations, controle, lots de 4, back-office.
**Decisions du porteur** : (1) transcription par Whisper local, gratuit, plutot qu'une API payante a la minute ; (2) cadrage automatique du streamer par reconnaissance du visage a partir de ses photos ; (3) rien n'est publie ni paye : approuver un clip ne fait que le marquer, la publication reste au streamer.
**Apprentissages terrain** : les VODs reservees aux abonnes ou protegees sont inaccessibles sans connexion du streamer (levier OAuth deja prevu) ; une chaine non affiliee comme celle du porteur n'expose parfois que l'audio de ses VODs ; le VPS n'a que 2 coeurs, mais la mesure sur place donne Whisper `small` a ~14 s par minute d'audio (~4x le temps reel), sans cout par minute : une VOD de 3 h devrait etre traitee en une dizaine de minutes (estimation, a confirmer sur le premier vrai passage). Le chat reagit APRES la chute : la coupe se cale sur la derniere phrase terminee avant le pic.
**Resultat** : pipeline complet ecrit et verifie en local (vraies VODs publiques, vrai Twitch, ffmpeg, Whisper, base jetable). PAS deploye : migration non appliquee, worker non demarre ; la landing publique reste une simulation. Aucun retour d'utilisateur reel sur la qualite des clips : a obtenir avec un premier streamer test avant toute communication.

---

## Ce que la cible attend / a appris
- A ce stade, aucune donnee de feedback reelle issue d'utilisateurs externes n'a ete analysee dans ce document -- l'espace admin existe pour cela, mais aucun chiffre (taux de completion, volume de retours, satisfaction) n'a encore ete releve et documente ici. Toute statistique citee ailleurs sur ce projet doit etre verifiee directement dans l'espace admin avant d'etre reutilisee.
- Le parcours a ete concu en partant du principe que forcer une action (feedback obligatoire pour telecharger) degrade la qualite du signal recueilli -- c'est une hypothese de design assumee, pas encore validee par des donnees d'usage reelles.

---

## Garde-fous de contenu
- Ne jamais publier de detail exploitable sur la configuration de deploiement (nom d'hote VPS, chemins serveur, secrets, structure des workflows CI) au-dela de ce qui est deja public dans le depot.
- Ne jamais transcrire de chiffre business (taux de conversion, volume de feedbacks, satisfaction) sans indiquer sa source verifiable (ex. export de l'espace admin a telle date) ou le marquer explicitement "a verifier".
- Ne pas presenter le flow de traitement de VOD comme fonctionnel en production : c'est une simulation assumee tant que le moteur reel n'est pas construit. Toute communication externe doit rester honnete sur ce point.
- Garder un ton factuel et respectueux envers les utilisateurs ayant laisse un feedback ; ne jamais citer de retour individuel de maniere identifiable sans consentement explicite.

---

- Notifications : sur les 3 feedbacks de la landing (export de la base le 2026-10-24, echantillon minuscule et probablement en partie des essais, a verifier), 2 choisissent Discord et 1 Telegram comme canal de reception, aucun le mail. Hypothese : commencer par Discord/Telegram.
- Les streamers connaissent leur communaute : ce qui fait reagir leur chat (mots, rythme) doit etre regle par eux, pas devine. Retour terrain a valider avec de vrais utilisateurs.

- Decision du 2026-10-27 : le produit devient un parcours d'onboarding guide + un tableau de bord de contenu avec publication directe vers les plateformes choisies par le streamer, plutot qu'un back-office a onglets. Contrainte a surveiller : la publication automatique depend de validations d'application par TikTok, Instagram et YouTube (delais, refus possibles). Le streamer ne doit jamais avoir a connaitre un nom de police ou un terme technique.

- Decision du 2026-10-27 : acces des streamers par « Se connecter avec Twitch », SUR INVITATION du porteur (pas de parrainage entre streamers, pas d'inscription libre au debut) pour maitriser la charge du VPS ; la page a mot de passe devient strictement un acces administrateur. Chaque streamer ne voit que ses propres donnees.

- Decision du 2026-10-29 : ajouter une page « Prochainement » (roadmap visible par les streamers, avec TikTok et les statistiques par plateforme) pour montrer que l'outil est vivant et reduire le churn ; premiere version en fichier, vote « Je veux ca » ensuite. Premier vrai envoi YouTube verifie le meme jour (prive). Backlog complet dans `BACKLOG.md`.

---

## 2026-10-30 -- Clippeak demande l'ouverture publique a Google
Pour que les clips publies sur YouTube soient visibles de tous (et pas seulement en prive), l'application doit etre verifiee par Google puis auditee par YouTube. Le porteur a passe l'application en production, fait declarer l'acces « envoyer des videos », tourne une video de demonstration de 3 minutes et soumis la verification. L'audit YouTube (le vrai verrou « prive / public ») est le formulaire suivant. C'est le dernier obstacle externe avant d'ouvrir Clippeak a d'autres streamers : les delais ne dependent plus du projet mais de Google.

## 2026-10-31 -- Le modele economique prend forme : gratuit avec plafond, un seul plan payant
Decisions du porteur : beta gratuite sur invitation avec un plafond de 40 clips par mois et par chaine (le serveur de 2 coeurs est la vraie ressource limitee), un seul plan payant « Creator » (120 clips par mois, 19 EUR par mois : prix mis au hasard, a ajuster), pas de plan multiple au depart. Le paiement (Stripe, mode test) est branche avant l'ouverture publique, contrairement au plan initial « apres 5 a 10 streamers » : le porteur veut pouvoir tester le parcours complet des maintenant. La resiliation est libre (portail Stripe, jamais bloquee). Pas de vrais paiements tant que prix, TVA et conditions ne sont pas valides. Apprentissage : le suivi PostHog n'avait jamais fonctionne en production (cle vide au build) : il faut verifier l'effet reel d'un outil de mesure, pas seulement sa presence.

## 2026-11-02 -- Premiers paiements réels possibles
Le porteur est auto-entrepreneur, sans TVA (franchise en base) : le client paie 19 EUR, la mention légale est en pied de facture Stripe. Les clés Stripe de production (clé restreinte), le webhook et le prix réel sont posés sur le serveur. Reste à enregistrer le portail client réel dans Stripe et à faire un vrai paiement de 19 EUR remboursé. Apprentissage : un test d'API « à vide » peut créer de vraies données en production (un client vide créé puis supprimé) : ne jamais sonder une écriture avec une clé réelle. Côté outillage, le fichier de mémoire du projet avait grossi jusqu'à 100 Ko et était rechargé à chaque échange : l'historique détaillé est maintenant archivé dans `docs/HISTORIQUE-PROJET.md`.

## 2026-11-13 -- TikTok : première revue refusée, pour l'icône
Le portail TikTok a refusé l'app : l'icône de la fiche ne correspondait pas à celle du site et de l'onglet du navigateur. Le logo était bon, mais le site affichait un rond « CP » et un favicon générique. Le logo est maintenant le même partout (favicon, en-têtes, pied de page) ; l'app doit être renvoyée en revue après le déploiement. Apprentissage : les revues des plateformes (TikTok, et sans doute Google et Instagram) comparent l'identité visible du site (icône, nom) à celle déclarée sur leur portail : la poser d'abord sur le site, puis la déclarer.

## 2026-11-14 -- Tarifs : annuel par défaut, packs de clips
Comparaison avec Opus Clip (concurrent) : eux facturent des minutes de vidéo importée (un live de 3 h = 180 crédits sur un forfait de 150 à 300 par mois), nous facturons des clips : notre coût ne grandit pas avec la durée du live puisqu'on ne transcrit que les passages autour des pics de chat. Grille décidée par le porteur : gratuit 40 clips ; Creator 19 EUR par mois ou 12 EUR par mois facturé 144 EUR par an (-37 %, annuel mis en avant et sélectionné par défaut), par packs de 120 clips (1 à 5). Cible : la vague de nouveaux streamers (sortie de GTA 6) et des streamers établis. Non mesuré : le coût réel par clip (la télémétrie de coûts peut le donner) ; la remise annuelle prudente (Opus fait -50 %) laisse de la marge à ajuster.

## 2026-11-14 -- Gratuit baissé à 20 clips par mois
Décision du porteur : le plan gratuit passe de 40 à 20 clips par mois (il aurait même dit 15), pour « appuyer sur la douleur » et donner envie du plan supérieur. Risque connu : les streamers déjà en bêta qui ont produit plus de 20 clips ce mois-ci sont immédiatement au plafond (leurs lives sont mis en attente jusqu'au mois suivant) ; les chaînes de test et de démonstration restent illimitées. À surveiller : la conversion vers Creator et les retours des premiers streamers.

## Derniere mise a jour
2026-11-13 -- TikTok : premiere revue refusee (icone), corrigee. 2026-11-02 -- Statut mis a jour (produit reel, Stripe en production). 2026-10-25 -- Banque de reference redefinie (base de tout). 2026-10-24 -- Ajout du bilan du pipeline de clips (verifie en local, non deploye). Pivot V2 du 2026-10-23 conserve. Creation initiale du fichier le 2026-08-27 a partir de l'historique git et de `tasks/lessons.md`.
