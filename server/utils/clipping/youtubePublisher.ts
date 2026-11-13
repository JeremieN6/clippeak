import { open, stat } from 'node:fs/promises'
import { PublishError, youtubeMetadata } from './publishing.ts'
import { longYoutubeMetadata } from './longExtract.ts'
import type { PublishInput, PublishResult, Publisher } from './publishing.ts'

type FetchFn = typeof fetch

export interface YoutubeDeps {
  clientId: string
  clientSecret: string
  fetchFn?: FetchFn
  // Pour les tests : le fichier entier en memoire. Sans lui, la video est lue sur le disque, morceau par morceau.
  readVideo?: (path: string) => Promise<Buffer>
  chunkBytes?: number
  now?: () => number
  tokenUrl?: string
  uploadUrl?: string
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos'
// Morceaux de l'envoi : multiple de 256 Kio (regle de YouTube). Seul un morceau est en memoire a la fois : une video d'une heure passe.
export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024
const CHUNK_ATTEMPTS = 3

interface VideoSource { size: number, read: (start: number, end: number) => Promise<Buffer>, close: () => Promise<void> }

async function openFileSource(path: string): Promise<VideoSource> {
  const size = (await stat(path)).size
  const handle = await open(path, 'r')
  return {
    size,
    read: async (start, end) => {
      const buffer = Buffer.alloc(end - start)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, start)
      return bytesRead === buffer.length ? buffer : buffer.subarray(0, bytesRead)
    },
    close: () => handle.close()
  }
}

// Raison d'un refus de l'API Google (« quotaExceeded »...), pour decider s'il faut reconnecter, abandonner ou reessayer.
async function errorReason(response: Response): Promise<{ reason: string, message: string }> {
  try {
    const body = await response.json() as any
    return { reason: String(body?.error?.errors?.[0]?.reason ?? body?.error ?? ''), message: String(body?.error?.message ?? body?.error_description ?? '') }
  } catch {
    return { reason: '', message: '' }
  }
}

async function classify(response: Response, action: string): Promise<PublishError> {
  const { reason, message } = await errorReason(response)
  const detail = `${action} : ${message || reason || `HTTP ${response.status}`}`
  if (response.status === 401 || reason === 'invalid_grant' || reason === 'authError' || reason === 'insufficientPermissions') {
    return new PublishError('auth', `${detail}. Reconnecte ton compte YouTube.`)
  }
  if (response.status === 403 && /quota|limit/i.test(reason)) return new PublishError('quota', `${detail}. La limite de YouTube est atteinte, réessaie plus tard.`)
  if (response.status >= 500 || response.status === 429) return new PublishError('transient', detail)
  return new PublishError('rejected', detail)
}

