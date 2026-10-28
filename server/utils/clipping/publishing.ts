// Publication : types communs, texte envoye a la plateforme et creneaux proposes. Fichier pur (aucun import Node) : il sert aussi
// a la page du studio pour proposer les creneaux.

export const PUBLISH_PLATFORMS = ['youtube'] as const
export type PublishPlatform = typeof PUBLISH_PLATFORMS[number]

export type PublicationStatus = 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled'

// auth : acces refuse ou expire, il faut reconnecter ; quota / rejected : inutile de reessayer ; transient : reessayer plus tard.
export type PublishErrorKind = 'auth' | 'quota' | 'rejected' | 'transient'

export class PublishError extends Error {
  kind: PublishErrorKind
  constructor(kind: PublishErrorKind, message: string) {
    super(message)
    this.name = 'PublishError'
    this.kind = kind
  }
}

export interface PublishInput {
  title: string
  caption: string
  hashtags: string
  videoPath: string
  refreshToken: string
  accessToken: string | null
  expiresAt: Date | null
}

export interface PublishResult {
  externalId: string
  url: string
  // Nouveau jeton d'acces obtenu pendant l'envoi : a conserver pour le prochain.
  accessToken?: { value: string, expiresAt: Date }
}

export interface Publisher {
  platform: PublishPlatform
  publish: (input: PublishInput) => Promise<PublishResult>
}

// YouTube : titre de 100 caracteres au plus ; « #Shorts » aide YouTube a classer une video verticale courte.
export function youtubeMetadata(title: string, caption: string, hashtags: string): { title: string, description: string } {
  const clean = (text: string) => text.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
  const tag = '#Shorts'
  const base = clean(title) || 'Clip'
  const room = 100 - tag.length - 1
  const cut = base.length > room ? `${base.slice(0, room - 1).trimEnd()}…` : base
  const tags = clean(hashtags).split(' ').filter(Boolean)
  const description = [clean(caption), [...tags.filter(t => t.toLowerCase() !== tag.toLowerCase()), tag].join(' ')].filter(Boolean).join('\n\n')
  return { title: `${cut} ${tag}`, description: description.slice(0, 4900) }
}

// Prochains creneaux libres : les heures preferees (« HH:MM », heure locale de l'appelant) des jours a venir, hors creneaux deja pris
// (a moins d'une heure d'un creneau existant). Au moins 15 minutes dans le futur.
export function suggestSlots(now: Date, times: string[], count: number, taken: Date[] = []): Date[] {
  const wanted = times.map(t => /^(\d{2}):(\d{2})$/.exec(t)).filter((m): m is RegExpExecArray => !!m).map(m => [Number(m[1]), Number(m[2])] as const)
    .filter(([h, m]) => h < 24 && m < 60).sort((a, b) => a[0] * 60 + a[1] - (b[0] * 60 + b[1]))
  if (!wanted.length || count <= 0) return []
  const earliest = now.getTime() + 15 * 60_000
  const free = (d: Date) => d.getTime() >= earliest && !taken.some(t => Math.abs(t.getTime() - d.getTime()) < 60 * 60_000)
  const out: Date[] = []
  for (let day = 0; day < 60 && out.length < count; day++) {
    for (const [h, m] of wanted) {
      const slot = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, h, m, 0, 0)
      if (free(slot)) out.push(slot)
      if (out.length >= count) break
    }
  }
  return out
}

export const DEFAULT_SLOT_TIMES = ['12:30', '18:30', '21:00']
export const MAX_SCHEDULE_DAYS = 60
