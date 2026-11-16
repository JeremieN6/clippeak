// Avancement du « demarrage rapide » d'un nouveau streamer : ou en est l'analyse de ses derniers lives et dans combien de temps ses premiers clips
// arrivent. Regles pures (aucun import d'infrastructure) : testees dans startProgress.test.ts.
//
// Les durees sont des ESTIMATIONS, pas des mesures : elles viennent des reperes de vodProgress.ts (analyse ~ 2 min + 1,5 s par minute de live,
// rendu ~ 30 s par clip sur les 2 coeurs du serveur) et de la FILE D'ATTENTE reelle (lives et clips d'autres chaines devant celle-ci). Le serveur
// traite une tache a la fois : plus la file est longue, plus l'annonce s'allonge, au lieu de promettre un delai qu'il ne tiendrait pas.

import { RENDER_SEC_PER_CLIP, analysisEstimateSec } from './vodProgress.ts'

export type StartPhase =
  | 'none' // aucun live recent trouve : les clips arriveront apres le prochain live
  | 'waiting' // en file, pas encore commence
  | 'analyzing' // lecture du live en cours
  | 'rendering' // des clips sont en cours de montage
  | 'ready' // des clips sont prets
  | 'blocked' // live reserve aux abonnes : le streamer doit agir
  | 'failed' // analyse en echec
  | 'empty' // analyse terminee sans moment assez fort : rien a attendre de ces lives
  | 'paused' // plafond de clips du mois atteint

export interface StartVod {
  status: string // 'live' | 'ended' | 'analyzing' | 'done' | 'blocked' | 'failed'
  durationSec: number
  title: string | null
  // Detection par le contenu : secondes deja lues et marque de fin (null = pas encore commencee).
  transcribedSec: number | null
  // Plus rien a attendre de ce live : analyse terminee (chat et, si elle est active, detection par le contenu).
  finished: boolean
}

export interface StartInput {
  vods: StartVod[]
  // Clips de cette chaine par etat (hors echecs).
  clips: { queued: number, rendering: number, ready: number }
  // File d'attente des AUTRES chaines devant celle-ci : lives a analyser, et clips a monter.
  queue: { vodsAhead: number, clipsAhead: number }
  quotaReached: boolean
}

export interface StartProgress {
  phase: StartPhase
  // Temps estime avant les premiers clips (secondes), arrondi a 5 minutes ; null si rien a attendre ou si on ne peut pas l'estimer.
  etaSec: number | null
  vodTitle: string | null
  vods: number
  clips: number
}

// Un live d'une autre chaine devant nous coute en moyenne une analyse de 3 heures de live.
export const AVG_AHEAD_VOD_SEC = analysisEstimateSec(3 * 3600)
// Premier lot : 4 clips.
export const FIRST_BATCH = 4

const roundUp5 = (sec: number) => Math.max(5 * 60, Math.ceil(sec / 300) * 300)