// Publication d'un Short : envoi en deux temps (la session d'envoi, puis le fichier). Tant que l'application n'a pas passe l'audit de
// Google, YouTube garde les videos en prive quoi qu'on demande ; l'identifiant et le lien sont rendus dans tous les cas.
export function createYoutubePublisher(deps: YoutubeDeps): Publisher {
  const fetchFn = deps.fetchFn ?? fetch
  const chunkBytes = deps.chunkBytes ?? UPLOAD_CHUNK_BYTES
  const openSource = async (path: string): Promise<VideoSource> => {
    if (!deps.readVideo) return openFileSource(path)
    const buffer = await deps.readVideo(path)
    return { size: buffer.length, read: async (a, b) => buffer.subarray(a, b), close: async () => {} }
  }
  const now = deps.now ?? (() => Date.now())

  async function freshAccessToken(input: PublishInput): Promise<{ value: string, expiresAt: Date, renewed: boolean }> {
    if (input.accessToken && input.expiresAt && input.expiresAt.getTime() - now() > 60_000) {
      return { value: input.accessToken, expiresAt: input.expiresAt, renewed: false }
    }
    let response: Response
    try {
      response = await fetchFn(deps.tokenUrl ?? TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: deps.clientId, client_secret: deps.clientSecret, refresh_token: input.refreshToken, grant_type: 'refresh_token' })
      })
    } catch {
      throw new PublishError('transient', 'Connexion à Google impossible')
    }
    if (!response.ok) throw await classify(response, 'Renouvellement de l’accès YouTube')
    const body = await response.json() as { access_token?: string, expires_in?: number }
    if (!body.access_token) throw new PublishError('auth', 'Google n’a pas renvoyé d’accès. Reconnecte ton compte YouTube.')
    return { value: body.access_token, expiresAt: new Date(now() + (body.expires_in ?? 3600) * 1000), renewed: true }
  }

  return {
    platform: 'youtube',
    async publish(input: PublishInput): Promise<PublishResult> {
      const access = await freshAccessToken(input)
      const video = await openSource(input.videoPath).catch(() => { throw new PublishError('rejected', 'Le fichier du clip est introuvable') })
      try {
        return await sendVideo(input, access, video)
      } finally {
        await video.close().catch(() => {})
      }
    }
  }

  // Octets deja recus par YouTube d'apres l'en-tete « Range » d'une reponse 308 (absent : rien recu).
  function receivedBytes(response: Response): number {
    const match = /bytes=0-(\d+)/.exec(response.headers.get('range') ?? '')
    return match ? Number(match[1]) + 1 : 0
  }

  // Envoi par morceaux dans la session ouverte ; un morceau qui echoue (reseau, erreur 5xx) est repris apres avoir demande a YouTube
  // ce qu'il a deja recu, jusqu'a CHUNK_ATTEMPTS fois d'affilee.
  async function uploadChunks(location: string, video: VideoSource): Promise<{ id?: string }> {
    let offset = 0
    let failures = 0
    for (;;) {
      const end = Math.min(offset + chunkBytes, video.size)
      const chunk = await video.read(offset, end)
      let response: Response | null = null
      try {
        response = await fetchFn(location, { method: 'PUT', redirect: 'manual', headers: { 'content-type': 'video/mp4', 'content-length': String(chunk.length), 'content-range': `bytes ${offset}-${end - 1}/${video.size}` }, body: new Uint8Array(chunk) })
      } catch {
        response = null
      }
      if (response && (response.status === 200 || response.status === 201)) return await response.json() as { id?: string }
      if (response && response.status === 308) {
        offset = Math.min(receivedBytes(response), video.size)
        failures = 0
        continue
      }
      if (response && response.status < 500 && response.status !== 429) throw await classify(response, 'Envoi du clip à YouTube')
      if (++failures >= CHUNK_ATTEMPTS) throw new PublishError('transient', response ? `Envoi du clip à YouTube : HTTP ${response.status}` : 'Envoi du clip à YouTube interrompu')
      // Ou en est YouTube ? (reponse 308 + Range ; sinon on renvoie le meme morceau)
      try {
        const status = await fetchFn(location, { method: 'PUT', redirect: 'manual', headers: { 'content-length': '0', 'content-range': `bytes */${video.size}` } })
        if (status.status === 308) offset = Math.min(receivedBytes(status), video.size)
      } catch { /* on renvoie le meme morceau */ }
    }
  }

  async function sendVideo(input: PublishInput, access: { value: string, expiresAt: Date, renewed: boolean }, video: VideoSource): Promise<PublishResult> {
    const long = input.format === 'long'
    const { title, description } = long ? longYoutubeMetadata(input.title, input.caption, input.hashtags) : youtubeMetadata(input.title, input.caption, input.hashtags)

    let start: Response
    try {
      start = await fetchFn(`${deps.uploadUrl ?? UPLOAD_URL}?uploadType=resumable&part=snippet,status`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.value}`,
          'content-type': 'application/json; charset=UTF-8',
          'x-upload-content-length': String(video.size),
          'x-upload-content-type': 'video/mp4'
        },
        body: JSON.stringify({ snippet: { title, description, categoryId: '20' }, status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } })
      })
    } catch {
      throw new PublishError('transient', 'Connexion à YouTube impossible')
    }
    if (!start.ok) throw await classify(start, 'Ouverture de l’envoi YouTube')
    const location = start.headers.get('location')
    if (!location) throw new PublishError('transient', 'YouTube n’a pas ouvert de session d’envoi')

    if (video.size === 0) throw new PublishError('rejected', 'Le fichier du clip est vide')
    const body = await uploadChunks(location, video)
    if (!body.id) throw new PublishError('transient', 'YouTube n’a pas renvoyé d’identifiant de vidéo')
    return {
      externalId: body.id,
      url: long ? `https://www.youtube.com/watch?v=${body.id}` : `https://www.youtube.com/shorts/${body.id}`,
      ...(access.renewed ? { accessToken: { value: access.value, expiresAt: access.expiresAt } } : {})
    }
  }
}
