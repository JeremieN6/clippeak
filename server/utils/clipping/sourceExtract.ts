import { existsSync } from 'node:fs'
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

// Extraits sources : pendant l'analyse, Clippeak garde sur son serveur 2 minutes de video autour de chaque moment retenu. Les rendus (et
// les « Refaire ») lisent ces extraits au lieu de la VOD Twitch : la VOD peut alors redevenir reservee aux abonnes, ou etre supprimee.
export const SOURCE_BEFORE_SEC = 60
export const SOURCE_AFTER_SEC = 60
export const SOURCE_KEEP_DAYS = 14

export function sourceWindow(peakSec: number): { startSec: number, durationSec: number } {
  const startSec = Math.max(0, peakSec - SOURCE_BEFORE_SEC)
  return { startSec, durationSec: peakSec + SOURCE_AFTER_SEC - startSec }
}

// Chemin relatif au dossier de donnees ; prevu pour ne dependre que des identifiants (aucune colonne de base necessaire).
export const sourceRelPath = (vodId: string, momentId: string) => `sources/${vodId}/${momentId}.mp4`

// Recodage tres leger (ultrafast) plutot qu'une copie des paquets : la coupe tombe exactement sur l'image demandee, donc les temps du plan
// de coupe restent justes (une copie ne coupe qu'aux images cles, parfois 10 s plus tot).
export function sourceExtractArgs(playlistUrl: string, window: { startSec: number, durationSec: number }, outPath: string): string[] {
  return [
    '-ss', String(window.startSec), '-t', String(window.durationSec), '-i', playlistUrl,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-threads', '2', outPath
  ]
}

// Le plan de coupe tient-il entierement dans l'extrait ? (sinon le rendu doit lire la VOD)
export function coversPlan(peakSec: number, plan: { startSec: number, endSec: number }): boolean {
  const w = sourceWindow(peakSec)
  return plan.startSec >= w.startSec - 0.01 && plan.endSec + 0.5 <= w.startSec + w.durationSec
}

export interface ExtractInput {
  vodId: string
  moments: Array<{ id: string, peakSec: number }>
  baseDir: string
  videoUrl: string
  run: (args: string[]) => Promise<unknown>
  exists?: (path: string) => boolean
  log?: (message: string) => void
}

// Extrait ce qui manque. Un extrait est ecrit sous un nom provisoire puis renomme : un fichier present est toujours complet.
export async function extractSources(input: ExtractInput): Promise<{ saved: number, alreadyThere: number, failed: string[] }> {
  const exists = input.exists ?? existsSync
  let saved = 0
  let alreadyThere = 0
  const failed: string[] = []
  for (const moment of input.moments) {
    const finalPath = join(input.baseDir, sourceRelPath(input.vodId, moment.id))
    if (exists(finalPath)) { alreadyThere++; continue }
    const tempPath = finalPath.replace(/\.mp4$/, '.part.mp4')
    try {
      await mkdir(dirname(finalPath), { recursive: true })
      await input.run(sourceExtractArgs(input.videoUrl, sourceWindow(moment.peakSec), tempPath))
      await rename(tempPath, finalPath)
      saved++
    } catch (error) {
      failed.push(moment.id)
      input.log?.(`extrait du moment ${moment.id} impossible : ${error instanceof Error ? error.message.slice(0, 160) : 'erreur'}`)
      await rm(tempPath, { force: true }).catch(() => {})
    }
  }
  return { saved, alreadyThere, failed }
}

// Efface les dossiers d'extraits plus vieux que `maxAgeDays` (par la date de leur derniere modification). Renvoie le nombre supprime.
export async function purgeOldSources(baseDir: string, maxAgeDays = SOURCE_KEEP_DAYS, now = Date.now()): Promise<number> {
  const root = join(baseDir, 'sources')
  let names: string[]
  try { names = await readdir(root) } catch { return 0 }
  let removed = 0
  for (const name of names) {
    const dir = join(root, name)
    try {
      if (now - (await stat(dir)).mtimeMs > maxAgeDays * 24 * 3600 * 1000) {
        await rm(dir, { recursive: true, force: true })
        removed++
      }
    } catch { /* dossier disparu entre-temps */ }
  }
  return removed
}
