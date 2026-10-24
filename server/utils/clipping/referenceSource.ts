export type ReferenceSourceName = 'youtube' | 'tiktok' | 'instagram'

export interface ParsedReferenceUrl {
  url: string
  source: ReferenceSourceName
  // clip : une video ; account : un compte ou une chaine (developpe en plusieurs clips)
  kind: 'clip' | 'account'
}

const HOSTS: Record<string, ReferenceSourceName> = {
  'youtube.com': 'youtube',
  'www.youtube.com': 'youtube',
  'm.youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'tiktok.com': 'tiktok',
  'www.tiktok.com': 'tiktok',
  'vm.tiktok.com': 'tiktok',
  'vt.tiktok.com': 'tiktok',
  'instagram.com': 'instagram',
  'www.instagram.com': 'instagram'
}

const SEGMENT = /^[\w.@~-]{1,100}$/

// Valide et normalise un lien de reference. Seuls les hotes ci-dessus sont acceptes, en https, sans identifiants ni port :
// le lien est ensuite passe tel quel a un outil de telechargement, il ne doit jamais pointer ailleurs.
export function parseReferenceUrl(input: string): ParsedReferenceUrl | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
  const source = HOSTS[url.hostname.toLowerCase()]
  if (!source) return null

  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.some(p => !SEGMENT.test(p))) return null
  const clean = (path: string, keepQuery = '') => `https://${url.hostname.toLowerCase()}${path}${keepQuery}`

  if (source === 'youtube') {
    if (url.hostname === 'youtu.be' && parts.length === 1) return { url: clean(`/${parts[0]}`), source, kind: 'clip' }
    if (parts[0] === 'shorts' && parts[1]) return { url: clean(`/shorts/${parts[1]}`), source, kind: 'clip' }
    if (parts[0] === 'watch') {
      const id = url.searchParams.get('v')
      return id && /^[\w-]{6,20}$/.test(id) ? { url: clean('/watch', `?v=${id}`), source, kind: 'clip' } : null
    }
    if (parts[0]?.startsWith('@')) return { url: clean(`/${parts[0]}/shorts`), source, kind: 'account' }
    if (['channel', 'c', 'user'].includes(parts[0]) && parts[1]) return { url: clean(`/${parts[0]}/${parts[1]}/shorts`), source, kind: 'account' }
    return null
  }

  if (source === 'tiktok') {
    if (url.hostname.startsWith('vm.') || url.hostname.startsWith('vt.')) return parts.length === 1 ? { url: clean(`/${parts[0]}/`), source, kind: 'clip' } : null
    if (parts[0]?.startsWith('@') && parts[1] === 'video' && parts[2]) return { url: clean(`/${parts[0]}/video/${parts[2]}`), source, kind: 'clip' }
    if (parts[0]?.startsWith('@') && parts.length === 1) return { url: clean(`/${parts[0]}`), source, kind: 'account' }
    return null
  }

  // instagram
  if (['reel', 'reels', 'p'].includes(parts[0]) && parts[1]) return { url: clean(`/${parts[0] === 'reels' ? 'reel' : parts[0]}/${parts[1]}/`), source, kind: 'clip' }
  if (parts.length >= 1 && !['reel', 'reels', 'p', 'explore', 'accounts', 'stories', 'direct'].includes(parts[0]) && (parts.length === 1 || parts[1] === 'reels')) {
    return { url: clean(`/${parts[0]}/reels/`), source, kind: 'account' }
  }
  return null
}

export function parseReferenceUrls(inputs: string[], max = 20): { accepted: ParsedReferenceUrl[], rejected: string[] } {
  const accepted: ParsedReferenceUrl[] = []
  const rejected: string[] = []
  const seen = new Set<string>()
  for (const raw of inputs.map(i => i.trim()).filter(Boolean).slice(0, max)) {
    const parsed = parseReferenceUrl(raw)
    if (!parsed) rejected.push(raw.slice(0, 80))
    else if (!seen.has(parsed.url)) {
      seen.add(parsed.url)
      accepted.push(parsed)
    }
  }
  return { accepted, rejected }
}
