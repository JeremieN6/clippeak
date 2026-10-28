// Identifiant d'une VOD Twitch a partir d'un lien (ou de l'identifiant seul). Refuse tout ce qui n'est pas une VOD Twitch :
// la valeur retournee n'est composee que de chiffres, elle peut donc etre utilisee telle quelle dans une requete.
export function parseTwitchVodId(input: string): string | null {
  const text = input.trim()
  if (/^\d{5,15}$/.test(text)) return text
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  if (!/^(www\.|m\.)?twitch\.tv$/i.test(url.hostname)) return null
  const match = /^\/(?:videos|[A-Za-z0-9_]{3,25}\/v(?:ideo)?)\/(\d{5,15})\/?$/.exec(url.pathname)
  return match ? match[1] : null
}
