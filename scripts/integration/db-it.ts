import assert from 'node:assert/strict'
import { prisma } from '../../server/utils/prisma'
import { createPipelineStore } from '../../server/utils/clipping/prismaPipelineStore'
import { createPrismaClipQueueStore } from '../../server/utils/clipping/prismaClipQueueStore'
import { createPrismaReferenceStore, loadAnalyzedReferences, transcriptText } from '../../server/utils/clipping/prismaReferenceStore'
import { dataDir } from '../../server/utils/clipping/dataDir'
import { REQUIRED_SCHEMA } from '../../server/utils/clipping/preflight'
import { createPrismaPublishStore } from '../../server/utils/clipping/prismaPublishStore'

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

  // Chaine non ecoutee (test, demo) : une VOD ajoutee a la main est analysee, une VOD automatique ne l'est pas.
  const quiet = await prisma.channel.create({ data: { twitchId: 'test-ami', login: 'test-ami', displayName: 'Ami (test)', autoClip: false, settings: { create: {} } } })
  const autoVod = await prisma.vod.create({ data: { channelId: quiet.id, twitchVodId: '999101', url: 'https://twitch.tv/videos/999101', status: 'ended' } })
  assert.equal(await store.claimVodToAnalyze(), null)
  const manualVod = await prisma.vod.create({ data: { channelId: quiet.id, twitchVodId: '999102', url: 'https://twitch.tv/videos/999102', status: 'ended', source: 'manual' } })
  assert.equal((await store.claimVodToAnalyze())?.id, manualVod.id)
  assert.equal((await prisma.vod.findUniqueOrThrow({ where: { id: autoVod.id } })).status, 'ended')
  await prisma.vod.deleteMany({ where: { id: { in: [autoVod.id, manualVod.id] } } })
  await prisma.channel.delete({ where: { id: quiet.id } })
  log('chaine non ecoutee : seule la VOD ajoutee a la main est analysee')

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

  // 2b. Plafond mensuel de clips : jamais plus que la place restante, VOD en attente quand le plafond est atteint, illimite = jamais bloque
  {
    const capped = await prisma.channel.create({ data: { twitchId: '777001', login: 'plafonne', displayName: 'Plafonne', settings: { create: { monthlyClipQuota: 3 } } } })
    const cv1 = await prisma.vod.create({ data: { channelId: capped.id, twitchVodId: '999201', url: 'u', status: 'ended' } })
    // Les VODs en attente des autres chaines passent d'abord (plus anciennes) : on les met de cote le temps du test.
    await prisma.vod.updateMany({ where: { status: 'ended', channelId: { not: capped.id } }, data: { status: 'done' } })
    assert.equal((await store.claimVodToAnalyze())?.id, cv1.id)
    const cs = await store.saveAnalysis(cv1.id, [mk(100, 9), mk(300, 8), mk(500, 7), mk(700, 6), mk(900, 5.5)], 8)
    assert.deepEqual(cs, { moments: 5, queued: 3 })
    assert.equal(await prisma.moment.count({ where: { vodId: cv1.id, status: 'candidate' } }), 2) // le surplus reste candidat
    const cLive = await prisma.vod.create({ data: { channelId: capped.id, twitchVodId: '999299', url: 'u', status: 'live' } })
    assert.ok(!(await store.listLiveVods()).some(v => v.id === cLive.id)) // pas d'analyse pendant le live une fois le plafond atteint
    await prisma.vod.delete({ where: { id: cLive.id } })
    const cv2 = await prisma.vod.create({ data: { channelId: capped.id, twitchVodId: '999202', url: 'u', status: 'ended' } })
    assert.equal(await store.claimVodToAnalyze(), null)
    assert.equal((await prisma.vod.findUniqueOrThrow({ where: { id: cv2.id } })).status, 'ended') // en attente, pas en echec
    // Les echecs de rendu ne comptent pas
    await prisma.clipJob.updateMany({ where: { moment: { vodId: cv1.id } }, data: { status: 'failed' } })
    assert.equal(await (await import('../../server/utils/clipping/prismaQuota')).monthlyClipUsage(prisma as any, capped.id), 0)
    assert.equal((await store.claimVodToAnalyze())?.id, cv2.id)
    // Plafond releve a la main puis retire (illimite)
    await prisma.streamerSettings.update({ where: { channelId: capped.id }, data: { monthlyClipQuota: null } })
    const cv3 = await prisma.vod.create({ data: { channelId: capped.id, twitchVodId: '999203', url: 'u', status: 'ended' } })
    assert.equal((await store.claimVodToAnalyze())?.id, cv3.id)
    assert.deepEqual(await store.saveAnalysis(cv3.id, [mk(100, 9), mk(300, 8), mk(500, 7), mk(700, 6), mk(900, 5.5)], 8), { moments: 5, queued: 5 })
    // Un clip d'un mois precedent ne compte plus
    await prisma.streamerSettings.update({ where: { channelId: capped.id }, data: { monthlyClipQuota: 5 } })
    await prisma.clipJob.updateMany({ where: { moment: { vodId: cv3.id } }, data: { createdAt: new Date(Date.now() - 40 * 24 * 3600 * 1000) } })
    assert.equal(await (await import('../../server/utils/clipping/prismaQuota')).channelClipRoom(prisma as any, capped.id), 5)
    await prisma.channel.delete({ where: { id: capped.id } })
    await prisma.vod.updateMany({ where: { status: 'done', id: { in: [vod.id, vod2.id] } }, data: {} })
    log('plafond mensuel : clips limites a la place restante, VOD en attente (pas en echec), echecs non comptes, plafond releve ou retire, mois precedent ignore')
  }

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
  await prisma.streamerStyle.create({ data: { channelId: channel.id, config: { sfx: { intro: { enabled: true, sound: `asset:${sfx.id}` }, illustration: { enabled: true, sound: `asset:${sfx.id}` } }, overlay: { enabled: true, assetId: logo.id, appear: 'intro' }, names: ['YassEncore'] } } })
  const ctx2 = await store.loadJobContext(first!.id)
  assert.ok(ctx2.assets.sfxPaths?.[sfx.id]?.startsWith(dataDir()))
  assert.equal(ctx2.assets.overlayAnimated, true)
  assert.equal(ctx2.library.length, 1)
  assert.deepEqual(ctx2.library[0].tags, ['marche'])
  assert.equal(ctx2.library[0].source, 'Auteur X')
  assert.deepEqual(ctx2.style.names, ['YassEncore'])
  // un fichier d'un AUTRE streamer n'est jamais resolu
  const other = await prisma.channel.create({ data: { twitchId: '1', login: 'autre', displayName: 'Autre' } })
  const foreign = await prisma.streamerAsset.create({ data: { channelId: other.id, kind: 'sfx', filename: 'x.wav', path: `assets/${other.id}/x.wav` } })
  await prisma.streamerStyle.update({ where: { channelId: channel.id }, data: { config: { sfx: { intro: { enabled: true, sound: `asset:${foreign.id}` } } } } })
  assert.equal((await store.loadJobContext(first!.id)).assets.sfxPaths?.[foreign.id], undefined)
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

  // 8a. Analyse pendant le live : VODs en direct, pics deja traites, reprise a la fin du stream
  const lives = await store.listLiveVods()
  assert.deepEqual(lives.map(v => v.id), [live.id])
  assert.ok(lives[0].keywords.includes('mdr'))
  assert.deepEqual((await store.existingPeaks(vod.id)).sort((a, b) => a - b), [100, 300, 500, 700, 900, 1100])
  await store.setVodStatus(vod.id, 'ended')
  assert.equal((await store.claimVodToAnalyze())?.id, vod.id)
  log('listLiveVods, existingPeaks, une VOD deja analysee pendant le live est reprise a la fin')

  // 8b. Notification des lots : un lot n'est notifie que lorsque plus rien n'est en file ni en rendu, une seule fois
  const all = await prisma.clipJob.findMany({ where: { batch: { in: [1, 2] } }, orderBy: [{ batch: 'asc' }, { createdAt: 'asc' }] })
  for (const j of all) await prisma.clipJob.update({ where: { id: j.id }, data: { status: 'review', outputPath: `clips/${j.id}.mp4`, notifiedAt: null } })
  const batch2 = all.filter(j => j.batch === 2)
  await prisma.clipJob.update({ where: { id: batch2[0].id }, data: { status: 'rendering' } })
  const ready1 = await store.findBatchesToNotify()
  assert.deepEqual(ready1.map(b => b.batch), [1])
  assert.equal(ready1[0].clips.length, 4)
  assert.ok(ready1[0].clips.every(c => c.outputPath.startsWith('clips/') && typeof c.score === 'number'))
  await store.markNotified(ready1[0].clips.map(c => c.id))
  assert.deepEqual(await store.findBatchesToNotify(), [])
  await prisma.clipJob.update({ where: { id: batch2[0].id }, data: { status: 'review' } })
  const ready2 = await store.findBatchesToNotify()
  assert.deepEqual(ready2.map(b => [b.batch, b.clips.length]), [[2, 2]])
  await prisma.clipJob.update({ where: { id: batch2[1].id }, data: { status: 'failed' } })
  assert.equal((await store.findBatchesToNotify())[0].clips.length, 1)
  log('findBatchesToNotify / markNotified : lot pret seulement quand plus rien n\'est en cours, jamais deux fois')

  // 7b. Banque de reference : prise atomique (comptes d'abord), clips d'un compte, resultat, reprise
  const refs = createPrismaReferenceStore(prisma as any)
  const account = await prisma.referenceItem.create({ data: { channelId: channel.id, kind: 'account', source: 'youtube', url: 'https://www.youtube.com/@a/shorts' } })
  const clipA = await prisma.referenceItem.create({ data: { channelId: channel.id, kind: 'clip', source: 'upload', filePath: 'reference/a.mp4', title: 'a' } })
  const refFirst = await refs.claimNext()
  assert.equal(refFirst?.id, account.id)
  assert.equal(await refs.finishAccount(refFirst!, ['https://www.youtube.com/shorts/AAAAAAAAAA', 'https://www.youtube.com/shorts/BBBBBBBBBB']), 2)
  assert.equal(await refs.finishAccount(refFirst!, ['https://www.youtube.com/shorts/AAAAAAAAAA']), 0)
  assert.equal((await prisma.referenceItem.findUniqueOrThrow({ where: { id: account.id } })).status, 'done')
  assert.equal(await prisma.referenceItem.count({ where: { parentId: account.id } }), 2)
  const refSecond = await refs.claimNext()
  assert.equal(refSecond?.id, clipA.id)
  await prisma.referenceItem.update({ where: { id: clipA.id }, data: { viewCount: 5000 } })
  await refs.saveDone(clipA.id, { title: 'a', durationSec: 20, viewCount: null, likeCount: null, commentCount: null, shareCount: null, filePath: 'reference/a.mp4', transcript: 'bonjour le marche', analysis: { summary: 's', topic: 't', category: 'humour', hook: 'h', format: 'recit', emotion: 'rire', whyItWorks: 'w', keywords: ['marche'], analyzer: 'claude' } })
  const refDone = await prisma.referenceItem.findUniqueOrThrow({ where: { id: clipA.id } })
  assert.equal(refDone.status, 'done')
  assert.equal(refDone.viewCount, 5000)
  assert.equal(transcriptText(refDone.transcript), 'bonjour le marche')
  const refThird = await refs.claimNext()
  assert.ok(refThird && refThird.id !== clipA.id)
  assert.equal(await refs.requeueInterrupted(), 1)
  await refs.saveFailed(refThird!.id, 'Video unavailable')
  assert.equal((await prisma.referenceItem.findUniqueOrThrow({ where: { id: refThird!.id } })).status, 'failed')
  const analysed = await loadAnalyzedReferences(prisma as any, channel.id)
  assert.deepEqual(analysed.map(i => i.id), [clipA.id])
  log('banque de reference : prise atomique, comptes expanses sans doublon, stats manuelles conservees, reprise')

  // 7b. Publication : prise atomique des publications echues, jetons dechiffres, reprise apres erreur passagere
  const pubStore = createPrismaPublishStore(prisma as any, { decrypt: stored => stored.replace(/^enc:/, '') })
  const pubVod = await prisma.vod.create({ data: { channelId: channel.id, twitchVodId: '999777', url: 'u', status: 'done' } })
  const pubMoment = await prisma.moment.create({ data: { vodId: pubVod.id, startSec: 0, endSec: 10, peakSec: 5, score: 7, signals: {} } })
  const pubJob = await prisma.clipJob.create({ data: { momentId: pubMoment.id, status: 'approved', title: 'Titre', caption: 'Legende', hashtags: '#a', outputPath: 'clips/pub.mp4' } })
  await prisma.platformConnection.create({ data: { channelId: channel.id, platform: 'youtube', accessTokenEnc: 'enc:acces', refreshTokenEnc: 'enc:renouvellement', expiresAt: new Date(Date.now() + 3600_000) } })
  const pubPast = await prisma.publication.create({ data: { clipJobId: pubJob.id, platform: 'youtube', scheduledAt: new Date(Date.now() - 60_000) } })
  const pubFuture = await prisma.clipJob.create({ data: { momentId: pubMoment.id, status: 'approved', outputPath: 'clips/pub2.mp4' } })
    .then(j => prisma.publication.create({ data: { clipJobId: j.id, platform: 'youtube', scheduledAt: new Date(Date.now() + 3600_000) } }))
  const pubDue = await pubStore.claimDue(new Date())
  assert.equal(pubDue?.id, pubPast.id)
  assert.equal(pubDue?.attempts, 0)
  assert.equal(pubDue?.connection?.refreshToken, 'renouvellement')
  assert.equal(pubDue?.connection?.accessToken, 'acces')
  assert.equal(pubDue?.clip.status, 'approved')
  assert.ok(pubDue?.clip.videoPath?.replace(/\\/g, '/').endsWith('clips/pub.mp4'))
  assert.equal((await prisma.publication.findUniqueOrThrow({ where: { id: pubPast.id } })).status, 'publishing')
  assert.equal(await pubStore.claimDue(new Date()), null)
  await pubStore.markFailed(pubPast.id, 'passager', new Date(Date.now() - 1000))
  const pubRetried = await pubStore.claimDue(new Date())
  assert.equal(pubRetried?.id, pubPast.id)
  assert.equal(pubRetried?.attempts, 1)
  await pubStore.markPublished(pubPast.id, { externalId: 'VID', url: 'https://www.youtube.com/shorts/VID' }, new Date())
  const pubDone = await prisma.publication.findUniqueOrThrow({ where: { id: pubPast.id } })
  assert.deepEqual([pubDone.status, pubDone.externalId, pubDone.error], ['published', 'VID', null])
  await prisma.publication.update({ where: { id: pubFuture.id }, data: { status: 'publishing' } })
  assert.equal(await pubStore.requeueInterrupted(), 1)
  assert.equal((await prisma.publication.findUniqueOrThrow({ where: { id: pubFuture.id } })).status, 'failed')
  log('publication : une seule prise, jetons dechiffres, nouvel essai apres erreur passagere, publiee, une publication interrompue n\'est jamais rejouee')

  // 7c. VOD reservee aux abonnes : blocage, deblocage, extraits, pas de balayage
  const accVod = await prisma.vod.create({ data: { channelId: channel.id, twitchVodId: '999888', url: 'u', status: 'done', startedAt: new Date(Date.now() - 3600_000), endedAt: new Date() } })
  const accMoment = await prisma.moment.create({ data: { vodId: accVod.id, startSec: 0, endSec: 10, peakSec: 300, score: 7, signals: {} } })
  await prisma.clipJob.create({ data: { momentId: accMoment.id, status: 'review' } })
  await prisma.moment.create({ data: { vodId: accVod.id, startSec: 0, endSec: 10, peakSec: 900, score: 7, signals: {} } })
  assert.deepEqual(await store.momentsNeedingSources(accVod.id), [{ id: accMoment.id, peakSec: 300 }])
  assert.ok((await store.vodsToScan()).some(t => t.id === accVod.id))
  await store.markBlocked(accVod.id, 'reservee')
  const blockedRow = await prisma.vod.findUniqueOrThrow({ where: { id: accVod.id } })
  assert.deepEqual([blockedRow.status, blockedRow.error, blockedRow.sourcesSavedAt], ['blocked', 'reservee', null])
  assert.ok(blockedRow.restrictedAt)
  assert.ok((await store.listBlockedVods()).some(v => v.id === accVod.id))
  await store.markBlocked(accVod.id, 'encore')
  assert.equal((await prisma.vod.findUniqueOrThrow({ where: { id: accVod.id } })).restrictedAt?.getTime(), blockedRow.restrictedAt?.getTime())
  await store.setVodStatus(accVod.id, 'ended')
  assert.equal((await prisma.vod.findUniqueOrThrow({ where: { id: accVod.id } })).error, null)
  await store.setVodStatus(accVod.id, 'done')
  await store.markSourcesSaved(accVod.id)
  assert.ok((await store.vodAccessInfo(accVod.id)).restrictedAt)
  assert.equal((await store.vodsToScan()).some(t => t.id === accVod.id), false)
  assert.equal((await store.listBlockedVods()).some(v => v.id === accVod.id), false)
  log('acces a la VOD : blocage (premiere date gardee), deblocage, moments a extraire, une VOD deja reservee aux abonnes n est plus balayee')

  // 8. Preflight : sur une base migree, plus rien ne manque
  assert.deepEqual(await missingSchemaCheck(prisma), [])
  log('preflight : schema complet')

  console.log('DB_IT_OK')
}

main().catch((e) => { console.error('ECHEC', e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
