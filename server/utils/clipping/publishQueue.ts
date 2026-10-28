import { PublishError } from './publishing.ts'
import type { PublishPlatform, Publisher, PublishResult } from './publishing.ts'

// File de publication : prend les publications dont l'heure est venue, publie, note le resultat. Aucune publication sans une ligne
// creee par le streamer (voir la route /api/studio/clips/:id/publish).
export interface DuePublication {
  id: string
  platform: string
  attempts: number
  clip: { id: string, title: string, caption: string, hashtags: string, videoPath: string | null, status: string }
  connection: { id: string, refreshToken: string | null, accessToken: string | null, expiresAt: Date | null } | null
}

export interface PublishStore {
  requeueInterrupted: () => Promise<number>
  claimDue: (now: Date) => Promise<DuePublication | null>
  saveAccessToken: (connectionId: string, token: { value: string, expiresAt: Date }) => Promise<void>
  markPublished: (id: string, result: Pick<PublishResult, 'externalId' | 'url'>, at: Date) => Promise<void>
  // retryAt : nouvelle heure de tentative (erreur passagere) ; sinon la publication est en echec definitif.
  markFailed: (id: string, error: string, retryAt: Date | null) => Promise<void>
}

export const MAX_ATTEMPTS = 3
export const RETRY_DELAY_MS = 10 * 60_000

export interface PublishStepDeps {
  store: PublishStore
  publishers: Partial<Record<PublishPlatform, Publisher>>
  now?: () => Date
  log?: (message: string) => void
}

// Traite UNE publication echue ; renvoie false quand il n'y en a plus (le worker passe alors a autre chose).
export async function runPublishOnce(deps: PublishStepDeps): Promise<boolean> {
  const now = deps.now ?? (() => new Date())
  const due = await deps.store.claimDue(now())
  if (!due) return false
  const fail = (message: string, retry = false) => {
    const retryAt = retry && due.attempts + 1 < MAX_ATTEMPTS ? new Date(now().getTime() + RETRY_DELAY_MS) : null
    deps.log?.(`publication ${due.id} (${due.platform}) : ${message}${retryAt ? ' — nouvel essai dans 10 min' : ''}`)
    return deps.store.markFailed(due.id, message, retryAt)
  }

  const publisher = deps.publishers[due.platform as PublishPlatform]
  if (!publisher) await fail('Cette plateforme n’est pas encore disponible.')
  else if (due.clip.status !== 'approved') await fail('Le clip n’est plus approuvé : rien n’a été publié.')
  else if (!due.clip.videoPath) await fail('Le clip n’a pas de vidéo : rien n’a été publié.')
  else if (!due.connection?.refreshToken) await fail('Le compte n’est plus connecté. Reconnecte-le puis reprogramme la publication.')
  else {
    try {
      const result = await publisher.publish({
        title: due.clip.title,
        caption: due.clip.caption,
        hashtags: due.clip.hashtags,
        videoPath: due.clip.videoPath,
        refreshToken: due.connection.refreshToken,
        accessToken: due.connection.accessToken,
        expiresAt: due.connection.expiresAt
      })
      if (result.accessToken) await deps.store.saveAccessToken(due.connection.id, result.accessToken)
      await deps.store.markPublished(due.id, result, now())
      deps.log?.(`publication ${due.id} (${due.platform}) : publiée`)
    } catch (error) {
      if (error instanceof PublishError) await fail(error.message, error.kind === 'transient')
      else await fail('Erreur inattendue pendant la publication.', true)
    }
  }
  return true
}
