# Mise en service du worker de clips (VPS)

Ordre a respecter : **1) migration, 2) deploiement du code, 3) dependances systeme, 4) worker**.
Le worker verifie lui-meme (preflight) que la migration est appliquee et que ffmpeg existe : sinon il attend et n'ecrit rien.

## 1. Migration Neon
Appliquer `prisma/migrations/202610241000_v2_clip_pipeline/migration.sql` (console SQL Neon). Elle est **additive** :
colonnes nullables sur `moments` et `clip_jobs`, trois nouvelles tables (`streamer_styles`, `streamer_assets`, `reference_clips`).
Aucune donnee existante n'est modifiee ni supprimee.

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
