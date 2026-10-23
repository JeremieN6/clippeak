# Prises de position

Positions prises sur le produit et la technique, avec leur raison et le levier a actionner si le point pose probleme. A relire avant de remettre une decision en question.

| Date | Sujet | Position | Raison | Levier si ca coince |
|------|-------|----------|--------|---------------------|
| 2026-10-23 | Transcription | Ne pas transcrire la VOD entiere : transcrire ~60 s autour de chaque pic de chat. Transcription integrale seulement si le chat est calme et que la banque de clips de reference doit prendre le relais | Cout et temps de calcul sur un VPS partage | Elargir la fenetre autour des pics ; transcrire en entier uniquement les VODs sans pic ; deleguer a une API payante a la minute |
| 2026-10-23 | Chat des VODs | GraphQL non officiel de Twitch | L'API officielle ne fournit pas le chat des VODs | Si l'endpoint change : corriger `twitchChat.ts` (hash, format). Plan B : capturer le chat en direct pendant le live |
| 2026-10-23 | Recuperation des VODs | Automatique (EventSub + liste des videos), lien manuel seulement en option | Le streamer ne doit rien faire ; clipping a la fin du stream voire pendant | Si EventSub pose probleme : interroger Twitch a intervalle regulier ; sinon lien manuel |
| 2026-10-23 | Hebergement du rendu | VPS existant, un rendu a la fois, process separe du site | Seule option peu couteuse connue | Limiter la priorite CPU (`nice`), reduire la resolution/qualite de rendu, ou deporter le rendu sur un serveur dedie |
| 2026-10-23 | Declenchement des clips | Le chat et la banque de clips de reference sont deux sources independantes ; aucune n'est obligatoire seule | Chat calme => pas de clip issu du chat | Ajuster les seuils de `chatPeaks` (`minScore`, `minMessages`) ou les mots-cles du streamer |
| 2026-10-23 | Validation | Rien n'est publie ni paye sans accord humain ; clips envoyes par lots de 4 | Controle qualite et confiance du streamer | Augmenter la taille des lots une fois la qualite eprouvee |
| 2026-10-23 | Reseaux Meta / TikTok | Hors perimetre V2 pour les stats de clips | Pas d'application approuvee accessible | Utiliser les stats Twitch Clips et YouTube ; reevaluer plus tard |
