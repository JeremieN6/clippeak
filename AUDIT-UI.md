# Audit UI : ecarts entre l'application et le kit (etape 0 du recadrage)

> 2026-10-29. Kit de reference : canvas Claude Design « Clippeak Studio : back-office » (UI kit, onboarding, 8 etapes, tableau de bord, carte clip, publication, etats) et `BRIEF-UI-ONBOARDING.md`.
> Methode : application de production construite en local sur une base jetable (`scripts/integration/ui-serve.mjs`), puis mesure automatique des styles reels (polices, tailles, couleurs, rayons, ombres, taille des zones cliquables) sur chaque ecran du studio, de `/admin` et des pages publiques, en bureau (1440) et telephone (390). Comparaison avec les valeurs du kit et lecture du code des composants.
> **Limite** : les captures d'ecran du navigateur integre etaient trop petites pour juger le rendu a l'oeil. Les ecarts ci-dessous sont des ecarts MESURES ou LUS dans le code ; la comparaison visuelle pixel par pixel reste a faire pendant le passage ecran par ecran.

## Ce qui est deja fidele au kit (a ne pas toucher)
- Couleurs de base (`#0E0D12` fond, `#16141C` cartes, `#2C2837` bordures, `#7C3AED` accent, `#B9A0FF` accent clair, textes `#F3F1F7` / `#ABA5BA` / `#928BA2`) et couleurs d'etat (succes, avertissement, information, erreur).
- Boutons (44 px, rayon 10), champs (48 px, rayon 10), cartes (rayon 16), pastilles, alertes, interrupteur, zone de depot : memes valeurs que le kit.
- Corps de texte en Manrope ; echelle de tailles 12 a 22 px quasi identique.
- Tableau de bord : navigation a gauche, « Prochaine action », compteurs par statut, filtres, lots repliables : meme structure que la maquette.
- Telephone : aucun defilement horizontal sur l'etape 1 ni sur le tableau de bord.

## Ecarts, par ordre d'importance

