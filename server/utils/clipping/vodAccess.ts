import { fetchVodMasterPlaylist, VodPlaylistError } from './vodPlaylist.ts'

// Raison lisible d'un echec de lecture de VOD (affichee dans /admin). Une VOD depubliee ou supprimee n'est pas distinguable d'un numero
// inexistant : Twitch renvoie simplement « pas de jeton ».
export function describeVodError(error: unknown): string {
  if (error instanceof VodPlaylistError) {
    if (error.kind === 'restricted') return RESTRICTED_MESSAGE
    if (error.kind === 'token') return 'VOD introuvable ou non publiée : Twitch ne la montre plus à Clippeak (dépubliée ou supprimée ?).'
    if (error.kind === 'shape') return 'Cette VOD n’a pas de vidéo exploitable (audio seul ?) : impossible d’en tirer des clips.'
    return `Twitch n’a pas répondu comme prévu (${error.message.slice(0, 80)}). Réessaie plus tard.`
  }
  return error instanceof Error ? error.message.slice(0, 200) : 'Erreur inconnue pendant l’analyse.'
}

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
