import { existsSync, readFileSync } from 'node:fs'

// Variables que le worker a le droit de charger depuis un fichier .env : le strict necessaire (jamais la cle SSH de deploiement,
// SMTP, mot de passe admin...). Le worker lit ces reglages directement dans process.env.
const ALLOWED = /^(DATABASE_URL|TWITCH_CLIENT_ID|TWITCH_CLIENT_SECRET|ANTHROPIC_API_KEY|HF_HOME|RENDER_THREADS|TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID|DISCORD_WEBHOOK_URL|(CLIPPEAK|WHISPER|WORKER|VISION)_[A-Z0-9_]+)$/

export function parseEnvText(text: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^(?:export\s+)?([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line)
    if (!match) continue
    let value = match[2].trim()
    // Une cle privee multi-ligne n'est jamais chargee.
    if (value.startsWith('-----BEGIN') || value.startsWith('"-----BEGIN')) continue
    if ((value.startsWith('"') && value.endsWith('"') && value.length >= 2) || (value.startsWith("'") && value.endsWith("'") && value.length >= 2)) {
      value = value.slice(1, -1)
    }
    values[match[1]] = value
  }
  return values
}

// Charge dans l'environnement les variables autorisees d'un fichier .env, sans jamais ecraser une variable deja definie
// (le fichier d'environnement du processus prime). Fichier absent ou illisible : sans effet. Renvoie les noms charges.
export function loadEnvFile(path: string, env: Record<string, string | undefined> = process.env): string[] {
  let text: string
  try {
    if (!existsSync(path)) return []
    text = readFileSync(path, 'utf8')
  } catch {
    return []
  }
  const loaded: string[] = []
  for (const [key, value] of Object.entries(parseEnvText(text))) {
    if (!ALLOWED.test(key) || env[key] !== undefined || value === '') continue
    env[key] = value
    loaded.push(key)
  }
  return loaded
}
