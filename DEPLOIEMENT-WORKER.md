# Mise en service du worker de clips (VPS)

Ordre a respecter : **1) migration, 2) deploiement du code, 3) dependances systeme, 4) worker**.
Le worker verifie lui-meme (preflight) que la migration est appliquee et que ffmpeg existe : sinon il attend et n'ecrit rien.

## 1. Migration Neon
**Etat au 2026-10-24** : la baseline Prisma est faite sur Neon (table `_prisma_migrations` creee, les 3 premieres migrations marquees "appliquees" apres verification que le schema correspond : 3 feedbacks, 1 chaine, 1 VOD intacts). Il ne reste que `202610241000_v2_clip_pipeline`, additive : colonnes nullables sur `moments` et `clip_jobs`, trois nouvelles tables (`streamer_styles`, `streamer_assets`, `reference_clips`). Aucune donnee existante n'est modifiee ni supprimee.

Pour l'appliquer, depuis le dossier du projet (PowerShell, la valeur de `DATABASE_URL` n'est pas affichee) :
```powershell
$env:DATABASE_URL = (Select-String -Path .env.local -Pattern '^DATABASE_URL=').Line.Split('=',2)[1].Trim('"',"'")
.\node_modules\.bin\prisma migrate deploy
.\node_modules\.bin\prisma migrate status    # doit afficher : Database schema is up to date
```
(Variante : coller le SQL dans la console Neon, puis `prisma migrate resolve --applied 202610241000_v2_clip_pipeline` pour que Prisma le sache.)

Retour arriere si besoin (les colonnes et tables ajoutees sont vides tant que le worker n'a pas tourne) :
```sql
DROP TABLE IF EXISTS "public"."reference_clips", "public"."streamer_assets", "public"."streamer_styles";
ALTER TABLE "public"."clip_jobs" DROP COLUMN IF EXISTS "start_sec", DROP COLUMN IF EXISTS "end_sec", DROP COLUMN IF EXISTS "keep_ranges", DROP COLUMN IF EXISTS "hashtags", DROP COLUMN IF EXISTS "qc", DROP COLUMN IF EXISTS "illustrations", DROP COLUMN IF EXISTS "review_note", DROP COLUMN IF EXISTS "reviewed_at", DROP COLUMN IF EXISTS "notified_at";
ALTER TABLE "public"."moments" DROP COLUMN IF EXISTS "transcript", DROP COLUMN IF EXISTS "before_peak", DROP COLUMN IF EXISTS "hook", DROP COLUMN IF EXISTS "category", DROP COLUMN IF EXISTS "kind", DROP COLUMN IF EXISTS "ai_score", DROP COLUMN IF EXISTS "rationale", DROP COLUMN IF EXISTS "scorer";
```

## 2. Code
Merger les PR dans l'ordre (#1, #2, #3, puis celles de cette serie). Le workflow existant deploie le site ; il ne demarre pas le worker.

## 3. Dependances systeme (une seule fois, sur le VPS)
```bash
apt-get update && apt-get install -y ffmpeg python3-venv fonts-lato
cd /srv/saas/clippeak
python3 -m venv .venv && .venv/bin/pip install faster-whisper
# Telecharge le modele une fois (~480 Mo dans ~/.cache/huggingface) pour que le premier clip ne l'attende pas
.venv/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"
mkdir -p /srv/saas/clippeak-data

# Cadrage automatique (facultatif) : OpenCV + 2 modeles (~38 Mo, empreintes SHA-256 verifiees)
.venv/bin/pip install opencv-python-headless
.venv/bin/python scripts/vision/download_models.py /srv/saas/clippeak-data/models
```
Si le site est derriere nginx, autoriser les depots jusqu'a 60 Mo (`client_max_body_size 64m;`) pour les videos d'illustration.

## 4. Variables (dans `.env.local` du VPS, jamais dans le depot)
```
WHISPER_PYTHON=/srv/saas/clippeak/.venv/bin/python
WHISPER_MODEL=small          # base = plus rapide, moins fiable
WHISPER_THREADS=2            # le VPS a 2 coeurs partages avec le site
RENDER_THREADS=2
CLIPPEAK_DATA_DIR=/srv/saas/clippeak-data
WORKER_POLL_SEC=20           # plus long = Neon se met plus souvent en veille
VISION_PYTHON=/srv/saas/clippeak/.venv/bin/python   # defaut : WHISPER_PYTHON
VISION_MODELS_DIR=/srv/saas/clippeak-data/models     # defaut : <CLIPPEAK_DATA_DIR>/models
WORKER_LIVE_INTERVAL_SEC=300 # analyse pendant le live (0 = couper avec WORKER_LIVE_ANALYSIS=0)
CLIPPEAK_PUBLIC_URL=https://clippeak.sassify.fr   # lien /studio dans les notifications
# Notifications des lots (au moins un canal ; sinon les lots restent visibles dans /studio) :
# DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...   # Parametres du salon > Integrations > Webhooks
# TELEGRAM_BOT_TOKEN=...      # cree avec @BotFather
# TELEGRAM_CHAT_ID=...        # identifiant de votre conversation avec le bot
# ANTHROPIC_API_KEY=...      # facultatif : notation des moments par Claude (sinon note locale)
# CLIPPEAK_LLM_MODEL=claude-sonnet-5-5
```

## 5. Demarrage du worker
```bash
cd /srv/saas/clippeak
npm run build:worker
pm2 start ecosystem.worker.config.cjs
pm2 save
pm2 logs clippeak-worker --lines 30
```
Apres chaque deploiement du site (`rm -rf .output` dans le workflow), relancer `npm run build:worker && pm2 reload clippeak-worker`.

## Fonctionnement
1. Une VOD passe a `ended` (EventSub ou rattrapage) -> le worker lit le chat, detecte les pics (mots-cles du streamer), transcrit ~60 s autour de chaque pic, note les moments et met en file les 8 meilleurs, par lots de 4.
2. Chaque clip est coupe (accroche -> chute, silences retires), cadre en 1080x1920, monte (titre, sous-titres, zoom, SFX, avatar, illustrations), controle (taille, synchro son/image, silences, image figee, titre), puis passe en `review`.
3. Le streamer valide les lots dans `/studio`. **Approuver ne publie rien.**

## Charge attendue (mesures sur un PC 16 coeurs, a refaire sur le VPS)
- Whisper `small` sur 2 threads : ~11 s pour 60 s d'audio ; `base` : ~4 s.
- Rendu d'un clip de 30 a 45 s : ~10 s avec 2 threads (hors telechargement HLS).
- Tout tourne en priorite basse, un job a la fois.

## Mesurer la vitesse reelle sur le VPS
Apres l'etape 3, une mesure de 60 s d'audio public francophone (a copier-coller, puis a me renvoyer la ligne `transcribe_s`) :
```bash
cd /srv/saas/clippeak
ffmpeg -nostdin -loglevel error -y -ss 1035 -t 60 -i "https://d3stzm2eumvgb4.cloudfront.net/f4470f0bf1ecec8eea54_yassencore_318080702052_1792583357/audio_only/index-dvr.m3u8" -vn -ac 1 -ar 16000 /tmp/bench.wav
time WHISPER_THREADS=2 .venv/bin/python scripts/whisper/transcribe.py /tmp/bench.wav small | head -c 200
```
Repere : ~11 s sur un PC recent a 2 threads (`small`). **Mesure sur le VPS (2 coeurs) le 2026-10-24 : 13,9 s pour 60 s d'audio**, donc `small` convient. Au-dela de ~40 s, passer a `WHISPER_MODEL=base`.
