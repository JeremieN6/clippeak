import assert from 'node:assert/strict'
import { prisma } from '../../server/utils/prisma'
import { createPipelineStore } from '../../server/utils/clipping/prismaPipelineStore'
import { createPrismaClipQueueStore } from '../../server/utils/clipping/prismaClipQueueStore'
import { dataDir } from '../../server/utils/clipping/dataDir'
import { REQUIRED_SCHEMA } from '../../server/utils/clipping/preflight'

// Meme requete que server/worker/index.ts (missingSchema).
async function missingSchemaCheck(db: any): Promise<string[]> {
  const rows = await db.$queryRaw`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'` as Array<{ table_name: string, column_name: string }>
  const present = new Set(rows.map(r => `${r.table_name}.${r.column_name}`))
  return REQUIRED_SCHEMA.filter(r => !present.has(`${r.table}.${r.column}`)).map(r => `${r.table}.${r.column}`)
}

const log = (m: string) => console.log('  ok -', m)

async function main() {
  const store = createPipelineStore(prisma as any)
  const queue = createPrismaClipQueueStore(prisma)

  const channel = await prisma.channel.create({ data: { twitchId: '198013846', login: 'yassencore', displayName: 'YassEncore', settings: { create: {} } } })
  const vod = await prisma.vod.create({ data: { channelId: channel.id, twitchVodId: '999001', url: 'https://twitch.tv/videos/999001', status: 'ended' } })
  const live = await prisma.vod.create({ data: { channelId: channel.id, twitchVodId: '999002', url: 'https://twitch.tv/videos/999002', status: 'live' } })

  // 1. Prise en charge atomique d'une VOD terminee (la VOD en direct est ignoree)
  const claimed = await store.claimVodToAnalyze()
  assert.equal(claimed?.id, vod.id)
  assert.ok(claimed!.keywords.includes('mdr'))
  assert.equal((await prisma.vod.findUniqueOrThrow({ where: { id: vod.id } })).status, 'analyzing')
  assert.equal(await store.claimVodToAnalyze(), null)
  assert.equal((await prisma.vod.findUniqueOrThrow({ where: { id: live.id } })).status, 'live')
  log('claimVodToAnalyze : une seule prise, VOD live ignoree')

  // 2. Enregistrement de l'analyse : 6 moments -> 6 clips en file, lots de 4 puis 2
  const mk = (peakSec: number, score: number) => ({
    peak: { startSec: peakSec - 10, endSec: peakSec + 5, peakSec, score: 7, signals: { messages: 12, rateZ: 3, keywordShare: 0.3, capsShare: 0.1 } },
    transcript: {
      windowStartSec: peakSec - 45, windowDurationSec: 60, transcribeSec: 5, beforePeak: 'Alors hier au marche mdr.',
      segments: [{ start: peakSec - 20, end: peakSec - 15, text: 'Alors hier au marche mdr.', words: [{ start: peakSec - 20, end: peakSec - 19, text: 'Alors' }] }]
    },
    score: { score, kind: 'story' as const, hook: 'Alors hier au marche', category: 'general', summary: 's', rationale: 'r', scorer: 'heuristic' as const }
  })
  const saved = await store.saveAnalysis(vod.id, [mk(100, 9), mk(300, 8), mk(500, 7), mk(700, 6), mk(900, 5.5), mk(1100, 5.1)])
  assert.deepEqual(saved, { moments: 6, queued: 6 })
  const jobs = await prisma.clipJob.findMany({ orderBy: [{ batch: 'asc' }, { createdAt: 'asc' }], include: { moment: true } })
  assert.deepEqual(jobs.map(j => j.batch), [1, 1, 1, 1, 2, 2])
  assert.deepEqual(jobs.slice(0, 4).map(j => j.moment.aiScore), [9, 8, 7, 6])
  assert.ok(jobs.every(j => j.status === 'queued' && j.moment.transcript && j.moment.hook))
  assert.equal(await prisma.moment.count({ where: { status: 'validated' } }), 6)
  log('saveAnalysis : 6 moments, 6 clips, lots 1x4 + 1x2, meilleurs en premier')

  // un second passage continue la numerotation des lots
  const vod2 = await prisma.vod.create({ data: { channelId: channel.id, twitchVodId: '999003', url: 'u', status: 'ended' } })
  await store.saveAnalysis(vod2.id, [mk(50, 8)])
  assert.equal((await prisma.clipJob.aggregate({ _max: { batch: true } }))._max.batch, 3)
  log('numerotation des lots continue entre deux VODs')

  // 3. File de rendu : ordre de prise, review, echec
  const first = await queue.claimNext()
  assert.equal(first?.id, jobs[0].id)
  const ctx = await store.loadJobContext(first!.id)
  assert.equal(ctx.channelName, 'YassEncore')
  assert.equal(ctx.vodTwitchId, '999001')
  assert.equal(ctx.plan, null)
  assert.equal(ctx.settings.clipMinSec, 30)
  assert.equal(ctx.style.title.maxLines, 3)
  assert.equal(ctx.transcript.length, 1)
  assert.deepEqual(ctx.library, [])
  log('claimNext + loadJobContext : contexte complet avec DA par defaut')

  // 4. Fichiers du streamer : SFX, avatar, illustration -> chemins resolus dans le dossier de donnees
  const sfx = await prisma.streamerAsset.create({ data: { channelId: channel.id, kind: 'sfx', filename: 'vent.wav', path: `assets/${channel.id}/vent.wav` } })
  const logo = await prisma.streamerAsset.create({ data: { channelId: channel.id, kind: 'avatar', filename: 'logo.gif', path: `assets/${channel.id}/logo.gif` } })
  await prisma.streamerAsset.create({ data: { channelId: channel.id, kind: 'illustration', filename: 'marche-legumes.mp4', path: `assets/${channel.id}/m.mp4`, tags: ['marche'], source: 'Auteur X' } })
  await prisma.streamerStyle.create({ data: { channelId: channel.id, config: { sfx: { assetId: sfx.id }, overlay: { enabled: true, assetId: logo.id, appear: 'intro' }, names: ['YassEncore'] } } })
  const ctx2 = await store.loadJobContext(first!.id)
  assert.ok(ctx2.assets.sfxPath?.startsWith(dataDir()))
  assert.equal(ctx2.assets.overlayAnimated, true)
  assert.equal(ctx2.library.length, 1)
  assert.deepEqual(ctx2.library[0].tags, ['marche'])
  assert.equal(ctx2.library[0].source, 'Auteur X')
  assert.deepEqual(ctx2.style.names, ['YassEncore'])
  // un fichier d'un AUTRE streamer n'est jamais resolu
  const other = await prisma.channel.create({ data: { twitchId: '1', login: 'autre', displayName: 'Autre' } })
  const foreign = await prisma.streamerAsset.create({ data: { channelId: other.id, kind: 'sfx', filename: 'x.wav', path: `assets/${other.id}/x.wav` } })
  await prisma.streamerStyle.update({ where: { channelId: channel.id }, data: { config: { sfx: { assetId: foreign.id } } } })
  assert.equal((await store.loadJobContext(first!.id)).assets.sfxPath, undefined)
  log('loadJobContext : fichiers du streamer resolus, fichier d\'un autre streamer refuse')

  // 5. Resultat du rendu + echec QC
  await store.saveJobResult(first!.id, {
    outputPath: `${dataDir()}/clips/${first!.id}.mp4`, title: 'Mon titre', caption: 'Ma legende\n\n#twitch', hashtags: ['#twitch', '#clip'],
    plan: { startSec: 80, endSec: 110, keepRanges: [{ start: 80, end: 110 }] }, illustrations: [{ path: 'm.mp4', start: 3, end: 7, source: 'Auteur X', matchedTags: ['marche'] }],
    qc: { passed: true, issues: [], metrics: { width: 1080, height: 1920, videoSec: 30, audioSec: 30, freezeAtEndSec: null, leadingSilenceSec: 0, trailingSilenceSec: 0 } }
  } as any)
  await queue.markReview(first!.id, `clips/${first!.id}.mp4`)
  const done = await prisma.clipJob.findUniqueOrThrow({ where: { id: first!.id } })
  assert.equal(done.status, 'review')
  assert.equal(done.outputPath, `clips/${first!.id}.mp4`)
  assert.equal(done.title, 'Mon titre')
  assert.equal(done.hashtags, '#twitch #clip')
  assert.equal(done.startSec, 80)
  assert.deepEqual(done.keepRanges, [{ start: 80, end: 110 }])
  const second = await queue.claimNext()
  await store.saveQcFailure(second!.id, { passed: false, issues: [{ severity: 'error', code: 'frozen_end', message: 'Image figee' }] })
  await queue.markFailed(second!.id, 'Controle qualite : Image figee')
  const failed = await prisma.clipJob.findUniqueOrThrow({ where: { id: second!.id } })
  assert.equal(failed.status, 'failed')
  assert.equal((failed.qc as any).issues[0].code, 'frozen_end')
  log('saveJobResult / markReview / saveQcFailure / markFailed')

  // 6. Re-rendu apres un rejet : le plan est repris tel quel
  await prisma.clipJob.update({ where: { id: first!.id }, data: { status: 'queued' } })
  assert.deepEqual((await store.loadJobContext(first!.id)).plan, { startSec: 80, endSec: 110, keepRanges: [{ start: 80, end: 110 }] })
  log('plan de coupe conserve pour un nouveau rendu')

  // 7. Banque de reference
  await prisma.referenceClip.create({ data: { channelId: channel.id, twitchClipId: 'c1', title: 'Super clip', viewCount: 1234, durationSec: 20, category: 'Fortnite' } })
  assert.deepEqual(await store.referenceClips(channel.id), [{ id: 'c1', title: 'Super clip', viewCount: 1234, durationSec: 20, category: 'Fortnite' }])
  log('referenceClips')

  // 8. Preflight : sur une base migree, plus rien ne manque
  assert.deepEqual(await missingSchemaCheck(prisma), [])
  log('preflight : schema complet')

  console.log('DB_IT_OK')
}

main().catch((e) => { console.error('ECHEC', e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
