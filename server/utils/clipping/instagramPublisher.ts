import { stat } from 'node:fs/promises'
import { PublishError, instagramCaption } from './publishing.ts'
import type { PublishInput, PublishResult, Publisher } from './publishing.ts'
import { InstagramApiError, createReelContainer, fetchContainerStatus, fetchPermalink, instagramRefreshDue, publishContainer, refreshInstagramToken } from './instagramApi.ts'

type FetchFn = typeof fetch

export interface InstagramDeps {
  // Adresse publique d'un clip (lien signe de courte duree) : Meta telecharge la video elle-meme.
  videoUrlFor: (clipId: string) => string
  fetchFn?: FetchFn
  fileSize?: (path: string) => Promise<number>
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  graphBase?: string
  // Attente maximale du traitement de la video par Instagram, et delai entre deux lectures.
  statusTimeoutMs?: number
  statusIntervalMs?: number
}

// 300 Mo au plus pour un Reel (Meta) ; un clip vertical de moins d'une minute reste tres en dessous.
export const MAX_INSTAGRAM_VIDEO_BYTES = 300 * 1024 * 1024

const toPublishError = (error: unknown): PublishError => error instanceof InstagramApiError ? new PublishError(error.kind, error.message) : error instanceof PublishError ? error : new PublishError('transient', 'Erreur inattendue pendant l’envoi à Instagram')

// Publication d'un Reel : acces (renouvele si besoin), conteneur avec le lien video signe, attente du traitement, publication, lien du Reel.
// Une fois « publier » demande a Instagram, on ne rejoue jamais l'appel (risque de doublon).
export function createInstagramPublisher(deps: InstagramDeps): Publisher {
  const fetchFn = deps.fetchFn ?? fetch
  const now = deps.now ?? (() => Date.now())
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))
  const fileSize = deps.fileSize ?? (async (path: string) => (await stat(path)).size)
  const timeoutMs = deps.statusTimeoutMs ?? 5 * 60_000
  const intervalMs = deps.statusIntervalMs ?? 10_000

  return {
    platform: 'instagram',
    async publish(input: PublishInput): Promise<PublishResult> {
      if (!input.clipId) throw new PublishError('rejected', 'Clip inconnu : rien n’a été publié.')
      if (!input.accountId) throw new PublishError('auth', 'Le compte Instagram est incomplet. Reconnecte-le puis relance la publication.')
      let token = input.accessToken || input.refreshToken
      let expiresAt = input.expiresAt
      const state = instagramRefreshDue(expiresAt, now())
      if (state === 'expired') throw new PublishError('auth', 'L’accès à ton compte Instagram a expiré. Reconnecte-le.')
      let renewed: { value: string, expiresAt: Date, refreshToken: string } | undefined
      if (state === 'due') {
        try {
          const fresh = await refreshInstagramToken(fetchFn, { token, graphBase: deps.graphBase, now })
          token = fresh.accessToken
          expiresAt = fresh.expiresAt
          renewed = { value: token, expiresAt: fresh.expiresAt, refreshToken: token }
        } catch { /* le jeton actuel est encore valable : on publie avec, le renouvellement sera retente */ }
      }

      try {
        const size = await fileSize(input.videoPath).catch(() => { throw new PublishError('rejected', 'Le fichier du clip est introuvable') })
        if (size > MAX_INSTAGRAM_VIDEO_BYTES) throw new PublishError('rejected', 'Le clip est trop lourd pour Instagram (300 Mo au plus).')
        const options = (input.options ?? {}) as { caption?: unknown }
        const caption = instagramCaption(typeof options.caption === 'string' ? options.caption : input.caption)

        const containerId = await createReelContainer(fetchFn, { accessToken: token, userId: input.accountId, videoUrl: deps.videoUrlFor(input.clipId), caption, graphBase: deps.graphBase })

        const startedAt = now()
        for (;;) {
          const { status, detail } = await fetchContainerStatus(fetchFn, token, containerId, deps.graphBase)
            .catch((error): { status: 'IN_PROGRESS', detail: string } => {
              if (error instanceof InstagramApiError && error.kind === 'transient') return { status: 'IN_PROGRESS', detail: '' }
              throw error
            })
          if (status === 'FINISHED') break
          if (status === 'ERROR' || status === 'EXPIRED') throw new PublishError('rejected', `Instagram n’a pas pu traiter la vidéo${detail ? ` (${detail})` : ''}.`)
          // Rien n'est encore publie : on peut retenter plus tard avec un nouveau conteneur.
          if (now() - startedAt > timeoutMs) throw new PublishError('transient', 'Instagram met trop de temps à traiter la vidéo.')
          await sleep(intervalMs)
        }

        let mediaId: string
        try {
          mediaId = await publishContainer(fetchFn, { accessToken: token, userId: input.accountId, containerId, graphBase: deps.graphBase })
        } catch (error) {
          // Le « publier » est parti : sans reponse claire, la video est peut-etre en ligne. Jamais de nouvel essai automatique.
          if (error instanceof InstagramApiError && (error.kind === 'transient' || error.code === '')) throw new PublishError('rejected', 'Instagram n’a pas confirmé la publication : vérifie sur ton compte Instagram avant de la relancer.')
          throw error
        }
        const permalink = await fetchPermalink(fetchFn, token, mediaId, deps.graphBase)
        return { externalId: mediaId, url: permalink ?? 'https://www.instagram.com/', ...(renewed ? { accessToken: renewed } : {}) }
      } catch (error) {
        const failure = toPublishError(error)
        if (renewed) failure.renewed = renewed
        throw failure
      }
    }
  }
}
