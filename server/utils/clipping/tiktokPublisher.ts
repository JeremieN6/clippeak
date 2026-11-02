import { readFile } from 'node:fs/promises'
import { PublishError } from './publishing.ts'
import type { PublishInput, PublishResult, Publisher, TiktokPostOptions } from './publishing.ts'
import { TIKTOK_API, TiktokApiError, queryCreatorInfo, refreshTiktokTokens, tiktokJson } from './tiktokApi.ts'

type FetchFn = typeof fetch

export interface TiktokDeps {
  clientKey: string
  clientSecret: string
  fetchFn?: FetchFn
  readVideo?: (path: string) => Promise<Buffer>
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  apiBase?: string
  // Attente maximale de la confirmation de TikTok apres l'envoi, et delai entre deux lectures du statut.
  statusTimeoutMs?: number
  statusIntervalMs?: number
}

// Un seul morceau : TikTok accepte 64 Mo au plus par morceau, un clip vertical de moins d'une minute reste tres en dessous.
export const MAX_TIKTOK_VIDEO_BYTES = 64 * 1024 * 1024

const toPublishError = (error: unknown): PublishError => error instanceof TiktokApiError ? new PublishError(error.kind, error.message) : error instanceof PublishError ? error : new PublishError('transient', 'Erreur inattendue pendant l’envoi à TikTok')

function parseOptions(raw: Record<string, unknown> | null, fallbackTitle: string): TiktokPostOptions {
  const o = (raw ?? {}) as Partial<TiktokPostOptions>
  if (!o.privacyLevel) throw new PublishError('rejected', 'La visibilité n’a pas été choisie : rien n’a été publié.')
  return {
    title: String(o.title ?? fallbackTitle).slice(0, 2200),
    privacyLevel: o.privacyLevel,
    disableComment: o.disableComment !== false,
    disableDuet: o.disableDuet !== false,
    disableStitch: o.disableStitch !== false,
    brandOrganic: Boolean(o.brandOrganic),
    brandContent: Boolean(o.brandContent)
  }
}

// Publication directe sur TikTok : acces (renouvele si besoin), controle du compte, ouverture de l'envoi, envoi du fichier en un morceau,
// puis lecture du statut jusqu'a la confirmation. Tant que l'application n'a pas passe l'audit de TikTok, la video reste privee.
export function createTiktokPublisher(deps: TiktokDeps): Publisher {
  const fetchFn = deps.fetchFn ?? fetch
  const readVideo = deps.readVideo ?? ((path: string) => readFile(path))
  const now = deps.now ?? (() => Date.now())
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))
  const api = deps.apiBase ?? TIKTOK_API
  const timeoutMs = deps.statusTimeoutMs ?? 4 * 60_000
  const intervalMs = deps.statusIntervalMs ?? 5_000

  async function freshAccess(input: PublishInput): Promise<{ value: string, renewed?: { expiresAt: Date, refreshToken: string } }> {
    if (input.accessToken && input.expiresAt && input.expiresAt.getTime() - now() > 60_000) return { value: input.accessToken }
    try {
      const tokens = await refreshTiktokTokens(fetchFn, { clientKey: deps.clientKey, clientSecret: deps.clientSecret, refreshToken: input.refreshToken, apiBase: api, now })
      return { value: tokens.accessToken, renewed: { expiresAt: tokens.expiresAt, refreshToken: tokens.refreshToken } }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      // Un refus de TikTok (jeton expire, revoque) demande de reconnecter ; une panne reseau se retente.
      throw new PublishError(/refus/.test(message) ? 'auth' : 'transient', /refus/.test(message) ? `${message}. Reconnecte ton compte TikTok.` : message)
    }
  }

  return {
    platform: 'tiktok',
    async publish(input: PublishInput): Promise<PublishResult> {
      const options = parseOptions(input.options, input.title)
      const access = await freshAccess(input)
      try {
        const creator = await queryCreatorInfo(fetchFn, access.value, api)
        if (!creator.privacyOptions.includes(options.privacyLevel)) throw new PublishError('rejected', 'La visibilité choisie n’est plus permise pour ce compte TikTok.')

        const video = await readVideo(input.videoPath).catch(() => { throw new PublishError('rejected', 'Le fichier du clip est introuvable') })
        if (video.length > MAX_TIKTOK_VIDEO_BYTES) throw new PublishError('rejected', 'Le clip est trop lourd pour TikTok (64 Mo au plus).')

        const init = await tiktokJson<{ publish_id?: string, upload_url?: string }>(fetchFn, `${api}/v2/post/publish/video/init/`, access.value, {
          post_info: {
            title: options.title,
            privacy_level: options.privacyLevel,
            disable_comment: options.disableComment,
            disable_duet: options.disableDuet,
            disable_stitch: options.disableStitch,
            brand_content_toggle: options.brandContent,
            brand_organic_toggle: options.brandOrganic
          },
          source_info: { source: 'FILE_UPLOAD', video_size: video.length, chunk_size: video.length, total_chunk_count: 1 }
        })
        if (!init.publish_id || !init.upload_url) throw new PublishError('transient', 'TikTok n’a pas ouvert de session d’envoi')

        let upload: Response
        try {
          upload = await fetchFn(init.upload_url, { method: 'PUT', headers: { 'content-type': 'video/mp4', 'content-length': String(video.length), 'content-range': `bytes 0-${video.length - 1}/${video.length}` }, body: new Uint8Array(video) })
        } catch {
          throw new PublishError('transient', 'Envoi du clip à TikTok interrompu')
        }
        if (!upload.ok) throw new PublishError(upload.status >= 500 ? 'transient' : 'rejected', `TikTok a refusé le fichier (HTTP ${upload.status})`)

        // Le fichier est parti : on ne rejoue plus jamais l'envoi (risque de doublon). Sans confirmation, on le dit au streamer.
        const startedAt = now()
        for (;;) {
          const status = await tiktokJson<{ status?: string, fail_reason?: string, publicaly_available_post_id?: Array<string | number> }>(fetchFn, `${api}/v2/post/publish/status/fetch/`, access.value, { publish_id: init.publish_id })
            .catch((error): { status: string } => {
              if (error instanceof TiktokApiError && error.kind === 'transient') return { status: 'PROCESSING_UPLOAD' }
              throw error
            }) as { status?: string, fail_reason?: string, publicaly_available_post_id?: Array<string | number> }
          if (status.status === 'PUBLISH_COMPLETE') {
            const postId = status.publicaly_available_post_id?.[0]
            const profile = creator.username ? `https://www.tiktok.com/@${creator.username}` : 'https://www.tiktok.com'
            return {
              externalId: init.publish_id,
              url: postId && creator.username ? `${profile}/video/${postId}` : profile,
              ...(access.renewed ? { accessToken: { value: access.value, expiresAt: access.renewed.expiresAt, refreshToken: access.renewed.refreshToken } } : {})
            }
          }
          if (status.status === 'FAILED') throw new PublishError('rejected', `TikTok n’a pas pu publier le clip (${status.fail_reason ?? 'raison inconnue'}).`)
          if (now() - startedAt > timeoutMs) throw new PublishError('rejected', 'TikTok n’a pas confirmé la publication à temps : vérifie sur ton compte TikTok avant de la relancer.')
          await sleep(intervalMs)
        }
      } catch (error) {
        const failure = toPublishError(error)
        if (access.renewed) failure.renewed = { value: access.value, expiresAt: access.renewed.expiresAt, refreshToken: access.renewed.refreshToken }
        throw failure
      }
    }
  }
}
