// Capacite du serveur : regles pures (aucun import), partagees par le worker (qui mesure et alerte) et la page d'administration (qui affiche).
// La charge lue est celle de TOUT le serveur (il heberge d'autres applications) : c'est ce qui decide si Clippeak va ralentir.

export interface Sample {
  load1: number
  load5: number
  cores: number
  memTotalMb: number
  memFreeMb: number
  clipsQueued: number
  clipsRendering: number
  analysesQueued: number
  analysesRunning: number
  // Anciennete (secondes) du plus ancien clip qui attend un rendu ; null si la file est vide.
  oldestWaitSec: number | null
}

export type Verdict = 'ok' | 'attention' | 'sature'

// Seuils : charge en multiples du nombre de coeurs, attente d'un clip en secondes.
export const LOAD_WARN = 1.0
export const LOAD_CRIT = 1.5
export const WAIT_WARN_SEC = 10 * 60
export const WAIT_CRIT_SEC = 20 * 60
// Une alerte (Telegram) part apres 5 mesures de suite au-dessus du seuil critique, ou quand un clip attend plus de 15 minutes.
export const ALERT_LOAD_SAMPLES = 5
export const ALERT_WAIT_SEC = 15 * 60

const memLow = (s: Pick<Sample, 'memTotalMb' | 'memFreeMb'>) => s.memFreeMb < Math.max(400, s.memTotalMb * 0.08)

export function verdictOf(s: Sample): Verdict {
  const wait = s.oldestWaitSec ?? 0
  if (s.load1 > LOAD_CRIT * s.cores || wait > WAIT_CRIT_SEC || memLow(s)) return 'sature'
  if (s.load1 > LOAD_WARN * s.cores || wait > WAIT_WARN_SEC) return 'attention'
  return 'ok'
}

// MemAvailable de /proc/meminfo, en Mo (la memoire « libre » de Linux ignore le cache, qui est pourtant reutilisable).
export function parseMemAvailableMb(meminfo: string): number | null {
  const match = /^MemAvailable:\s+(\d+)\s*kB/m.exec(meminfo)
  return match ? Math.round(Number(match[1]) / 1024) : null
}

export interface Alert { kind: 'charge' | 'attente' | 'memoire', message: string }

const fr = (n: number, digits = 1) => n.toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits })

// `recent` : les mesures les plus recentes, de la plus ancienne a la plus recente.
export function alertReason(recent: Sample[]): Alert | null {
  const last = recent[recent.length - 1]
  if (!last) return null
  const tail = recent.slice(-ALERT_LOAD_SAMPLES)
  if (tail.length === ALERT_LOAD_SAMPLES && tail.every(s => s.load1 > LOAD_CRIT * s.cores)) {
    return { kind: 'charge', message: `Alerte serveur Clippeak : la charge est a ${fr(last.load1)} pour ${last.cores} coeurs depuis ${ALERT_LOAD_SAMPLES} minutes (file : ${last.clipsQueued} clip${last.clipsQueued > 1 ? 's' : ''} en attente, ${last.analysesQueued + last.analysesRunning} analyse${last.analysesQueued + last.analysesRunning > 1 ? 's' : ''}). Voir /admin, onglet Capacite.` }
  }
  if ((last.oldestWaitSec ?? 0) > ALERT_WAIT_SEC) {
    return { kind: 'attente', message: `Alerte serveur Clippeak : un clip attend son rendu depuis ${Math.round((last.oldestWaitSec ?? 0) / 60)} minutes (${last.clipsQueued} en file). Le serveur ne suit plus : voir /admin, onglet Capacite.` }
  }
  if (memLow(last)) {
    return { kind: 'memoire', message: `Alerte serveur Clippeak : memoire presque pleine (${last.memFreeMb} Mo disponibles sur ${last.memTotalMb} Mo). Voir /admin, onglet Capacite.` }
  }
  return null
}

export function percentile(values: number[], p: number): number | null {
  const sorted = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b)
  if (!sorted.length) return null
  const rank = (sorted.length - 1) * Math.min(1, Math.max(0, p))
  const low = Math.floor(rank)
  const high = Math.ceil(rank)
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (rank - low)
}

export function summarize(values: number[]): { n: number, median: number | null, p90: number | null, max: number | null } {
  const clean = values.filter(v => Number.isFinite(v))
  return { n: clean.length, median: percentile(clean, 0.5), p90: percentile(clean, 0.9), max: clean.length ? Math.max(...clean) : null }
}

// Conseil en clair pour le porteur. `saturatedShare` : part (0 a 1) des mesures des 7 derniers jours au-dessus du seuil critique.
export function recommendation(input: { verdict: Verdict | null, saturatedShare: number | null, waitP90Sec: number | null, samples: number }): string {
  if (!input.samples) return 'Aucune mesure pour l’instant : le worker en enregistre une par minute. Reviens dans quelques minutes.'
  if ((input.saturatedShare ?? 0) > 0.05 || (input.waitP90Sec ?? 0) > ALERT_WAIT_SEC) {
    return 'Le serveur est souvent saturé : passe au palier supérieur (KVM 4 : 4 cœurs, 16 Go) avant d’ouvrir davantage d’invitations. Si la charge vient surtout des autres applications du serveur, déplace-les plutôt que Clippeak.'
  }
  if (input.verdict === 'sature') return 'Le serveur est saturé en ce moment. Si ça se répète, passe au palier supérieur.'
  if (input.verdict === 'attention') return 'À surveiller : la charge approche de la limite. Rien à faire tant que ça ne dure pas.'
  return 'Rien à faire : le serveur absorbe la charge actuelle.'
}

// Reperes pour decider (affiches tels quels dans l'administration).
export const UPGRADE_RULE = 'Passe au palier supérieur si la charge dépasse 1,5 fois le nombre de cœurs pendant plus de 5 minutes plusieurs jours de suite, ou si un clip attend plus de 15 minutes plus d’une fois par semaine.'
