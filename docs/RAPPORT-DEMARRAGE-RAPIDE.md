# Rapport : un nouveau streamer voit ses clips en moins de 24 h

Date : 2026-11-16. Branche `feat/demarrage-rapide`. Les délais marqués **(estimé)** viennent des repères du code (`vodProgress.ts`) et d'un raisonnement sur le serveur : ils n'ont PAS été mesurés en réel. Ceux marqués **(prouvé)** viennent de la lecture du code.

## Réponses aux questions

### 1. À l'inscription, quels lives passés sont enregistrés et analysés ?
- **Avant ce travail : aucun (prouvé).** `callback.get.ts` créait la chaîne et l'écoute EventSub, sans enregistrer de live. Le rattrapage (`vodCatchup.ts`) ignore volontairement tout ce qui date d'avant l'inscription (`createdAt >= channel.createdAt`). Un nouveau streamer n'avait donc **rien** à analyser avant la fin de son prochain live.
- **Maintenant :** à la première connexion, ses **2 derniers lives** sont enregistrés tout de suite (`welcomeVods.ts`). Règles : pas plus de 14 jours, au moins 10 minutes, le 2e live seulement s'il tient avec le 1er dans 10 h d'audio (le plafond gratuit de la lecture par le contenu). Un live en cours au moment de l'inscription est enregistré comme « en direct » (avant : jamais repris). Si la reprise échoue à la connexion (Twitch lent, 6 s max), le rattrapage toutes les 5 min la refait pour une chaîne de moins de 3 jours restée sans VOD.

### 2. Faut-il finir l'onboarding avant que l'analyse démarre ?
**Non (prouvé).** Rien dans `server/worker/` ni dans le rattrapage ne lit l'état de l'onboarding. La chaîne est créée avec les réglages par défaut (`settings: { create: {} }`), `autoClip` vaut vrai par défaut, la détection est en mode « les deux » (contenu + chat). Seule l'interface bloquait : l'étape 1 demande un clip de référence pour « Continuer », et le studio s'ouvre sur l'onboarding tant qu'il n'est pas fini. Maintenant un bandeau « démarrage rapide » en haut de l'onboarding et du tableau de bord dit où en est l'analyse, avec un bouton « Voir mon tableau de bord ». L'onboarding long reste possible.

### 3. Combien de temps entre l'inscription et le premier lot de 4 clips ?
**Estimé, serveur libre : 15 à 30 minutes. Serveur chargé : plus.** Le détail (estimé) :

| Étape | Durée |
|---|---|
| Inscription → live enregistré | moins de 6 s (ou 5 min au pire par le rattrapage) |
| Attente que le worker soit libre (il fait une tâche à la fois, ~20 s entre deux tâches) | 0 à quelques minutes |
| Analyse du chat + 12 pics transcrits + extraits sources, live de 3 h | ~7 min (repère `vodProgress.ts` : 2 min + 1,5 s par minute de live) |
| Montage des 4 premiers clips | ~2 min (30 s par clip, repère `RENDER_SEC_PER_CLIP`) |
| Lecture par le contenu (Groq, tranches de 5 min) d'un live de 3 h | 10 à 20 min (estimé : 15-30 s par tranche, **jamais mesuré** : la détection par le contenu n'a pas encore tourné sur un vrai live) |

Les premiers clips viennent de l'analyse du chat (étape 3 et 4) puis la lecture par le contenu en ajoute. Le bandeau annonce `analyse + 4 × 30 s`, plus la file devant le streamer.

