// Endpoints non documentes de Twitch (memes valeurs que twitchChat.ts : outils open source).
// Si Twitch les change, seul ce fichier est a corriger.
const GQL_URL = 'https://gql.twitch.tv/gql'
const WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
const PLAYBACK_TOKEN_HASH = '0828119ded1c13477966434e15800ff57ddacf13ba1911c129dc2200705b0712'
const USHER_URL = 'https://usher.ttvnw.net/vod'

export class VodPlaylistError extends Error {
  readonly kind: 'token' | 'restricted' | 'http' | 'shape'

  constructor(message: string, kind: 'token' | 'restricted' | 'http' | 'shape') {
    super(message)
    this.name = 'VodPlaylistError'
    this.kind = kind
  }
}

// Extrait l'URL de la variante audio seule d'une playlist maitresse HLS.
export function parseAudioOnlyUrl(master: string): string | null {
  const lines = master.split(/\r?\n/)
  const mediaIndex = lines.findIndex(l => l.startsWith('#EXT-X-MEDIA') && /audio_only/i.test(l))
  if (mediaIndex < 0) return null
  return lines.slice(mediaIndex).find(l => /^https?:\/\//.test(l.trim()))?.trim() ?? null
}

export interface VideoVariant {
  name: string
  height: number
  url: string
}

// Variantes video d'une playlist maitresse (#EXT-X-STREAM-INF avec RESOLUTION) ; l'audio seul est ignore.
export function parseVideoVariants(master: string): VideoVariant[] {
  const lines = master.split(/\r?\n/)
  const variants: VideoVariant[] = []
  lines.forEach((line, i) => {
    if (!line.startsWith('#EXT-X-STREAM-INF')) return
    const resolution = /RESOLUTION=(\d+)x(\d+)/.exec(line)
    const url = lines.slice(i + 1).find(l => /^https?:\/\//.test(l.trim()))?.trim()
    if (!resolution || !url) return
    const name = /VIDEO="([^"]+)"/.exec(line)?.[1] ?? `${resolution[2]}p`
    variants.push({ name, height: Number(resolution[2]), url })
  })
  return variants
}

// Plus grande variante dont la hauteur ne depasse pas maxHeight (720 par defaut : suffisant pour un 1080x1920 recadre).
export function pickVideoVariant(variants: VideoVariant[], maxHeight = 720): VideoVariant | null {
  const fitting = variants.filter(v => v.height <= maxHeight).sort((a, b) => b.height - a.height)
  return fitting[0] ?? [...variants].sort((a, b) => a.height - b.height)[0] ?? null
}

// Playlist maitresse HLS d'une VOD publique (jeton de lecture GraphQL puis usher).
// Les VODs reservees aux abonnes ou restreintes repondent "vod_manifest_restricted" (voir PRISE-DE-POSITION : OAuth).
export async function fetchVodMasterPlaylist(videoId: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const tokenResponse = await fetchFn(GQL_URL, {
    method: 'POST',
    headers: { 'Client-ID': WEB_CLIENT_ID, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operationName: 'PlaybackAccessToken',
      variables: { isLive: false, login: '', isVod: true, vodID: videoId, playerType: 'site' },
      extensions: { persistedQuery: { version: 1, sha256Hash: PLAYBACK_TOKEN_HASH } }
    })
  })
  if (!tokenResponse.ok) throw new VodPlaylistError(`HTTP ${tokenResponse.status} sur le jeton de lecture`, 'http')
  const tokenBody = await tokenResponse.json() as any
  const token = tokenBody?.data?.videoPlaybackAccessToken
  if (!token?.value || !token?.signature) {
    throw new VodPlaylistError('Jeton de lecture absent (VOD introuvable ou endpoint modifie ?)', 'token')
  }

  const query = new URLSearchParams({
    nauth: token.value,
    nauthsig: token.signature,
    allow_source: 'true',
    allow_audio_only: 'true'
  })
  const usherResponse = await fetchFn(`${USHER_URL}/${encodeURIComponent(videoId)}.m3u8?${query}`)
  const text = await usherResponse.text()
  if (!usherResponse.ok) {
    let code = ''
    try { code = JSON.parse(text)?.[0]?.error_code ?? '' } catch { /* corps non JSON */ }
    if (code === 'vod_manifest_restricted') {
      throw new VodPlaylistError('VOD restreinte (abonnes ou contenu protege) : playlist inaccessible sans connexion du streamer', 'restricted')
    }
    throw new VodPlaylistError(`HTTP ${usherResponse.status} sur la playlist ${code}`.trim(), 'http')
  }
  return text
}

// URL de la playlist audio seule d'une VOD publique, utilisable directement par ffmpeg (-ss / -t).
export async function getVodAudioPlaylistUrl(videoId: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const url = parseAudioOnlyUrl(await fetchVodMasterPlaylist(videoId, fetchFn))
  if (!url) throw new VodPlaylistError('Variante audio seule absente de la playlist', 'shape')
  return url
}

// URL de la playlist video (<= maxHeight) d'une VOD publique.
export async function getVodVideoPlaylistUrl(videoId: string, maxHeight = 720, fetchFn: typeof fetch = fetch): Promise<string> {
  const variant = pickVideoVariant(parseVideoVariants(await fetchVodMasterPlaylist(videoId, fetchFn)), maxHeight)
  if (!variant) throw new VodPlaylistError('Aucune variante video dans la playlist', 'shape')
  return variant.url
}
