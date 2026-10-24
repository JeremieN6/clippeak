// Notification des lots de 4 clips a valider : Discord (webhook) et/ou Telegram (bot), sans dependance ni SMTP.
// Les secrets (URL de webhook, jeton du bot) viennent de l'environnement, ne sont jamais journalises ni renvoyes dans une erreur.

export interface NotifyClip {
  id: string
  title: string | null
  caption: string | null
  score: number | null
  // Chemin absolu du fichier video du clip.
  videoPath: string
}

export interface BatchNotification {
  batch: number
  clips: NotifyClip[]
  studioUrl: string
}

export interface Notifier {
  name: 'discord' | 'telegram'
  send(notification: BatchNotification): Promise<void>
}

export interface NotifierDeps {
  fetchFn?: typeof fetch
  readFile?: (path: string) => Promise<Buffer>
  sleep?: (ms: number) => Promise<void>
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const DISCORD_WEBHOOK = /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,120}$/
const TELEGRAM_TOKEN = /^\d{5,15}:[\w-]{30,60}$/
const TELEGRAM_CHAT = /^(?:-?\d{5,20}|@[A-Za-z][\w]{4,31})$/
const DISCORD_MAX_BYTES = 24 * 1024 * 1024
const TELEGRAM_MAX_BYTES = 45 * 1024 * 1024

export class NotifierConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotifierConfigError'
  }
}

export function buildBatchText(notification: BatchNotification, limit = 1900): string {
  const lines = [
    `Lot ${notification.batch} : ${notification.clips.length} clip${notification.clips.length > 1 ? 's' : ''} pret${notification.clips.length > 1 ? 's' : ''} a valider`,
    ...notification.clips.map((clip, i) => `${i + 1}. ${(clip.title || 'Sans titre').replace(/\s+/g, ' ').slice(0, 90)}${clip.score !== null ? ` (note ${clip.score}/10)` : ''}`),
    '',
    `Valider ou refuser : ${notification.studioUrl}`,
    'Rien n\'est publie tant que vous n\'avez pas valide.'
  ]
  const text = lines.join('\n')
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

async function loadFiles(clips: NotifyClip[], maxTotal: number, readFile: (path: string) => Promise<Buffer>): Promise<Array<{ clip: NotifyClip, data: Buffer }>> {
  const files: Array<{ clip: NotifyClip, data: Buffer }> = []
  let total = 0
  for (const clip of clips) {
    let data: Buffer
    try {
      data = await readFile(clip.videoPath)
    } catch {
      continue
    }
    if (total + data.length > maxTotal) continue
    total += data.length
    files.push({ clip, data })
  }
  return files
}

export function createDiscordNotifier(options: { webhookUrl: string } & NotifierDeps): Notifier {
  if (!DISCORD_WEBHOOK.test(options.webhookUrl)) throw new NotifierConfigError('URL de webhook Discord invalide')
  const doFetch = options.fetchFn ?? fetch
  const sleep = options.sleep ?? wait
  const readFile = options.readFile ?? (async (path: string) => (await import('node:fs/promises')).readFile(path))

  async function post(body: FormData | string, headers: Record<string, string> = {}): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      // "?wait=true" : Discord attend la fin de l'enregistrement et renvoie les erreurs de fichier.
      const response = await doFetch(`${options.webhookUrl}?wait=true`, { method: 'POST', headers, body })
      if (response.status === 429 && attempt === 0) {
        const retry = Number((await response.json().catch(() => ({})) as { retry_after?: number }).retry_after)
        await sleep(Math.min(5_000, Math.max(500, Number.isFinite(retry) ? retry * 1000 : 1_000)))
        continue
      }
      if (!response.ok) throw new Error(`Discord a refuse la notification (HTTP ${response.status})`)
      return
    }
  }

  return {
    name: 'discord',
    async send(notification) {
      const content = buildBatchText(notification)
      // Aucune mention (@everyone, roles) : le texte vient de titres generes a partir de la parole.
      const base = { content, allowed_mentions: { parse: [] as string[] } }
      const files = (await loadFiles(notification.clips, DISCORD_MAX_BYTES, readFile)).slice(0, 10)
      if (!files.length) {
        await post(JSON.stringify(base), { 'content-type': 'application/json' })
        return
      }
      const form = new FormData()
      form.append('payload_json', JSON.stringify({ ...base, attachments: files.map((f, i) => ({ id: i, filename: `clip-${notification.batch}-${i + 1}.mp4` })) }))
      files.forEach((f, i) => form.append(`files[${i}]`, new Blob([new Uint8Array(f.data)], { type: 'video/mp4' }), `clip-${notification.batch}-${i + 1}.mp4`))
      await post(form)
    }
  }
}

export function createTelegramNotifier(options: { token: string, chatId: string } & NotifierDeps): Notifier {
  if (!TELEGRAM_TOKEN.test(options.token)) throw new NotifierConfigError('Jeton de bot Telegram invalide')
  if (!TELEGRAM_CHAT.test(options.chatId)) throw new NotifierConfigError('Identifiant de conversation Telegram invalide')
  const doFetch = options.fetchFn ?? fetch
  const readFile = options.readFile ?? (async (path: string) => (await import('node:fs/promises')).readFile(path))

  // Les erreurs ne contiennent jamais l'URL (elle porte le jeton).
  async function call(method: string, body: FormData | string, headers: Record<string, string> = {}): Promise<void> {
    let response: Response
    try {
      response = await doFetch(`https://api.telegram.org/bot${options.token}/${method}`, { method: 'POST', headers, body })
    } catch {
      throw new Error(`Telegram injoignable (${method})`)
    }
    if (!response.ok) throw new Error(`Telegram a refuse ${method} (HTTP ${response.status})`)
  }

  return {
    name: 'telegram',
    async send(notification) {
      await call('sendMessage', JSON.stringify({ chat_id: options.chatId, text: buildBatchText(notification, 3900), disable_web_page_preview: true }), { 'content-type': 'application/json' })
      for (const { clip, data } of await loadFiles(notification.clips, Number.MAX_SAFE_INTEGER, readFile)) {
        if (data.length > TELEGRAM_MAX_BYTES) continue
        const form = new FormData()
        form.append('chat_id', options.chatId)
        form.append('caption', (clip.title || 'Clip').slice(0, 200))
        form.append('supports_streaming', 'true')
        form.append('video', new Blob([new Uint8Array(data)], { type: 'video/mp4' }), `clip-${clip.id}.mp4`)
        await call('sendVideo', form)
      }
    }
  }
}

// Notifieurs configures par l'environnement ; une valeur invalide est signalee SANS l'afficher.
export function notifiersFromEnv(read: (key: string) => string, deps: NotifierDeps = {}): { notifiers: Notifier[], problems: string[] } {
  const notifiers: Notifier[] = []
  const problems: string[] = []
  const webhook = read('DISCORD_WEBHOOK_URL')
  if (webhook) {
    try { notifiers.push(createDiscordNotifier({ webhookUrl: webhook, ...deps })) } catch { problems.push('DISCORD_WEBHOOK_URL invalide') }
  }
  const token = read('TELEGRAM_BOT_TOKEN')
  const chatId = read('TELEGRAM_CHAT_ID')
  if (token || chatId) {
    try { notifiers.push(createTelegramNotifier({ token, chatId, ...deps })) } catch { problems.push('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID invalides ou incomplets') }
  }
  return { notifiers, problems }
}
