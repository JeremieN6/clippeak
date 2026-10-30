# Brief UI : onboarding conversationnel (colonne de droite)

Destinataire : Claude Design. Les maquettes reviendront ici pour integration dans l'application Nuxt (`/studio`).
Etat du produit au 2026-10-30. Le kit de reference reste celui du canvas « Clippeak Studio : back-office » (couleurs, Bricolage Grotesque + Manrope, rayons 10/12/16, controles 44/48 px, texte 12 px minimum, aucun halo ni degrade, mouvements discrets coupes si `prefers-reduced-motion`). L'application y est deja alignee : ne rien inventer hors kit sans le dire.

## 1. Ce qui change, ce qui ne change pas
Aujourd'hui l'onboarding est un **formulaire par etape** (8 etapes). On veut garder les 8 etapes et leur contenu, mais changer la **colonne de droite** : elle devient un **fil de conversation**, plus immersif, ou Clippeak « parle » et le streamer « repond ».

- **Ne change pas** : la colonne de gauche (liste des 8 etapes avec leur etat : en cours / fait / passee / facultatif, barre de progression « Etape X sur 8 »), la barre du bas sur telephone, l'enregistrement a chaque reponse, le bouton « Plus tard », le retour a n'importe quelle etape depuis la gauche ou depuis le tableau de bord.
- **Change** : la colonne de droite. Plus de gros formulaire : une question a la fois, en bulle ; la reponse du streamer apparait ensuite comme sa propre bulle.

## 2. Principe de la conversation
- **Ecrite a l'avance, sans IA.** Le streamer ne tape pas de texte libre que Clippeak devrait interpreter : il repond avec des **elements places directement dans le fil** (zone de depot de fichiers, boutons de choix, curseurs, interrupteurs, petit champ pour coller des liens). Ces elements sont la « zone de reponse » sous la derniere bulle de Clippeak.
- **Une seule question active a la fois.** Quand il a repondu, sa reponse se range en bulle (resume lisible : « 5 clips ajoutes », « Police : Luckiest Guy, taille 68 »...) et Clippeak enchaine (petite animation de « Clippeak ecrit... » de 400 a 700 ms, jamais plus).
- **L'historique reste visible au-dessus** et **chaque reponse est modifiable** (clic sur la bulle du streamer = la zone de reponse se rouvre a cet endroit, sans perdre le reste).
- **Le fil suit les 8 etapes** : separateur discret « Etape 3 : Le look de tes clips » quand on change d'etape ; un clic sur une etape a gauche fait defiler le fil jusqu'a elle.
- **Ton** : tutoiement, chaleureux mais sobre, phrases courtes, un exemple concret, jamais de jargon (pas de « transcription », « TF-IDF », « mots-cles » : « ce qui a marche chez toi », « ce que dit ton chat »). Clippeak parle a la premiere personne (« Je regarde tes clips pour comprendre ce qui marche »).
- **Plus tard** : reponse rapide toujours proposee (sauf etape 1, obligatoire). Une etape passee reste marquee « a reprendre » a gauche.

## 3. Les 8 etapes en conversation (contenu des echanges)
Pour chaque etape : ce que dit Clippeak, ce que le streamer utilise pour repondre, comment sa reponse se resume.