export function computeStartProgress(input: StartInput): StartProgress {
  const { vods, clips, queue } = input
  const readyCount = clips.ready
  const vodTitle = vods.find(v => v.title)?.title ?? null
  const base = { vodTitle, vods: vods.length, clips: clips.queued + clips.rendering + clips.ready }

  if (readyCount > 0) return { ...base, phase: 'ready', etaSec: null }
  if (input.quotaReached && base.clips === 0) return { ...base, phase: 'paused', etaSec: null }
  if (!vods.length) return { ...base, phase: 'none', etaSec: null }

  const blocked = vods.filter(v => v.status === 'blocked')
  const failed = vods.filter(v => v.status === 'failed')
  // Tout est bloque ou en echec : il n'y a rien a attendre, le streamer (ou nous) doit agir.
  if (blocked.length + failed.length === vods.length && base.clips === 0) {
    return { ...base, phase: blocked.length ? 'blocked' : 'failed', etaSec: null }
  }

  const clipsInProgress = clips.queued + clips.rendering
  if (clipsInProgress > 0) {
    // Des clips sont deja en file : on attend les clips des autres devant, puis ceux-ci.
    const sec = (queue.clipsAhead + Math.min(FIRST_BATCH, clipsInProgress)) * RENDER_SEC_PER_CLIP
    return { ...base, phase: 'rendering', etaSec: roundUp5(sec) }
  }

  const active = vods.filter(v => v.status !== 'blocked' && v.status !== 'failed' && !v.finished)
  // Les lives ont tous ete lus et n'ont rien donne : on le dit, on ne laisse pas attendre pour rien.
  if (!active.length) return { ...base, phase: 'empty', etaSec: null }

  // Analyse du live le plus avance : lecture deja entamee ou en cours, sinon en file.
  const reading = active.some(v => v.status === 'analyzing' || v.status === 'live' || (v.transcribedSec ?? 0) > 0)
  // On ne depasse jamais la duree d'un live entier pour l'annonce du premier lot : les premiers moments sortent apres ~30 minutes lues.
  const first = active[0]
  const own = first ? analysisEstimateSec(Math.min(first.durationSec || 3 * 3600, 3 * 3600)) : AVG_AHEAD_VOD_SEC
  const sec = (reading ? 0 : queue.vodsAhead * AVG_AHEAD_VOD_SEC + queue.clipsAhead * RENDER_SEC_PER_CLIP) + own + FIRST_BATCH * RENDER_SEC_PER_CLIP
  return { ...base, phase: reading ? 'analyzing' : 'waiting', etaSec: roundUp5(sec) }
}

// Phrase affichee au streamer (francais simple, jamais plus precise que l'estimate).
export function startMessage(p: StartProgress): { title: string, text: string } {
  const eta = p.etaSec === null ? '' : p.etaSec >= 2 * 3600 ? 'plusieurs heures (le serveur a beaucoup de lives à traiter)' : p.etaSec >= 3600 ? `environ ${Math.round(p.etaSec / 1800) / 2} h`.replace('.', ',') : `environ ${Math.round(p.etaSec / 60)} minutes`
  const live = p.vodTitle ? `ton dernier live « ${p.vodTitle} »` : 'ton dernier live'
  switch (p.phase) {
    case 'waiting': return { title: 'Ton live est en file d’attente', text: `On va analyser ${live} dès que possible. Premiers clips dans ${eta}. Tu n’as rien à régler : tu peux fermer cette page.` }
    case 'analyzing': return { title: 'On analyse ton dernier live', text: `Clippeak écoute ${live} pour trouver les meilleurs moments. Premiers clips dans ${eta}. Tu peux fermer cette page, on te prévient.` }
    case 'rendering': return { title: 'On monte tes premiers clips', text: `Les meilleurs moments sont trouvés, le montage est en cours. Premiers clips dans ${eta}.` }
    case 'ready': return { title: 'Tes premiers clips sont prêts', text: 'Regarde-les, valide ceux que tu aimes. Les suivants arrivent après tes prochains lives.' }
    case 'blocked': return { title: 'Ton live est réservé aux abonnés', text: 'Twitch ne nous laisse pas le lire. Rends-le public le temps de l’analyse (quelques minutes), puis clique sur « Revérifier » dans la carte juste en dessous.' }
    case 'failed': return { title: 'L’analyse de ton live n’a pas abouti', text: 'On réessaiera avec ton prochain live. Tu peux aussi ajouter une rediffusion à la main depuis « Analyser une VOD ».' }
    case 'empty': return { title: 'Pas de moment assez fort cette fois', text: 'On a écouté ton dernier live sans trouver de moment qui mérite un clip. Dès ton prochain direct, Clippeak l’analyse tout seul.' }
    case 'paused': return { title: 'Plafond de clips du mois atteint', text: 'Tes lives attendent le mois prochain.' }
    default: return { title: 'On surveille ton prochain live', text: 'On n’a pas trouvé de live récent sur ta chaîne (ou il est trop court). Dès ton prochain direct, Clippeak l’analyse tout seul et tes premiers clips arrivent ici ; compte quelques heures après la fin du live. Tu peux aussi ajouter une rediffusion à la main depuis « Analyser une VOD ».' }
  }
}
