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

// URL de la playlist audio seule d'une VOD publique, utilisable directement par ffmpeg (-ss / -t).
// Les VODs reservees aux abonnes ou restreintes repondent "vod_manifest_restricted" (voir PRISE-DE-POSITION : OAuth).
export async function getVodAudioPlaylistUrl(videoId: string, fetchFn: typeof fetch = fetch): Promise<string> {
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

  const usherResponse = await fetchFn(`${USHER_URL}/${encodeURIComponent(videoId)}.m3u8?${new URLSearchParams({
    nauth: token.value,
    nauthsig: token.signature,
    allow_source: 'true',
    allow_audio_only: 'true'
  })}`)
  const text = await usherResponse.text()
  if (!usherResponse.ok) {
    let code = ''
    try { code = JSON.parse(text)?.[0]?.error_code ?? '' } catch { /* corps non JSON */ }
    if (code === 'vod_manifest_restricted') {
      throw new VodPlaylistError('VOD restreinte (abonnes ou contenu protege) : playlist inaccessible sans connexion du streamer', 'restricted')
    }
    throw new VodPlaylistError(`HTTP ${usherResponse.status} sur la playlist ${code}`.trim(), 'http')
  }

  const url = parseAudioOnlyUrl(text)
  if (!url) throw new VodPlaylistError('Variante audio seule absente de la playlist', 'shape')
  return url
}
