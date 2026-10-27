import { unlink } from 'node:fs/promises'
import { prisma } from './prisma'
import { dataDir, safeResolve } from './clipping/dataDir'

// Chaine de demonstration de l'admin : permet de voir le studio, de le modifier et de refaire le parcours d'un nouveau streamer
// sans toucher a un vrai compte. Ce n'est pas une chaine Twitch (autoClip desactive : ni ecoute des lives, ni analyse de VOD).
export const DEMO_TWITCH_ID = 'demo-clippeak'
export const isDemoTwitchId = (twitchId: string) => twitchId === DEMO_TWITCH_ID

interface SampleClip {
  status: 'review' | 'approved' | 'failed', score: number, title: string, hook: string, category: string, rationale: string
  caption: string | null, hashtags: string | null, qc: { passed: boolean, issues: Array<{ severity: string, message: string }> } | null, durationSec: number, error?: string
}

const SAMPLE_CLIPS: SampleClip[] = [
  { status: 'review', score: 8.4, title: 'Il rate son saut et la salle explose', hook: 'Personne n’a vu ça venir', category: 'humour', rationale: 'Pic de chat à 31 messages par minute (MDR, KEKW) juste après la chute.', caption: 'Quand le saut devait être facile 😭', hashtags: '#twitch #fail #gaming', qc: null, durationSec: 28 },
  { status: 'review', score: 7.6, title: 'La réaction qui fait basculer la partie', hook: 'Là, tout le monde a compris', category: 'jeu', rationale: 'Detecte par ressemblance (pas par le chat) avec un de tes clips de référence : même type de récit.', caption: 'Le tournant de la partie', hashtags: '#twitch #clutch', qc: null, durationSec: 34 },
  { status: 'review', score: 6.9, title: 'Le chat devine avant lui', hook: 'Le chat avait raison depuis le début', category: 'humour', rationale: 'Pic de chat modéré et phrase d’accroche nette.', caption: 'Le chat a toujours un coup d’avance', hashtags: '#twitch #chat', qc: { passed: true, issues: [{ severity: 'warning', message: 'Nom propre à vérifier : « Kaelys » (proche de « Kaelis »).' }] }, durationSec: 41 },
  { status: 'approved', score: 8.1, title: 'Sa pire chute de la saison', hook: 'Même lui n’y croit pas', category: 'humour', rationale: 'Pic de chat à 27 messages par minute.', caption: 'Chute de la saison 🎬', hashtags: '#twitch #fail', qc: null, durationSec: 25 },
  { status: 'failed', score: 5.8, title: 'Le silence le plus long du live', hook: 'Il ne se passe rien… et c’est drôle', category: 'humour', rationale: 'Chat calme.', caption: null, hashtags: null, qc: { passed: false, issues: [{ severity: 'error', message: 'Image figée en fin de clip.' }] }, durationSec: 22, error: 'Contrôle qualité : image figée en fin de clip.' }
]

async function removeFiles(paths: Array<string | null>) {
  for (const path of paths) {
    if (path) await unlink(safeResolve(dataDir(), path)).catch(() => {})
  }
}

// (Re)cree la chaine de demonstration a l'etat d'un streamer qui vient de s'inscrire : plus de reglages, de fichiers ni de banque de
// reference, parcours a refaire. Quelques clips d'exemple (sans video) montrent le tableau de bord.
export async function resetDemoChannel() {
  const existing = await prisma.channel.findUnique({ where: { twitchId: DEMO_TWITCH_ID }, include: { assets: true, referenceItems: true } })
  if (existing) {
    await prisma.channel.delete({ where: { id: existing.id } })
    await removeFiles([...existing.assets.map(a => a.path), ...existing.referenceItems.map(r => r.filePath)])
  }

  const channel = await prisma.channel.create({
    data: { twitchId: DEMO_TWITCH_ID, login: 'demo', displayName: 'Chaîne de démonstration', autoClip: false, settings: { create: {} } },
    select: { id: true, login: true, displayName: true, autoClip: true }
  })
  const vod = await prisma.vod.create({
    data: { channelId: channel.id, twitchVodId: `demo-${channel.id.slice(0, 8)}-vod`, url: 'https://www.twitch.tv/videos/0', title: 'Live de démonstration', status: 'done', startedAt: new Date(Date.now() - 6 * 3600 * 1000), endedAt: new Date(Date.now() - 2 * 3600 * 1000) }
  })
  let batch = 1
  for (const [i, clip] of SAMPLE_CLIPS.entries()) {
    const moment = await prisma.moment.create({
      data: { vodId: vod.id, startSec: 600 + i * 300, endSec: 640 + i * 300, peakSec: 625 + i * 300, score: clip.score, signals: {}, status: 'validated', hook: clip.hook, category: clip.category, kind: 'story', aiScore: clip.score, rationale: clip.rationale, scorer: 'local' }
    })
    await prisma.clipJob.create({
      data: {
        momentId: moment.id, status: clip.status, batch, title: clip.title, caption: clip.caption, hashtags: clip.hashtags, qc: clip.qc ?? undefined,
        error: clip.error ?? null, startSec: 600 + i * 300, endSec: 600 + i * 300 + clip.durationSec
      }
    })
    if (i === 3) batch = 2
  }
  return channel
}

// Chaine de demonstration existante, ou creee au premier appel.
export async function ensureDemoChannel() {
  const channel = await prisma.channel.findUnique({ where: { twitchId: DEMO_TWITCH_ID }, select: { id: true, login: true, displayName: true, autoClip: true } })
  return channel ?? resetDemoChannel()
}
