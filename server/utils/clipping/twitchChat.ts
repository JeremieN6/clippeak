import type { ChatMessage } from './chatPeaks.ts'

// Endpoint non documente : valeurs reprises des outils open source (twitch-dl, TwitchDownloader).
// Si Twitch les change, seul ce fichier est a corriger.
export const TWITCH_GQL_URL = 'https://gql.twitch.tv/gql'
export const TWITCH_WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
export const COMMENTS_QUERY_HASH = 'b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a'

const MIN_START_OFFSET_SEC = 3

export class TwitchChatError extends Error {
  readonly kind: 'http' | 'graphql' | 'shape' | 'limit'

  constructor(message: string, kind: 'http' | 'graphql' | 'shape' | 'limit') {
    super(message)
    this.name = 'TwitchChatError'
    this.kind = kind
  }
}

export interface CommentsPage {
  messages: ChatMessage[]
  ids: string[]
  hasNextPage: boolean
  lastOffsetSec: number | null
}

export interface FetchChatOptions {
  fetchFn?: typeof fetch
  startOffsetSec?: number
  maxPages?: number
  delayMs?: number
  clientId?: string
  queryHash?: string
  onPage?: (page: CommentsPage) => void
}

export interface FetchChatResult {
  messages: ChatMessage[]
  lastOffsetSec: number
  pages: number
}

export function parseCommentsResponse(payload: unknown): CommentsPage {
  const first = Array.isArray(payload) ? payload[0] : payload
  const root = first as any
  if (!root || typeof root !== 'object') {
    throw new TwitchChatError('Reponse GraphQL vide ou illisible', 'shape')
  }
  if (Array.isArray(root.errors) && root.errors.length) {
    throw new TwitchChatError(`Erreur GraphQL Twitch : ${root.errors[0]?.message ?? 'inconnue'}`, 'graphql')
  }
  const video = root.data?.video
  if (video === null) {
    throw new TwitchChatError('VOD introuvable ou supprimee', 'graphql')
  }
  const edges = video?.comments?.edges
  if (!Array.isArray(edges)) {
    throw new TwitchChatError('Structure de commentaires inattendue (endpoint modifie ?)', 'shape')
  }

  const messages: ChatMessage[] = []
  const ids: string[] = []
  for (const edge of edges) {
    const node = edge?.node
    const offset = node?.contentOffsetSeconds
    if (!node || typeof offset !== 'number') continue
    const fragments = node.message?.fragments
    const text = Array.isArray(fragments) ? fragments.map((f: any) => f?.text ?? '').join('') : ''
    if (!text.trim()) continue
    messages.push({ t: offset, text })
    ids.push(String(node.id ?? `${offset}:${text}`))
  }

  const lastEdgeOffset = edges.length ? edges[edges.length - 1]?.node?.contentOffsetSeconds : null
  return {
    messages,
    ids,
    hasNextPage: video?.comments?.pageInfo?.hasNextPage === true,
    lastOffsetSec: typeof lastEdgeOffset === 'number' ? lastEdgeOffset : null
  }
}

// Pagination par offset et non par curseur : des la 2e page, le curseur declenche un
// "failed integrity check" (jeton Client-Integrity requis), alors que l'offset passe sans jeton.
// Chaque page recouvre la precedente (le dernier offset est repris), d'ou le dedoublonnage par id.
export async function fetchVodChat(videoId: string, options: FetchChatOptions = {}): Promise<FetchChatResult> {
  const doFetch = options.fetchFn ?? fetch
  const maxPages = options.maxPages ?? 2000
  // Sur une VOD en cours, Twitch renvoie une liste vide pour les offsets 0 a 2 (constate le 2026-10-23) :
  // on ne demarre jamais avant 3 s. Les pages sont alignees, les messages juste avant l'offset sont inclus.
  const startOffset = Math.max(options.startOffsetSec ?? 0, MIN_START_OFFSET_SEC)

  const all: ChatMessage[] = []
  const seen = new Set<string>()
  let offset = startOffset
  let pages = 0

  while (true) {
    if (pages >= maxPages) {
      throw new TwitchChatError(`Limite de ${maxPages} pages atteinte`, 'limit')
    }
    const response = await doFetch(TWITCH_GQL_URL, {
      method: 'POST',
      headers: { 'Client-ID': options.clientId ?? TWITCH_WEB_CLIENT_ID, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        operationName: 'VideoCommentsByOffsetOrCursor',
        variables: { videoID: videoId, contentOffsetSeconds: offset },
        extensions: { persistedQuery: { version: 1, sha256Hash: options.queryHash ?? COMMENTS_QUERY_HASH } }
      }])
    })
    if (!response.ok) {
      throw new TwitchChatError(`HTTP ${response.status} depuis Twitch GraphQL`, 'http')
    }

    const page = parseCommentsResponse(await response.json())
    pages++
    let fresh = 0
    page.messages.forEach((m, i) => {
      if (seen.has(page.ids[i])) return
      seen.add(page.ids[i])
      all.push(m)
      fresh++
    })
    options.onPage?.(page)

    if (!page.hasNextPage) break
    // Aucun message nouveau (rafale au meme offset) : on avance d'une seconde pour ne pas boucler.
    offset = fresh === 0 || page.lastOffsetSec === null ? offset + 1 : Math.floor(page.lastOffsetSec)
    if (options.delayMs) await new Promise(r => setTimeout(r, options.delayMs))
  }

  const lastOffsetSec = all.length ? Math.max(...all.map(m => m.t)) : startOffset
  return { messages: all, lastOffsetSec, pages }
}