### 1. Pas de source unique pour les styles (cause de la plupart des ecarts) — P1
- Trois systemes cohabitent : classes `st-*` (studio.css), palette Tailwind `clippeak-*` (landing, quelques endroits d'`/admin`), et **couleurs ecrites en dur** dans les composants.
- Mesure : 161 couleurs `#xxxxxx` ecrites dans les composants du studio, 13 dans les pages, 8 dans l'admin, 6 dans la connexion, 5 dans les pages legales. Aucune variable CSS.
- Consequence : chaque ecran peut deriver sans que personne le voie. **Correctif** : variables CSS uniques (couleurs, rayons, espacements, hauteurs) alignees sur la page « UI kit », puis remplacement progressif des valeurs en dur.

### 2. Police des titres : Sora au lieu de Bricolage Grotesque — P1, decision a prendre
- Le kit et le brief demandent Bricolage Grotesque pour les titres. L'application utilise Sora (choix de ma part le 2026-10-27 parce que Sora etait deja chargee). Visible sur tous les titres du studio et de l'admin.
- **Recommandation** : passer a Bricolage Grotesque (charger la police dans `main.css`, une ligne dans `studio.css`). C'est ce que tu as valide en validant les maquettes.

### 3. Effets lumineux et mouvements : le kit dit « aucun halo » — P1, decision a prendre
- Kit : « Surfaces plates, bordures fines, violet reserve aux actions. Aucun halo ni effet lumineux ».
- Application : ombre violette au survol des boutons principaux, barre de progression en degrade animee (« qui brille »), icone qui flotte, pastilles qui grossissent, apparitions animees. Une partie vient de ta demande d'un onboarding « anime » (2026-10-28), donc le kit est en retard sur ta decision.
- **Recommandation** : garder les mouvements discrets que tu as demandes, **supprimer l'ombre violette et le degrade** (c'est ce qui sort le plus du kit), et ajouter au kit une regle « mouvement » (avec coupure si l'utilisateur reduit les animations, deja en place).

### 4. Carte de clip : plus pauvre que la maquette — P1
Par rapport a la maquette `ClipCard` :
- Le **titre** n'est modifiable qu'apres avoir clique sur « Refaire… » ; la maquette le montre toujours dans un champ « Titre en haut du clip » avec le message « le rendu sera relance ».
- Les **hashtags** s'affichent en texte simple ; la maquette les propose en champ modifiable.
- La **note** est une pastille grise ; la maquette la montre en violet, a droite, avec l'**origine** (« Detecte par le chat » / « Ressemble a votre clip ») dans une pastille contour.
- Les etats **rendu en cours** et **echec** sont un texte dans une boite noire ; la maquette les affiche en surimpression sur la video (rotation, barre de progression, icone d'avertissement).
- « Pourquoi cette note » est toujours deplie ; duree et categorie ne sont pas sous la video comme sur la maquette.

### 5. Etats manquants ou differents des maquettes « Etats » — P2
- **Chargement** : simple texte « Chargement… » ; la maquette a une rotation et des **squelettes** de cartes.
- **Analyse en cours** : pas de bandeau bleu « Clippeak cherche les meilleurs moments » avec barre de progression sur le tableau de bord (le brief prevoit « activite en cours »).
- **Plateforme deconnectee** : pas de bandeau jaune avec « Reconnecter » et « Telecharger les clips », ni de message d'echec YouTube comme dans la maquette.
- **Etat vide** : texte seul ; la maquette a une icone, un cadre en pointilles et un bouton « Analyser une VOD ».

### 6. Zones cliquables trop petites (le kit exige 44 px) — P1
Mesure (bureau et telephone) :
- Curseurs de reglage : 28 px de haut (Look, Sons, Detection).
- Cases a cocher des plateformes (etape 7) : 24 × 24 px.
- Creneaux de publication proposes : 36 px de haut.
- Liens du pied de page legal : 20 px de haut ; logo : 32 px.
- Case a cocher « Essai du parcours VOD d'abonnes » (admin) : 13 × 16 px.

### 7. Textes trop petits (le kit interdit moins de 12 px) — P2
- 11 px : pastille d'etat dans « Mes reglages » et valeurs des curseurs de Detection (« 0 s », « 180 s »).
- Les pastilles d'etat utilisent des caracteres texte (`✓`, `!`, `–`) ; le kit utilise de vraies icones SVG, plus nettes et accessibles.

### 8. Couleurs hors kit — P2 (a trier ecran par ecran)
Relevees dans le code, absentes des maquettes que j'ai lues :
- Bandeaux du haut de `/studio` : `#1A1530`, `#6B2F26`, `#2A1512`, `#3A2A66`.
- Cartes VOD : `#1F1A0E`, `#1F5A47`, `#0F1D19` (les maquettes utilisent `#33280F` et `#12302A`).
- Carte clip : `#F3B2A6` ; zone de depot photos : `#12111A` (le kit : `#100F15`).
- Pages legales : texte `#D9D4E5` ; Feedbacks de l'admin : texte `#9FA1B2` et fond `#12121D` (ancienne palette).
- Le decor de l'apercu de l'etape 3 (gris-bleu, jaune) est volontairement hors palette : c'est une fausse video, pas de l'interface.

### 9. Fond de la page et pages publiques — P2
- Le fond de page sous le studio est `#0A0A0F` (ancienne palette) ; le studio pose `#0E0D12` par dessus mais l'ancien reste visible aux bords et au defilement. Pareil pour la connexion, les pages legales et l'admin.
- La landing garde sa propre palette (`#0A0A0F`, `#12121D`, ombre « glow »). **A decider** : la landing est-elle hors kit (page marketing) ou doit-elle s'aligner ?

### 10. Admin — P3, a decider
- `/admin` n'est pas dans les maquettes. Il reutilise les composants `st-*` mais avec ses propres onglets violets pleins. Recommandation : recadrer le cote streamer d'abord, l'admin ensuite (decision deja evoquee).

### 11. Telephone — P2
- Etape 3 (Look) : un element de 622 px de large depasse de l'ecran de 390 px (probablement l'apercu) ; la page ne defile pas horizontalement mais il faut verifier a l'oeil que rien n'est coupe.
- A verifier a l'ecran : carte clip, publication et banniere des VODs sur 375 px (les maquettes ont des versions telephone dediees).

## Plan propose (ordre de travail)
1. **Fondations** (S a M) : variables CSS du kit, Bricolage Grotesque, suppression de l'ombre violette et du degrade, fond de page corrige. Aucune modification de contenu.
2. **Composants communs** (M) : bouton, champ, curseur (zone de 44 px), case a cocher, pastille d'etat avec icone SVG, alerte, carte, squelette. Un seul endroit par composant.
3. **Carte de clip** (M) : refonte selon la maquette (titre et hashtags modifiables, note violette, origine, surimpression rendu/echec).
4. **Etats** (M) : chargement, analyse, plateforme deconnectee, etat vide.
5. **Passage ecran par ecran** (M) : onboarding (8 etapes), connexion, pages legales, puis l'admin. Comparaison a l'oeil avec chaque maquette, bureau et telephone.
6. **Controle final** : refaire cette mesure automatique et corriger ce qui reste.

## Decisions a prendre avant de commencer
1. Bricolage Grotesque pour les titres (recommande) ou garder Sora et mettre le kit a jour ?
2. Supprimer l'ombre violette et le degrade tout en gardant les mouvements doux (recommande) ?
3. La landing suit-elle le kit ou reste-t-elle a part ?
4. L'admin dans ce chantier, ou apres le cote streamer (recommande) ?
