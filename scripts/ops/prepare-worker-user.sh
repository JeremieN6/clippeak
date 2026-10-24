#!/bin/bash
# Prepare un utilisateur systeme dedie au worker Clippeak (rien n'est arrete ni supprime).
# A lancer en root sur le VPS : bash scripts/ops/prepare-worker-user.sh   (idempotent)
set -euo pipefail
APP=/srv/saas/clippeak
DATA=/srv/saas/clippeak-data
ENVF=/etc/clippeak/worker.env

id clippeak >/dev/null 2>&1 || useradd --system --home-dir "$DATA" --no-create-home --shell /usr/sbin/nologin clippeak
mkdir -p "$DATA" /etc/clippeak

# Cache du modele Whisper : le worker n'a pas acces au dossier personnel de root.
if [ -d /root/.cache/huggingface ] && [ ! -d "$DATA/hf" ]; then cp -r /root/.cache/huggingface "$DATA/hf"; fi
chown -R clippeak:clippeak "$DATA"
chmod 750 "$DATA"

# Fichier d'environnement du worker : UNIQUEMENT les variables dont il a besoin (jamais la cle SSH, SMTP, mot de passe admin...).
umask 077
: > "$ENVF.new"
for k in DATABASE_URL TWITCH_CLIENT_ID TWITCH_CLIENT_SECRET ANTHROPIC_API_KEY CLIPPEAK_LLM_MODEL \
         TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID DISCORD_WEBHOOK_URL WHISPER_PYTHON WHISPER_MODEL WHISPER_THREADS \
         RENDER_THREADS CLIPPEAK_DATA_DIR CLIPPEAK_PUBLIC_URL WORKER_POLL_SEC WORKER_LIVE_INTERVAL_SEC \
         WORKER_LIVE_ANALYSIS VISION_PYTHON VISION_MODELS_DIR; do
  line=$(grep -m1 "^$k=" "$APP/.env.local" || true)
  if [ -n "$line" ]; then echo "$line" >> "$ENVF.new"; fi
done
echo "HF_HOME=$DATA/hf" >> "$ENVF.new"
mv "$ENVF.new" "$ENVF"
chown root:clippeak "$ENVF"
chmod 640 "$ENVF"

# Configuration pm2 propre au VPS (hors depot) : le worker tourne sous l'utilisateur clippeak, avec son seul fichier d'environnement.
cat > "$APP/ecosystem.worker.vps.config.cjs" <<'EOF'
module.exports = {
  apps: [
    {
      name: 'clippeak-worker',
      script: '.output/worker/index.cjs',
      cwd: __dirname,
      uid: 'clippeak',
      gid: 'clippeak',
      node_args: '--env-file=/etc/clippeak/worker.env',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      kill_timeout: 30000,
      max_memory_restart: '600M',
      env: { NODE_ENV: 'production' }
    }
  ]
}
EOF

echo "--- resultat (noms de variables, jamais les valeurs) :"
id clippeak
stat -c '%U:%G %a %n' "$ENVF" "$DATA" "$APP/ecosystem.worker.vps.config.cjs"
grep -oE '^[A-Z_]+=' "$ENVF" | tr -d '=' | tr '\n' ' '; echo
echo "--- nom des variables sensibles NON copiees :"
for k in SSH_PRIVATE_KEY ADMIN_PASSWORD SMTP_PASS POSTHOG_API_KEY; do if grep -q "^$k=" "$ENVF"; then echo "ERREUR $k copiee"; else echo "ok $k absente"; fi; done
