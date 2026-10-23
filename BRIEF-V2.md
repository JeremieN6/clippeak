# BRIEF V2 -- Pipeline de clipping reel

> Brief du porteur (2026-10-23), reformule sans perte. Source : conversation de cadrage + transcription du stream d'un streamer qui a construit ce workflow pour lui (fichier `e50cfbd7-transcription.txt` et captures dans `C:\Users\jngoyimaole\Downloads\captures-bot-clip`, sur le PC du porteur, non versionnes).
> Ce document dit CE QUE l'on veut. Les choix techniques et leurs leviers sont dans `PRISE-DE-POSITION.md`, l'etat d'avancement dans `CLAUDE.md`.

## Contexte
Clippeak etait une landing de validation (simulation du traitement + feedbacks). Un streamer suivi par le porteur a montre en direct qu'il avait developpe lui-meme, avec une IA, un systeme qui clippe ses VODs Twitch ; un second streamer present a dit etre interesse. Le porteur veut s'en inspirer et l'ajouter a la base Clippeak, comme produit clef en main et parametrable pour d'autres streamers.

## Deux sources de moments (aucune obligatoire seule)
1. **Banque de clips de reference** : dossier de clips du streamer (ou de ce a quoi il veut que ses clips ressemblent). On en extrait : clips les plus vus, sujets des plus vus, ceux qui generent le plus de commentaires / likes / partages. Meta jugee inaccessible via application approuvee. Si le chat est calme, cette analyse doit permettre de sortir une vague pertinente.
2. **Chat et pics de commentaires** : mots-cles definis PAR LE STREAMER (il connait sa communaute) : mdr, ptdr, OMG, majuscules repetees, commandes qui declenchent un clip, etc. Repetes = signal.

## Pre-requis
Au moins une chaine de reference : une chaine dont on aime le contenu, ou la sienne pour garder la meme DA. Sert aussi a classer les thematiques par vues et categorie (les futurs clips sont places dans ce classement).

## Les etapes
1. **Recuperer les x dernieres VODs** via l'API Twitch (liens, pas de telechargement par le streamer : des dizaines de Go). Objectif final : recuperation AUTOMATIQUE, clipping a la fin du stream, voire pendant. Lien manuel = option.
2. **Moments forts** : transcrire (voir PRISE-DE-POSITION : seulement autour des pics), reperer ou le chat accelere (mdr, ptdr, LOL, majuscules sur plusieurs messages, commandes de clip, mots-cles du streamer). Pour chaque pic, lire ce que dit le streamer juste avant (timing : quelques secondes avant). Garder les vraies histoires, avis tranches, punchlines. Noter chaque moment sur 10 (potentiel de viralite). Idee : lire aussi les commentaires pour comprendre le contexte. Si le chat reste calme sur toute la VOD, pas de clip issu du chat.
3. **Coupe** : clip vertical 1080x1920, duree minimum 30 s, duree parametrable par le streamer. Commence directement par la phrase d'accroche (ou le sujet declenche), finit a la chute (sujet termine, punchline passee). Couper blancs et silences. Ne JAMAIS finir sur une image figee : un silence n'est pas un vide (le streamer lit son chat) ; finir apres la chute.
4. **Streamer toujours a l'image** : face cam ou grand plan, tout le temps. Il fournit des photos pour etre reconnu ; ne jamais cadrer quelqu'un d'autre (sur les clips de react, ne pas centrer une autre personne ; la camera suit). A determiner : combien de photos sont necessaires, et si c'est vraiment essentiel.
5. **Montage (DA personnelle, modifiable via back-office)** : titre en haut, blanc, legere ombre noire, 3 lignes max, police Lato grasse ou similaire, contour noir, dans une bande/rectangle noir en haut de la video. Zoom au debut + bruit de vent (autres SFX possibles ; le porteur a un dossier de sons ; dire s'il en faut d'autres). Sous-titres mot par mot (optionnels), mot-cle d'une autre couleur (parametrable). GIF/logo/avatar du streamer, optionnel, affichable a differents moments et endroits (parametrable).
6. **Illustrations** : quand le streamer raconte une situation, courte video liee en ecran splite (lui en bas, video en haut), puis retour en grand. Noter la source de chaque video. Doute du porteur : l'IA sera peut-etre mauvaise pour choisir une video ; preferer un dossier d'illustrations du streamer ou il pioche. Question ouverte : comment trouver une courte video de la situation ou de la personne evoquee.
7. **Controle** : son cale avec l'image, coupes propres (silences), noms bien ecrits (y compris le titre visible dans la miniature), puis legende avec hashtags.
8. **Production** : montage a la chaine, 4 clips a la fois, envoi par lots de 4 pour validation. Ne rien publier et ne rien payer sans accord. Le porteur laisse a l'IA le choix de l'organisation de production.

## Optionnel
- **Classification des clips** : de quoi parle le clip (transcription), categorie, puis vues / likes / partages / commentaires.
- **Notation** : a partir de ces donnees, plus un nouveau clip ressemble aux clips performants, plus son potentiel est eleve ; croiser par categorie (ex : le sport fait plus de vues que le voyage, donc un clip voyage peut etre bon pour sa categorie).

## Back-office streamer (a construire)
Reglages : mots-cles du chat, duree des clips, sous-titres oui/non, couleurs d'accent et de mot-cle, GIF/avatar, DA. Les champs de base existent deja dans le modele `StreamerSettings`.

## Questions ouvertes du porteur
- Combien de photos du streamer pour la reconnaissance, et est-ce essentiel ?
- Quels SFX supplementaires ?
- Comment choisir les videos d'illustration (dossier du streamer vs recherche automatique) ?
- Organisation exacte de la production par lots.