1. **Clips de reference (obligatoire).** « Montre-moi 5 a 10 clips qui ont bien marche chez toi : ca m'aide a reconnaitre tes meilleurs moments. » Reponse : zone de depot (mp4, mov, webm, 80 Mo max) + champ pour coller des liens (clips ou comptes YouTube Shorts / TikTok / Instagram) + bouton « Ajouter ». Objectif visible : 5 pastilles. Pendant l'analyse, Clippeak repond en direct (« J'ai vu 3 clips sur 5 ») puis resume ce qu'il retient (sujets, formats, emotions). Statistiques de vues : facultatives, derriere « Plus d'options », jamais demandees d'office. Resume : « 6 clips ajoutes ».
2. **Photos (conseille).** « Envoie-moi 3 a 5 photos de toi, de face, pour que je te cadre toujours bien. » Reponse : depot + miniatures avec suppression + compteur « 2 sur 3 minimum ». Resume : « 4 photos : cadrage automatique actif ».
3. **Look (facultatif)** — l'etape la plus riche, la decouper en **plusieurs echanges courts** plutot qu'en un long formulaire : titre (police, taille, couleur, lignes), sous-titres (majuscules, police, taille, couleurs, mise en valeur automatique en 3 niveaux), zoom d'ouverture, cadrage (automatique ou manuel), avatar / GIF, illustrations (oui/non, maximum par clip). **Un apercu 9:16 en direct reste visible a cote ou au-dessus des reponses** et se met a jour pendant qu'on regle (bouton « Rejouer le zoom », « Montrer une illustration »). Resume : « Titre en Luckiest Guy, sous-titres jaunes, zoom d'ouverture ».
4. **Sons.** « Tu veux des bruitages ? » Interrupteur + volume, puis trois situations independantes (debut du clip, chaque illustration, apparition de l'avatar), chacune avec son son parmi 5 integres (vent, whoosh, pop, ding, impact) ou un fichier du streamer, avec **bouton d'ecoute**. Resume : « Bruitages actifs : whoosh au debut ».
5. **Illustrations (facultatif).** « Si tu as de courtes videos a glisser dans tes clips, depose-les. » Pour chacune : « mots qui la declenchent » (ex. marche, legumes) et « credit » (auteur ou lien). Resume : « 3 illustrations ».
6. **Detection.** « Quels mots ecrit ton chat quand il reagit ? » (ex. mdr, omg, kekw) + duree minimale et maximale d'un clip (curseurs, min 15 s ; la minimale doit rester plus courte que la maximale : message d'erreur utile). Resume : « mdr, kekw · 25 a 60 s ».
7. **Plateformes.** « Ou veux-tu publier tes clips ? » Choix multiple (TikTok, Instagram Reels, YouTube Shorts) ; pour chaque plateforme cochee : bouton « Connecter mon compte » et etat (non connecte / connecte / a reconnecter). Seul YouTube se connecte aujourd'hui ; TikTok et Instagram affichent « Bientot » (le streamer peut voter pour la prochaine dans « Prochainement »). Alternative toujours rappelee : « Tu peux aussi telecharger tes clips et les publier toi-meme ». Champ « Tes hashtags » (0 a 2). **Question a ajouter ici** : « Comment veux-tu etre prevenu quand tes clips sont prets ? » (cloche dans l'outil, Telegram, Discord, e-mail) : simple preference enregistree, aucun envoi construit pour l'instant.
8. **Recapitulatif.** Clippeak recapitule dans le fil ce qui est regle, ce qui manque (liens vers les etapes passees), puis bouton principal « Clippeak surveille mon prochain live » qui ouvre le tableau de bord.

## 4. Elements d'interface a concevoir
- **Bulle Clippeak** (avatar rond « CP » du kit, texte, eventuelle aide en petit) et **bulle du streamer** (alignee a droite, fond accent du kit, resume de sa reponse, icone « modifier »).
- **Indicateur « Clippeak ecrit... »** (3 points, discret) et transition d'apparition d'une bulle (fondu + leger decalage, pas de rebond).
- **Zone de reponse** collee en bas du fil, avec ses variantes : depot de fichiers, liens, choix (pastilles), curseur avec valeur, interrupteur avec reglages conditionnels, ecoute d'un son, choix de couleur. Toujours un bouton « Plus tard » et un bouton principal « Continuer ».
- **Separateur d'etape** dans le fil, **reponse resumee modifiable**, **etat de chargement/analyse en direct** (« J'analyse tes clips... » avec progression).
- **Apercu 9:16 en direct** de l'etape 3 integre au fil (voir le brief precedent, section 7, pour les zones et regles du titre).
- **Etats** : vide, chargement, erreur d'envoi (message utile : « Ce lien n'est pas accepte : colle un lien YouTube, TikTok ou Instagram »), fichier trop lourd, connexion YouTube reussie / annulee / echouee, enregistrement en cours.
- **Reprise** : le streamer revient plus tard ; le fil se reconstruit avec ses reponses resumees et se place sur la premiere etape non faite.

## 5. Contraintes
- **Telephone d'abord pour la lecture** (375 px) : la colonne de gauche devient un bouton repliable « Etapes : ... » deja existant ; le fil occupe tout l'ecran ; la zone de reponse reste accessible au pouce ; aucun defilement horizontal ; zones cliquables >= 44 px ; texte >= 12 px.
- **Accessibilite** : le fil est une liste lue dans l'ordre (`role="log"` ou liste), la nouvelle bulle est annoncee, focus place sur le premier champ de la zone de reponse, contrastes du kit, mouvements coupes si `prefers-reduced-motion`.
- **Rien de lourd** : pas de bibliotheque d'animation, CSS seulement. Les 8 etapes et leurs routes existent deja cote serveur (aucune API a inventer).
- **Rien n'est publie sans accord** : l'etape 7 ne publie rien, elle connecte et enregistre un choix.

## 6. Livrables attendus
1. **Ecran 1 : etape 1** (clips de reference) en conversation, bureau : premiere question, depot, reponse resumee, analyse en direct.
2. **Ecran 2 : etape 3** (look) en conversation avec l'apercu 9:16 integre, bureau.
3. **Ecran 3 : recapitulatif** (etape 8), bureau.
4. **Ecran 4 : version telephone** (375 px) d'un moment du fil (etape 1 ou 3) avec la zone de reponse.
5. **Composants** : bulle Clippeak, bulle streamer, zone de reponse (variantes), separateur d'etape, indicateur « ecrit... ».

Si un choix de ton ou de rythme est ambigu (tutoiement, longueur des phrases, vitesse d'apparition), proposer **deux variantes** plutot que trancher en silence.