**Limite de capacité (estimé) :** le worker est unique et fait une tâche à la fois. Par nouveau streamer il travaille environ 45 à 60 minutes (2 lives lus + jusqu'à 20 clips montés). Cela fait **environ 25 inscriptions par jour au maximum** avant que « moins de 24 h » ne tienne plus. Au-delà la file s'allonge. Le bandeau en tient compte : il ajoute les lives et clips des autres devant le streamer et passe à « plusieurs heures » au-delà de 2 h au lieu de promettre trop court. **Conseil : inviter par vagues de 15 à 20 par jour** pendant GTA 6, et regarder l'onglet Capacité. À confirmer par le test réel (partie 3).

### 4. Qu'est-ce qui bloque ?
- **Live réservé aux abonnés (prouvé)** : le worker ne peut pas lire la VOD, il la marque « bloquée », prévient l'admin (Telegram) et le studio affiche une carte « Revérifier ». Le bandeau dit maintenant : « Ton live est réservé aux abonnés… rends-le public », sans délai promis.
- **Plafond d'audio gratuit 10 h/mois (prouvé)** : deux lives de 5 h le consomment. Au-delà, la lecture par le contenu s'arrête (le chat continue). Pour cette raison le 2e live repris est écarté s'il dépasse le budget.
- **File de rendu (prouvé)** : un seul rendu à la fois, ~30 s par clip (estimé). Le rendu passe avant l'analyse.
- **Clés manquantes (prouvé)** : sans `GROQ_API_KEY` (et sans `WORKER_LOCAL_FALLBACK=1`), la lecture par le contenu est désactivée et seul le chat travaille ; sans `ANTHROPIC_API_KEY` elle échoue à chaque lecture. Dans les deux cas le bandeau n'annonce plus une attente infinie : il passe à « pas de moment assez fort cette fois » quand tout ce qui peut tourner a tourné.
- **Plafond de 20 clips (prouvé)** : l'analyse et la lecture s'arrêtent pour la chaîne (message de limite, partie 2).
- **Trouvé et corrigé : la transcription des pics de chat se faisait en local (prouvé).** `analysis.ts` appelait Whisper sur le serveur pour chaque pic (jusqu'à 12 par live, plusieurs minutes pendant lesquelles les 2 cœurs ne rendent plus rien), ce qui contredisait la règle « pas de repli local ». Elle passe maintenant par Groq si la clé existe (le local seulement avec `WORKER_LOCAL_FALLBACK=1`) ; sans clé Groq, comme avant.
- **Prérequis hors de ce travail :** la migration `202611151000_content_detection` doit être marquée résolue pour que PR #101 et celle-ci se déploient.

### Point à connaître, non corrigé
Le premier live peut consommer les 20 clips gratuits à lui seul (chat jusqu'à 8, puis la lecture par le contenu 4 par passage de 30 min), et le 2e live attend le mois suivant. Piste : limiter à ~10 clips par live pour un compte gratuit. À décider avec le porteur (c'est une décision produit : « voir ses lives découpés »).

## Ce qui a été changé
- `server/utils/clipping/welcomeVods.ts` (+ tests) : reprise des derniers lives ; appelée par `callback.get.ts` (6 s max, sans bloquer la connexion) et par le rattrapage.
- `server/utils/clipping/startProgress.ts` (+ tests) et `GET /api/studio/channels/:id/start-progress` : phase et délai estimé, file des autres chaînes comprise.
- `StudioStartBanner.vue` : bandeau (onboarding, tableau de bord, mobile), visible 7 jours après l'inscription, relu toutes les 30 s.
- `StudioQuotaNotice.vue`, `quotaLevel()` dans `quota.ts` (+ tests) : message de limite (partie 2).
- `worker/analysis.ts` : pics de chat transcrits par Groq.

## Partie 2 : le passage à Creator
- **À 80 % (16 clips sur 20)** : message court « Plus que 4 clips ce mois-ci », bouton « Voir Creator » (descend à la carte « Mon offre »).
- **À 100 %** : « Tu as obtenu tes 20 clips du mois » ; tes clips restent disponibles ; les lives en attente sont comptés et attendent le 1er du mois ; bouton **« Passer à Creator : 12 € par mois, facturé 144 € par an »** (annuel en premier, lance le paiement Stripe) + « Voir les offres ». Les lives en pause repartent dès le paiement (prouvé : ils restent à l'état « terminé » et sont repris dès que la place existe). Pour un abonné Creator qui atteint son plan : bouton « Gérer mon abonnement » (ajouter un pack). Sans Stripe configuré : seul le message reste.
- Ce message remplace l'ancien (« écris à contact… »), sur ordinateur et téléphone.

## Partie 3 : test réel sur `jeremfut7` (à lancer par le porteur)
**Avant tout** : la migration `202611151000_content_detection` doit être marquée résolue et PR #101 déployée (sinon rien de la détection par le contenu ne tourne). Puis fusionner cette PR (« Fusionne ») et attendre la fin du déploiement.

**Vérification des clés sur le VPS** (affiche seulement un nombre, jamais une clé ; 2 attendu) :
```bash
grep -E -c '^(GROQ_API_KEY|ANTHROPIC_API_KEY)=.' /srv/saas/clippeak/.env.local
```

**Test A, le plus simple (rediffusion à la main, ne teste pas l'inscription)** : dans `/studio` de `jeremfut7`, « Analyser une VOD », coller le lien d'un de ses lives passés (de moins de 14 jours, plus de 20 minutes, public). Noter l'heure.

**Test B, le vrai parcours d'un nouveau streamer** : le test A ne passe pas par la reprise à l'inscription (elle ne joue que pour une chaîne sans aucune VOD). Pour la tester : dans `/studio` > Mes données, « Supprimer mes données » sur `jeremfut7` (c'est ta propre chaîne de test, ça efface ses clips), puis, dans `/admin` > Invitations, réinviter `jeremfut7` (la suppression retire aussi l'invitation), puis te connecter par `/connexion`. Tu dois voir tout de suite le bandeau « On analyse ton dernier live ».

**Quoi regarder, et noter les heures :**
1. Bandeau du studio : phase et délai annoncé. Noter le délai annoncé.
2. Sur le VPS, voir la reprise et le travail du worker :
```bash
pm2 logs clippeak --lines 50 --nostream | grep -E "login|rattrapage"
```
```bash
pm2 logs clippeak-worker --lines 100 --nostream
```
On doit lire « live(s) recent(s) enregistre(s) pour l'analyse », puis « VOD … analysee » et « detection par le contenu ».
3. `/admin`, onglet Capacité : verdict, file d'attente, temps d'attente des clips.
4. Heure d'apparition des premiers clips dans « À valider ».
5. Pour la lecture par le contenu : l'heure à laquelle les clips issus de la parole arrivent, après ceux du chat.

**Ce qu'il faut me renvoyer** : l'heure d'inscription (ou du clic), le délai annoncé, l'heure des 4 premiers clips, l'heure de la fin de la lecture complète. Je corrigerai les constantes de `vodProgress.ts` et `startProgress.ts` avec les vrais chiffres. Ne publie aucun clip de ce test sans les avoir regardés.
