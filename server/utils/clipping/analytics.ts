// Suivi du parcours (PostHog) : regles pures, testables. Le studio est un espace prive : aucune donnee personnelle ne doit partir.
// On n'envoie que des NOMS d'evenements d'une liste fermee et des proprietes neutres (nombres, booleens, mots-cles courts).

export const STUDIO_EVENTS = [
  'studio_opened', // le streamer ouvre le studio (retour a J+7 = ce meme evenement, des jours plus tard)
  'onboarding_step', // etape terminee ou passee : { step, kind }
  'onboarding_completed',
  'clip_reviewed', // approuve / refuse / refait : { action, first } (first = premiere approbation)
  'clip_published', // publication lancee ou programmee : { platform, when, first }
  'roadmap_voted', // vote sur « Prochainement » : { feature, changed }
  'roadmap_idea_sent', // idee envoyee (le texte n'est JAMAIS envoye)
  'checkout_started' // clic sur « Passer a Creator » (le paiement lui-meme se passe chez Stripe)
] as const
export type StudioEvent = (typeof STUDIO_EVENTS)[number]

// Pages ou le tracking automatique (clics, textes) est coupe : espace du streamer, administration, connexion, attente.
const PRIVATE_PREFIXES = ['/studio', '/admin', '/attente', '/connexion', '/inscription']
export function isPrivatePath(path: string): boolean {
  return PRIVATE_PREFIXES.some(p => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`))
}

// Proprietes acceptees : booleens, nombres entiers courts, mots-cles en minuscules (jamais une phrase, un titre ni un pseudo).
export function safeProps(props: Record<string, unknown> = {}): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(props)) {
    if (!/^[a-z_]{1,30}$/.test(key)) continue
    if (typeof value === 'boolean') out[key] = value
    else if (typeof value === 'number' && Number.isInteger(value) && Math.abs(value) < 100000) out[key] = value
    else if (typeof value === 'string' && /^[a-z0-9_-]{1,40}$/.test(value)) out[key] = value
  }
  return out
}

// Evenement a envoyer, ou null s'il ne doit pas partir (nom inconnu).
export function buildEvent(name: string, props?: Record<string, unknown>): { name: StudioEvent, props: Record<string, string | number | boolean> } | null {
  if (!(STUDIO_EVENTS as readonly string[]).includes(name)) return null
  return { name: name as StudioEvent, props: safeProps(props) }
}

// Nettoyage de TOUT evenement PostHog avant envoi (y compris les pages vues automatiques) :
// - /admin : rien ne part du tout (l'administration n'est pas de l'audience) ;
// - autres espaces prives : l'adresse est gardee SANS ses parametres (ex. /attente?login=<pseudo> ou /studio?channel=<id> ne partent jamais).
const URL_KEYS = ['$current_url', 'current_url', '$referrer', '$initial_current_url', '$initial_referrer', '$session_entry_url']
const stripQuery = (value: string) => value.replace(/[?#].*$/, '')

export interface PostHogEventLike { event: string, properties?: Record<string, unknown>, $set?: Record<string, unknown>, $set_once?: Record<string, unknown> }

export function scrubEvent<T extends PostHogEventLike>(evt: T | null): T | null {
  if (!evt) return evt
  const props = evt.properties ?? {}
  const where = typeof props.$pathname === 'string' ? props.$pathname : typeof props.$current_url === 'string' ? safePath(props.$current_url) : typeof props.current_url === 'string' ? safePath(props.current_url) : ''
  if (where === '/admin' || where.startsWith('/admin/')) return null
  if (!isPrivatePath(where)) return evt
  const clean = (bag?: Record<string, unknown>) => {
    if (!bag) return bag
    const out = { ...bag }
    for (const key of URL_KEYS) if (typeof out[key] === 'string') out[key] = stripQuery(out[key] as string)
    return out
  }
  return { ...evt, properties: clean(evt.properties), $set: clean(evt.$set), $set_once: clean(evt.$set_once) }
}

function safePath(url: string): string {
  try { return new URL(url, 'http://x').pathname } catch { return url.replace(/[?#].*$/, '') }
}
