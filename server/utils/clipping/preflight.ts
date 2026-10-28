import { spawnSync } from 'node:child_process'

export interface PreflightIssue {
  level: 'error' | 'warning'
  message: string
}

export interface PreflightDeps {
  // Colonnes/tables du schema V2 manquantes (migration non appliquee) ; vide si tout est la.
  missingSchema: () => Promise<string[]>
  commandWorks: (command: string, args: string[]) => boolean
  python: string
}

export const REQUIRED_SCHEMA = [
  { table: 'moments', column: 'transcript' },
  { table: 'moments', column: 'ai_score' },
  { table: 'clip_jobs', column: 'keep_ranges' },
  { table: 'clip_jobs', column: 'qc' },
  { table: 'streamer_styles', column: 'config' },
  { table: 'streamer_assets', column: 'path' },
  { table: 'reference_clips', column: 'view_count' },
  { table: 'reference_items', column: 'analysis' },
  { table: 'vods', column: 'scan_sec' },
  { table: 'publications', column: 'scheduled_at' },
  { table: 'platform_connections', column: 'refresh_token_enc' },
  { table: 'vods', column: 'sources_saved_at' }
]

export function commandWorks(command: string, args: string[]): boolean {
  return spawnSync(command, args, { stdio: 'ignore', timeout: 20_000 }).status === 0
}

// Verifie ce dont le worker a besoin avant de toucher a la file : migration appliquee (erreur bloquante, sinon une VOD
// serait marquee en echec a tort), ffmpeg (bloquant), Whisper (avertissement : seule l'analyse en depend).
export async function runPreflight(deps: PreflightDeps): Promise<PreflightIssue[]> {
  const issues: PreflightIssue[] = []
  const missing = await deps.missingSchema()
  if (missing.length) {
    issues.push({ level: 'error', message: `Migration non appliquee (manque : ${missing.join(', ')})` })
  }
  if (!deps.commandWorks('ffmpeg', ['-version'])) issues.push({ level: 'error', message: 'ffmpeg introuvable dans le PATH' })
  if (!deps.commandWorks('ffprobe', ['-version'])) issues.push({ level: 'error', message: 'ffprobe introuvable dans le PATH' })
  if (!deps.commandWorks(deps.python, ['-c', 'import faster_whisper'])) {
    issues.push({ level: 'warning', message: `faster-whisper indisponible avec ${deps.python} (analyse des VODs impossible ; voir WHISPER_PYTHON)` })
  }
  return issues
}

export const hasBlockingIssue = (issues: PreflightIssue[]) => issues.some(i => i.level === 'error')
