# Brief UI : onboarding guide + tableau de bord de contenu

Destinataire : Claude Design (UI kit et/ou maquettes). Les maquettes reviendront ici pour integration dans l'application Nuxt.
Etat du produit au 2026-10-27. Tout ce qui est decrit comme "existant" fonctionne deja cote serveur ; l'interface actuelle (`/studio`, 5 onglets) est un back-office provisoire qui sera remplace.

## 1. Produit en deux phrases
Clippeak transforme les lives et VODs Twitch d'un streamer en clips verticaux (1080x1920) prets pour TikTok, Reels et Shorts. Le streamer regle une fois son "look" et ses references, puis valide des lots de 4 clips ; rien n'est jamais publie sans son accord.

## 2. Utilisateur
Streamer Twitch francophone, pas technique, souvent sur PC mais il doit pouvoir valider ses clips depuis un telephone. Il ne connait ni les polices, ni les formats, ni le vocabulaire IA. Pas de jargon : jamais "TF-IDF", "mots-cles", "transcription"... parler de "ce qui a marche chez vous", "ce que dit votre chat", "bruitages".

## 3. Principes
- Tout part des **clips de reference** (clips qui ont deja bien marche) : c'est la base de la detection ; le chat n'est qu'un signal en plus.
- **Modifier = voir.** Toute modification visuelle (couleurs, polices, tailles, position de l'avatar, cadrage, zoom) s'affiche en direct dans un apercu 9:16 a cote des reglages.
- Un champ n'apparait que s'il sert : une option decochee masque ses reglages.
- Chaque champ dit a quoi il sert en une phrase simple, avec un exemple.
- **Approuver n'est pas publier.** Publier est une action distincte, explicite, confirmee.
- Une etape peut etre passee ("plus tard") ; le streamer peut revenir a n'importe quelle etape depuis le tableau de bord.

## 4. Parcours d'onboarding (etapes, dans l'ordre)
Barre de progression, retour/suivant, enregistrement a chaque etape, possibilite de quitter et reprendre.

1. **Vos clips de reference** : deposer plusieurs videos et/ou coller des liens de clips ou de comptes (YouTube Shorts, TikTok, Instagram). Etat d'analyse par clip (en attente, en cours, analyse, echec avec message). Resume de ce que Clippeak a retenu (sujets, formats, emotions, accroches). Statistiques de vues : facultatives, jamais demandees d'office.
2. **Vos photos** : 3 a 5 photos de face pour que Clippeak vous cadre automatiquement. Compteur "2 sur 3 minimum", miniatures, suppression.
3. **Le look de vos clips** : titre (affichage, police, taille, couleur, lignes), sous-titres (affichage, majuscules, police, taille, couleur, couleur et liste des mots mis en valeur), zoom d'ouverture, cadrage (automatique ou manuel : position et zoom), avatar / GIF (fichier, moment d'apparition, position, taille), illustrations (oui/non, maximum par clip). **Apercu 9:16 en direct** (voir 7) avec bouton "rejouer le zoom" et "montrer une illustration".
4. **Les sons** (aujourd'hui cache dans un onglet : a mettre en evidence) : interrupteur general, volume, puis trois situations independantes (debut du clip, a chaque apparition d'une illustration, a l'apparition de l'avatar), chacune avec son propre son choisi parmi : 5 sons integres (vent, whoosh, pop, ding, impact) ou ses propres fichiers. Prevoir l'ecoute des sons.
5. **Vos illustrations** (facultatif) : deposer des courtes videos ; pour chacune : "mots qui declenchent cette illustration" (ex. marche, legumes) et "credit" (auteur ou lien d'origine). Miniatures/lecteur, edition apres coup.
6. **La detection** : "mots que votre chat ecrit quand il reagit" (ex. mdr, omg, kekw) et duree minimale / maximale d'un clip.
7. **Vos plateformes** : question exacte **"Vers quelles plateformes voulez-vous publier vos clips ?"** (choix multiple : TikTok, Instagram Reels, YouTube Shorts, ...). Pour chaque plateforme cochee : bouton "Connecter mon compte" et etat (non connecte / connecte / a reconnecter). Voir 9 pour la contrainte.
8. **Recapitulatif** : ce qui est regle, ce qui manque, bouton "Clippeak surveille mon prochain live".

## 5. Tableau de bord de contenu (remplace l'onglet "Lots a valider")
- **Vue d'ensemble** : compteurs (a valider, approuves, publies, refuses), activite en cours (analyse du live, clips en rendu), prochaine action recommandee.
- **Lots** de 4 clips (meilleurs d'abord), avec **tri et filtres** : statut, lot, note, date, categorie, origine du moment ("detecte par le chat" ou "ressemble a votre clip X").
- **Carte clip** : video 9:16 lisible, titre modifiable (un changement relance le rendu), legende et hashtags modifiables, note /10 avec "Pourquoi cette note", alertes de controle qualite (erreur / avertissement), illustrations utilisees avec leur credit, note libre.
- **Actions** : Approuver, Refuser, Refaire (apres modification du titre), puis **Publier** vers les plateformes choisies a l'etape 7 (selection par clip, confirmation, etat par plateforme : en attente, publie, echec + message). Actions groupees par lot.
- Etats a concevoir : vide (aucun clip encore), chargement, analyse en cours, rendu en cours, echec, avertissements QC, plateforme deconnectee.

## 6. Ton et regles de redaction
Francais, tutoiement ou vouvoiement a trancher (aujourd'hui vouvoiement), phrases courtes, un exemple concret par champ, aucun terme technique. Messages d'erreur utiles ("Ce lien n'est pas accepte : colle un lien YouTube, TikTok ou Instagram").

## 7. Apercu en direct (spec)
Ecran 9:16 (1080x1920 reduit a l'echelle 1/4). Zones reelles : bande noire en haut (300 px) avec titre aligne en haut ; sous-titres centres a 420 px du bas ; avatar positionne en px sur 1080x1920 ; illustration en ecran scinde (illustration en haut de 300 a 1100 px, streamer en bas) ; cadrage = recadrage d'une video 16:9 selon position et zoom. Le titre depend de la taille de police : plus c'est grand, moins il tient de caracteres par ligne et de lignes (68 px : 24 car. x 3 lignes ; 100 px : 16 x 2 ; 120 px : 13 x 1), le texte trop long finit par "...". Les polices de l'apercu sont les memes fichiers que ceux du rendu.

## 8. Contraintes techniques
Nuxt 4 + Vue 3 + Tailwind ; theme sombre actuel (fond quasi noir, accent violet, cartes arrondies) a faire evoluer ; responsive obligatoire (la validation des clips doit etre confortable sur telephone) ; accessible (labels, contrastes, focus) ; les listes de choix (polices, sons) viennent du serveur. Livrer des composants reutilisables (champ, interrupteur + reglages conditionnels, curseur avec valeur, carte fichier avec miniature, carte clip, badge de statut, stepper, apercu 9:16).

## 9. A savoir avant de concevoir la publication
- Aujourd'hui **rien n'est publie** : "approuver" change seulement un statut.
- Publier automatiquement exige, par plateforme, un compte connecte par le streamer (OAuth) **et** une validation de notre application par la plateforme (TikTok Content Posting API : audit ; Instagram : compte professionnel + revue Meta ; YouTube : API Data, quotas et verification). Ces validations prennent du temps et peuvent refuser : la maquette doit gerer les etats "non connecte", "connexion en cours", "echec de publication", et prevoir une alternative "telecharger le clip" pour publier a la main.
- Les statistiques de vues des clips d'autres comptes ne sont pas recuperables de maniere fiable : elles restent facultatives et saisies a la main.

## 10. Donnees et routes existantes (pour calibrer les ecrans)
Authentification par mot de passe admin (a remplacer plus tard par un vrai compte). Lecture : detail du streamer (reglages, DA, fichiers avec lien d'apercu, polices et sons proposes), liste des clips par statut, banque de reference (elements, etat, profil). Ecriture : reglages, DA, depot/suppression de fichiers, modification d'une illustration, ajout/suppression/stats de clips de reference, validation d'un clip (approuver / refuser / refaire). Toutes sous `/api/studio/*`.

## 11. Livrables attendus
1. UI kit : couleurs, typographies, espacements, composants de la section 8, etats (normal, survol, focus, desactive, erreur).
2. Maquettes : chaque etape de l'onboarding (desktop et mobile), le tableau de bord (vue d'ensemble, liste de lots, carte clip, publication), tous les etats de la section 5.
3. Une note sur les parcours (qu'est-ce qui est obligatoire, qu'est-ce qui peut etre passe).
