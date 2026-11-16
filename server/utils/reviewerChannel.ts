import { execFile } from 'node:child_process'
import { mkdir, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { promisify } from 'node:util'
import { prisma } from './prisma'
import { dataDir, safeResolve } from './clipping/dataDir'

const run = promisify(execFile)

// Chaine de relecture pour l'equipe de Meta (revue de l'application Instagram) : Clippeak est sur invitation et Meta n'a pas de compte Twitch.
// Ce n'est PAS une chaine de test ni de demo : Instagram peut s'y connecter et on peut y publier. Elle ne contient qu'un clip d'exemple
// (un motif video genere, aucune donnee d'ami) et n'ecoute aucun live. On y entre par un code (variable REVIEWER_CODE), jamais par Twitch.
export const REVIEWER_TWITCH_ID = 'meta-review'
export const isReviewerTwitchId = (twitchId: string) => twitchId === REVIEWER_TWITCH_ID
const SAMPLE_PATH = 'reviewer/exemple.mp4'

// Video d'exemple : 8 secondes verticales (1080x1920, H.264 + AAC silencieux), conformes a ce qu'attend Instagram pour un Reel.
async function ensureSampleVideo(): Promise<void> {
  const target = safeResolve(dataDir(), SAMPLE_PATH)
  if (await stat(target).then(s => s.size > 0, () => false)) return
  await mkdir(dirname(target), { recursive: true })
  await run('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=8',
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-t', '8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', target
  ], { timeout: 60_000 })
}

// Cree (ou retrouve) la chaine de relecture avec son clip d'exemple deja approuve.
export async function ensureReviewerChannel(): Promise<{ id: string }> {
  const channel = await prisma.channel.upsert({
    where: { twitchId: REVIEWER_TWITCH_ID },
    update: {},
    create: { twitchId: REVIEWER_TWITCH_ID, login: 'meta-review', displayName: 'Relecture Meta', autoClip: false, settings: { create: {} } },
    select: { id: true }
  })
  const hasClip = await prisma.clipJob.findFirst({ where: { moment: { vod: { channelId: channel.id } } }, select: { id: true } })
  if (!hasClip) {
    const vod = await prisma.vod.create({
      data: { channelId: channel.id, twitchVodId: `review-${channel.id.slice(0, 8)}-vod`, url: 'https://www.twitch.tv/videos/0', title: 'Live d’exemple', status: 'done', startedAt: new Date(Date.now() - 6 * 3600 * 1000), endedAt: new Date(Date.now() - 2 * 3600 * 1000) }
    })
    const moment = await prisma.moment.create({
      data: { vodId: vod.id, startSec: 600, endSec: 608, peakSec: 604, score: 8, signals: {}, status: 'validated', hook: 'Clip d’exemple', category: 'humour', kind: 'story', aiScore: 8, rationale: 'Clip d’exemple pour la relecture de l’application.', scorer: 'local' }
    })
    await prisma.clipJob.create({
      data: { momentId: moment.id, status: 'approved', batch: 1, title: 'Clip d’exemple pour la relecture', caption: 'Clip d’exemple Clippeak', hashtags: '#clippeak #demo', startSec: 600, endSec: 608, outputPath: SAMPLE_PATH, renderedAt: new Date() }
    })
  }
  await ensureSampleVideo()
  return channel
}
