import type { ChatMessage } from './chatPeaks.ts'
import { LONG_MIN_SEC, formatClock } from './longExtract.ts'

// Reperes du streamer pendant le live : il tape une commande au debut d'un bon passage et une autre a la fin (par defaut !extrait et !fin).
// Clippeak les retrouve dans le chat de la VOD et en fait des propositions d'extraits longs. Fichier pur (aucun import Node) : il sert aussi
// a la page du studio pour valider les commandes.

export const DEFAULT_START_COMMAND = '!extrait'
export const DEFAULT_END_COMMAND = '!fin'
// Sans commande de fin, le passage dure 5 minutes a partir du repere (reduit a la duree maximale choisie si elle est plus courte).
export const DEFAULT_PASSAGE_SEC = 300

// Commande valide : « ! » puis 2 a 20 lettres, chiffres, tirets ou « _ ». Rend la commande en minuscules, ou null.
export function normalizeCommand(raw: string): string | null {
  const command = raw.trim().toLowerCase()
  return /^![a-z0-9_-]{2,20}$/.test(command) ? command : null
}

// Message a montrer au streamer si les deux commandes ne conviennent pas, sinon null.
export function commandsProblem(start: string, end: string): string | null {
  if (!normalizeCommand(start)) return 'La commande de début doit commencer par « ! » puis 2 à 20 lettres ou chiffres, par exemple !extrait.'
  if (!normalizeCommand(end)) return 'La commande de fin doit commencer par « ! » puis 2 à 20 lettres ou chiffres, par exemple !fin.'
  if (normalizeCommand(start) === normalizeCommand(end)) return 'La commande de début et celle de fin doivent être différentes.'
  return null
}

export interface MarkerOptions {
  startCommand: string
  endCommand: string
  // Pseudo Twitch du streamer (celui de sa connexion a Clippeak) : seuls ses messages sont acceptes.
  channelLogin: string
  // Les moderateurs (badge « moderator ») peuvent-ils aussi taper les commandes ?
  allowModerators: boolean
  maxSec: number
  // Live termine : un debut sans fin donne un passage de DEFAULT_PASSAGE_SEC. Pendant le live, il attend sa fin.
  final: boolean
  // Duree du live en secondes si elle est connue : aucun passage ne depasse sa fin.
  vodDurationSec?: number | null
}

export interface MarkedPassage {
  startSec: number
  endSec: number
  // Heures des commandes dans le live (la fin est null quand elle a ete deduite).
  startMarkSec: number
  endMarkSec: number | null
  // Passage raccourci a la duree maximale, ou sans commande de fin.
  capped: boolean
  inferredEnd: boolean
}

// Seul le compte Twitch avec lequel le streamer s'est connecte a Clippeak est ecoute (son pseudo exact), jamais un badge « broadcaster » :
// avec le chat partage de Twitch, le proprietaire d'une AUTRE chaine pourrait en porter un dans ce chat. Les moderateurs ne sont ecoutes que si
// le streamer l'a choisi.
function allowed(message: ChatMessage, options: MarkerOptions): boolean {
  const author = message.author?.toLowerCase()
  if (!author) return false
  if (author === options.channelLogin.toLowerCase()) return true
  return options.allowModerators && (message.badges ?? []).includes('moderator')
}

const firstWord = (text: string) => text.trim().split(/\s+/)[0]?.toLowerCase() ?? ''

// Passages marques dans le chat. Un debut ouvre un passage, la fin suivante le ferme ; un nouveau debut avant la fin remplace le precedent ;
// une fin sans debut est ignoree ; un passage de moins de 3 minutes est ignore (commande tapee par erreur) ; un passage plus long que la
// duree maximale est raccourci. Le resultat ne depend pas de l'ordre des messages dans la liste.
export function detectMarkers(messages: ChatMessage[], options: MarkerOptions): MarkedPassage[] {
  const start = options.startCommand.toLowerCase()
  const end = options.endCommand.toLowerCase()
  const marks = messages
    .filter(m => allowed(m, options))
    .map(m => ({ t: m.t, word: firstWord(m.text) }))
    .filter(m => m.word === start || m.word === end)
    .sort((a, b) => a.t - b.t)

  const passages: MarkedPassage[] = []
  const limit = options.vodDurationSec && options.vodDurationSec > 0 ? options.vodDurationSec : Infinity
  const push = (startMark: number, endMark: number | null) => {
    const begin = Math.max(0, startMark)
    const asked = endMark ?? begin + Math.min(DEFAULT_PASSAGE_SEC, options.maxSec)
    const capped = asked - begin > options.maxSec
    const finish = Math.min(capped ? begin + options.maxSec : asked, limit)
    if (finish - begin < LONG_MIN_SEC) return
    passages.push({ startSec: begin, endSec: finish, startMarkSec: startMark, endMarkSec: endMark, capped: capped || (endMark === null && asked > limit), inferredEnd: endMark === null })
  }

  let open: number | null = null
  for (const mark of marks) {
    if (mark.word === start) {
      // Deux « debut » d'affilee : le premier est abandonne (le streamer a recommence).
      open = mark.t
    } else if (open !== null) {
      push(open, mark.t)
      open = null
    }
  }
  if (open !== null && options.final) push(open, null)
  return passages
}

// Phrase « pourquoi cette proposition » montree sur la carte.
export function markerWhy(passage: MarkedPassage, options: Pick<MarkerOptions, 'startCommand' | 'endCommand' | 'maxSec'>): string {
  const base = passage.endMarkSec === null
    ? `Tu as tapé ${options.startCommand} à ${formatClock(passage.startMarkSec, true)} sans ${options.endCommand} : Clippeak propose ${formatClock(passage.endSec - passage.startSec)} à partir de là.`
    : `Tu as tapé ${options.startCommand} à ${formatClock(passage.startMarkSec, true)} et ${options.endCommand} à ${formatClock(passage.endMarkSec, true)} : c’est un passage que tu as choisi toi-même.`
  return passage.capped && passage.endMarkSec !== null
    ? `${base} Il dépassait ta durée maximale (${formatClock(options.maxSec)}) : il a été raccourci, tu peux ajuster la fin.`
    : base
}
