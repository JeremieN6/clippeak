import { readFile } from 'node:fs/promises'
import { PublishError, youtubeMetadata } from './publishing.ts'
import type { PublishInput, PublishResult, Publisher } from './publishing.ts'

type FetchFn = typeof fetch

export interface YoutubeDeps {
  clientId: string
  clientSecret: string
  fetchFn?: FetchFn
  readVideo?: (path: string) => Promise<Buffer>
  now?: () => number
  tokenUrl?: string
  uploadUrl?: string
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos'

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
  const readVideo = deps.readVideo ?? ((path: string) => readFile(path))
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
      const video = await readVideo(input.videoPath).catch(() => { throw new PublishError('rejected', 'Le fichier du clip est introuvable') })
      const { title, description } = youtubeMetadata(input.title, input.caption, input.hashtags)

      let start: Response
      try {
        start = await fetchFn(`${deps.uploadUrl ?? UPLOAD_URL}?uploadType=resumable&part=snippet,status`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${access.value}`,
            'content-type': 'application/json; charset=UTF-8',
            'x-upload-content-length': String(video.length),
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

      let upload: Response
      try {
        upload = await fetchFn(location, { method: 'PUT', headers: { 'content-type': 'video/mp4', 'content-length': String(video.length) }, body: new Uint8Array(video) })
      } catch {
        throw new PublishError('transient', 'Envoi du clip à YouTube interrompu')
      }
      if (!upload.ok) throw await classify(upload, 'Envoi du clip à YouTube')
      const body = await upload.json() as { id?: string }
      if (!body.id) throw new PublishError('transient', 'YouTube n’a pas renvoyé d’identifiant de vidéo')
      return {
        externalId: body.id,
        url: `https://www.youtube.com/shorts/${body.id}`,
        ...(access.renewed ? { accessToken: { value: access.value, expiresAt: access.expiresAt } } : {})
      }
    }
  }
}
