import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { normalizeWord } from './assBuilder.ts'
import type { TimedWord } from './assBuilder.ts'

export interface IllustrationItem {
  path: string
  tags: string[]
  // Provenance de la video (lien, auteur, licence) : notee pour chaque illustration utilisee.
  source: string
  durationSec: number
}

export interface PlacedIllustration {
  path: string
  start: number
  end: number
  source: string
  matchedTags: string[]
}

export interface PlacementOptions {
  maxCount?: number
  minGapSec?: number
  maxLenSec?: number
  // Pas d'illustration pendant le zoom d'ouverture ni sur la toute fin du clip.
  introGuardSec?: number
  outroGuardSec?: number
}

const STOPWORDS = new Set(['avec', 'dans', 'pour', 'plus', 'sans', 'sous', 'tout', 'tous', 'mais', 'donc', 'video', 'clip', 'mp4', 'mov', 'webm'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.mkv'])

// "pomme-de-terre_cuisine.mp4" -> ["pomme", "terre", "cuisine"] ; les mots de moins de 4 lettres sont ignores.
export function tagsFromFilename(file: string): string[] {
  const name = basename(file, extname(file))
  return [...new Set(name.split(/[\s_\-.]+/).map(normalizeWord).filter(t => t.length >= 4 && !STOPWORDS.has(t)))]
}

function matches(wordNorm: string, tagNorm: string): boolean {
  if (wordNorm === tagNorm) return true
  // Pluriels et conjugaisons proches : meme racine d'au moins 5 lettres.
  return wordNorm.length >= 5 && tagNorm.length >= 5 && (wordNorm.startsWith(tagNorm.slice(0, 5)) && tagNorm.startsWith(wordNorm.slice(0, 5)))
}

// Pioche dans le dossier d'illustrations du streamer : une illustration par mention d'un de ses mots-cles,
// ecran scinde de la premiere mention jusqu'a la fin de la video (duree plafonnee), sans chevauchement.
export function placeIllustrations(words: TimedWord[], clipDurationSec: number, library: IllustrationItem[], options: PlacementOptions = {}): PlacedIllustration[] {
  const maxCount = options.maxCount ?? 2
  const minGap = options.minGapSec ?? 6
  const maxLen = options.maxLenSec ?? 4
  const intro = options.introGuardSec ?? 1.5
  const outro = options.outroGuardSec ?? 1.5

  const normalized = words.map(w => ({ ...w, norm: normalizeWord(w.text) })).filter(w => w.norm)
  const proposals: Array<PlacedIllustration & { strength: number }> = []
  for (const item of library) {
    const tagNorms = item.tags.map(normalizeWord).filter(Boolean)
    const hits = normalized.filter(w => tagNorms.some(t => matches(w.norm, t)))
    if (!hits.length) continue
    const start = Math.max(intro, hits[0].start - 0.3)
    const end = Math.min(start + Math.min(item.durationSec || maxLen, maxLen), clipDurationSec - outro)
    if (end - start < 1.2) continue
    proposals.push({
      path: item.path, start, end, source: item.source,
      matchedTags: [...new Set(hits.map(h => h.norm))],
      strength: hits.length
    })
  }

  const chosen: PlacedIllustration[] = []
  for (const proposal of proposals.sort((a, b) => b.strength - a.strength || a.start - b.start)) {
    if (chosen.length >= maxCount) break
    if (chosen.every(c => proposal.start >= c.end + minGap || proposal.end + minGap <= c.start)) {
      const { strength: _strength, ...placed } = proposal
      chosen.push(placed)
    }
  }
  return chosen.sort((a, b) => a.start - b.start)
}

function probeDuration(path: string): number {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], { encoding: 'utf8' })
  const value = Number(probe.stdout?.trim())
  return Number.isFinite(value) ? value : 0
}

// Indexe un dossier : tags deduits du nom de fichier, completes par un fichier "<nom>.json" optionnel
// ({"tags": [...], "source": "lien ou credit"}). Sans source declaree, la source est le nom du fichier.
export function scanIllustrationFolder(dir: string): IllustrationItem[] {
  if (!existsSync(dir)) return []
  const items: IllustrationItem[] = []
  for (const file of readdirSync(dir)) {
    if (!VIDEO_EXTENSIONS.has(extname(file).toLowerCase())) continue
    const path = join(dir, file)
    let tags = tagsFromFilename(file)
    let source = file
    const sidecar = join(dir, `${basename(file, extname(file))}.json`)
    if (existsSync(sidecar)) {
      try {
        const meta = JSON.parse(readFileSync(sidecar, 'utf8'))
        if (Array.isArray(meta.tags)) tags = [...new Set([...tags, ...meta.tags.map(String)])]
        if (typeof meta.source === 'string' && meta.source.trim()) source = meta.source.trim()
      } catch { /* sidecar illisible : on garde les tags du nom de fichier */ }
    }
    items.push({ path, tags, source, durationSec: probeDuration(path) })
  }
  return items
}
