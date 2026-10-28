import { fetchVodMasterPlaylist, VodPlaylistError } from './vodPlaylist.ts'

// La VOD est-elle lisible par Clippeak ? Meme essai que celui du rendu (jeton de lecture puis playlist) : c'est la seule verification fiable,
// Helix annonce « public » meme pour une VOD reservee aux abonnes.
export type VodReadability = { state: 'readable' } | { state: 'restricted' } | { state: 'unknown', message: string }

export async function checkVodReadable(videoId: string, fetchFn: typeof fetch = fetch, endpoints: { gql?: string, usher?: string } = {}): Promise<VodReadability> {
  try {
    await fetchVodMasterPlaylist(videoId, fetchFn, endpoints)
    return { state: 'readable' }
  } catch (error) {
    if (error instanceof VodPlaylistError && error.kind === 'restricted') return { state: 'restricted' }
    return { state: 'unknown', message: error instanceof Error ? error.message : 'erreur inconnue' }
  }
}

export const RESTRICTED_MESSAGE = 'VOD réservée aux abonnés : Twitch refuse de la lire à Clippeak. Elle doit être rendue publique le temps de l’analyse.'
