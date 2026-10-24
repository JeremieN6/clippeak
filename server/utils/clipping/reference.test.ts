import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { parseReferenceUrl, parseReferenceUrls } from './referenceSource.ts'
import { buildCorpus, rateBySimilarity, similarity, similarityBoost, tokenize } from './referenceSimilarity.ts'
import { analyzeReference, localAnalysis, normalizeAnalysis, topWords } from './referenceAnalysis.ts'
import { audienceScore, buildReferenceBankProfile, performanceWeights } from './referenceProfile.ts'
import { createReferenceStep, frameTimestamps, processReference } from './referencePipeline.ts'
import type { ReferenceDeps, ReferenceJob, ReferenceStore } from './referencePipeline.ts'
import { audioArgs, frameArgs, parseDuration } from './referenceMedia.ts'
import { accountArgs, downloadArgs, metadataArgs, parseAccountEntries, parseYtDlpMeta, runYtDlp, YtDlpError } from './ytdlp.ts'

test('only allow-listed https hosts are accepted, normalised and classified', () => {
  assert.deepEqual(parseReferenceUrl('https://www.youtube.com/shorts/AbC123xyz?feature=share'), { url: 'https://www.youtube.com/shorts/AbC123xyz', source: 'youtube', kind: 'clip' })
  assert.deepEqual(parseReferenceUrl('https://youtu.be/AbC123xyz?si=track'), { url: 'https://youtu.be/AbC123xyz', source: 'youtube', kind: 'clip' })
  assert.deepEqual(parseReferenceUrl('https://www.youtube.com/watch?v=AbC123xyz&t=3'), { url: 'https://www.youtube.com/watch?v=AbC123xyz', source: 'youtube', kind: 'clip' })
  assert.deepEqual(parseReferenceUrl('https://www.youtube.com/@streamer'), { url: 'https://www.youtube.com/@streamer/shorts', source: 'youtube', kind: 'account' })
  assert.deepEqual(parseReferenceUrl('https://www.tiktok.com/@streamer/video/7311111111111111111?lang=fr'), { url: 'https://www.tiktok.com/@streamer/video/7311111111111111111', source: 'tiktok', kind: 'clip' })
  assert.deepEqual(parseReferenceUrl('https://www.tiktok.com/@streamer'), { url: 'https://www.tiktok.com/@streamer', source: 'tiktok', kind: 'account' })
  assert.deepEqual(parseReferenceUrl('https://vm.tiktok.com/ZMabc123/'), { url: 'https://vm.tiktok.com/ZMabc123/', source: 'tiktok', kind: 'clip' })
  assert.deepEqual(parseReferenceUrl('https://www.instagram.com/reel/Cxyz123/?igsh=abc'), { url: 'https://www.instagram.com/reel/Cxyz123/', source: 'instagram', kind: 'clip' })
  assert.deepEqual(parseReferenceUrl('https://www.instagram.com/streamer/'), { url: 'https://www.instagram.com/streamer/reels/', source: 'instagram', kind: 'account' })
})

test('dangerous or foreign links are refused', () => {
  for (const bad of [
    'http://www.youtube.com/shorts/AbC123xyz', 'https://evil.example/shorts/AbC123xyz', 'https://youtube.com.evil.example/shorts/x',
    'https://user:pass@www.youtube.com/shorts/AbC123xyz', 'https://www.youtube.com:8443/shorts/AbC123xyz', 'file:///etc/passwd',
    'javascript:alert(1)', 'https://www.youtube.com/shorts/a b', 'https://www.youtube.com/watch', 'https://www.instagram.com/accounts/login/',
    'https://www.tiktok.com/', '', 'pas un lien', 'https://169.254.169.254/latest/meta-data'
  ]) assert.equal(parseReferenceUrl(bad), null, bad)
})

test('parseReferenceUrls dedupes, caps and reports what it rejected', () => {
  const { accepted, rejected } = parseReferenceUrls([
    'https://www.youtube.com/shorts/AbC123xyz', 'https://www.youtube.com/shorts/AbC123xyz?feature=share', 'https://evil.example/x', '  '
  ])
  assert.equal(accepted.length, 1)
  assert.deepEqual(rejected, ['https://evil.example/x'])
  const many = Array.from({ length: 40 }, (_, i) => `https://www.youtube.com/shorts/id${String(i).padStart(8, '0')}`)
  assert.equal(parseReferenceUrls(many, 20).accepted.length, 20)
})

const refs = [
  { id: 'marche', text: "Alors hier je suis allee au marche et le vendeur m'a dit que ma mere achetait que des legumes en promotion, j'ai explose de rire" },
  { id: 'jeu', text: "Le boss final de ce jeu est impossible, je suis mort dix fois de suite sur la meme attaque, c'est une honte pour le jeu" },
  { id: 'amour', text: "Ma copine m'a quitte hier soir par message, je ne sais pas quoi faire, elle ne repond plus a mes appels" }
]

test('tokenize removes accents, stop words and short words, and stems roughly', () => {
  assert.deepEqual(tokenize('Les légumes étaient en promotion !'), ['legume', 'promot'])
  assert.deepEqual(tokenize('le la de un 123 ab'), [])
})

test('similarity ranks the closest reference first and reports shared terms', () => {
  const corpus = buildCorpus(refs)
  const market = similarity("hier au marche le vendeur m'a dit des trucs sur les legumes de ma mere, j'ai explose", corpus)
  assert.equal(market.matches[0].id, 'marche')
  assert.ok(market.best > 0.2)
  assert.ok(market.matches[0].sharedTerms.includes('marche') || market.matches[0].sharedTerms.includes('legume'))
  const game = similarity('ce boss est impossible, je meurs sur chaque attaque du jeu', corpus)
  assert.equal(game.matches[0].id, 'jeu')
  const unrelated = similarity('la meteo de demain annonce du soleil sur toute la cote', corpus)
  assert.ok(unrelated.best < 0.08)
  assert.deepEqual(similarity('', corpus), { best: 0, matches: [] })
  assert.deepEqual(similarity('texte quelconque', buildCorpus([])), { best: 0, matches: [] })
})

test('similarityBoost ignores noise, caps at 2.5 and is modulated by the clip weight', () => {
  assert.equal(similarityBoost(0.05), 0)
  assert.equal(similarityBoost(0.2) > 0 && similarityBoost(0.2) < 2.5, true)
  assert.equal(similarityBoost(0.9), 2.5)
  assert.ok(similarityBoost(0.2, 1.4) > similarityBoost(0.2, 0.7))
  assert.ok(similarityBoost(0.9, 1.4) <= 2.5)
})

test('analysis: Claude answer is normalised, any failure falls back to a local analysis, the key stays in the header', async () => {
  let seen: any
  const fetchFn = (async (url: string, init: any) => {
    seen = { url, headers: init.headers, body: JSON.parse(init.body) }
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'Voici : {"summary":"Il raconte une scene au marche","topic":"marche","category":"humour","hook":"Hier je suis allee au marche","format":"recit","emotion":"rire","whyItWorks":"Chute inattendue","keywords":["marche","legumes","mere"]}' }] }) }
  }) as any
  const frames = [{ base64: 'AAAA', atSec: 1 }, { base64: 'BBBB', atSec: 9 }]
  const result = await analyzeReference({ title: 'Marche', transcript: refs[0].text, frames, durationSec: 30 }, { apiKey: 'sk-test', fetchFn })
  assert.equal(result.analyzer, 'claude')
  assert.equal(result.format, 'recit')
  assert.deepEqual(result.keywords, ['marche', 'legumes', 'mere'])
  assert.equal(seen.url, 'https://api.anthropic.com/v1/messages')
  assert.equal(seen.headers['x-api-key'], 'sk-test')
  assert.equal(JSON.stringify(seen.body).includes('sk-test'), false)
  assert.equal(seen.body.messages[0].content.filter((b: any) => b.type === 'image').length, 2)

  for (const bad of [
    (async () => ({ ok: false, status: 529, json: async () => ({}) })) as any,
    (async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'pas de json' }] }) })) as any,
    (async () => { throw new Error('reseau') }) as any
  ]) {
    const fallback = await analyzeReference({ transcript: refs[1].text, frames: [] }, { apiKey: 'k', fetchFn: bad })
    assert.equal(fallback.analyzer, 'local')
    assert.ok(fallback.keywords.length > 0)
  }
  assert.equal(normalizeAnalysis({ summary: 'x'.repeat(900), keywords: new Array(30).fill('mot') }, 'claude').summary.length, 400)
  assert.equal(normalizeAnalysis({ keywords: new Array(30).fill('mot') }, 'claude').keywords.length, 12)
  assert.deepEqual(topWords('boss boss boss jouer jouer attaque le la', 2), ['boss', 'jouer'])
  assert.equal(localAnalysis({ transcript: 'un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze', frames: [] }).hook.split(' ').length, 14)
})

const item = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: id, viewCount: null, likeCount: null, commentCount: null, shareCount: null, transcript: '', analysis: null, ...over
}) as any

test('profile: no statistics means equal weights; statistics weigh the profile moderately', () => {
  const equal = performanceWeights([item('a'), item('b')])
  assert.deepEqual([...equal.values()], [1, 1])
  const weights = performanceWeights([item('low', { viewCount: 1000 }), item('mid', { viewCount: 10000 }), item('high', { viewCount: 10000000 })])
  assert.equal(weights.get('high'), 1.4)
  assert.equal(weights.get('low'), 0.7)
  assert.equal(audienceScore(item('x', { likeCount: 10, commentCount: 2 })), 160)
  assert.equal(audienceScore(item('x')), null)
})

test('profile aggregates topics, formats and hooks of analysed clips', () => {
  const analysis = (format: string, hook: string, keywords: string[]) => ({ summary: '', topic: '', category: 'humour', hook, format, emotion: 'rire', whyItWorks: '', keywords, analyzer: 'claude' as const })
  const profile = buildReferenceBankProfile([
    item('a', { viewCount: 50000, analysis: analysis('recit', 'Hier au marche', ['marche', 'legumes']) }),
    item('b', { viewCount: 1000, analysis: analysis('recit', 'Le boss', ['jeu', 'marche']) }),
    item('c', { transcript: 'sans analyse du tout' })
  ])
  assert.equal(profile.clipCount, 3)
  assert.equal(profile.analyzedCount, 2)
  assert.equal(profile.withStats, 2)
  assert.equal(profile.topics[0].word, 'marche')
  assert.deepEqual(profile.formats, [{ name: 'recit', count: 2 }])
  assert.equal(profile.hooks[0].hook, 'Hier au marche')
})

test('yt-dlp arguments never use a config file, an exec option or an unseparated URL', () => {
  const url = 'https://www.youtube.com/shorts/AbC123xyz'
  for (const args of [metadataArgs(url), downloadArgs(url, '/d/x.%(ext)s'), accountArgs('https://www.youtube.com/@a/shorts', 500)]) {
    assert.ok(args.includes('--ignore-config'))
    assert.equal(args.some(a => /^--exec/.test(a)), false)
    assert.equal(args[args.length - 2], '--')
  }
  assert.ok(downloadArgs(url, 'o').includes('duration<=180'))
  assert.ok(downloadArgs(url, 'o').includes('100M'))
  assert.ok(accountArgs('u', 500).includes('50'))
})

test('yt-dlp metadata and account listings are parsed and filtered', () => {
  assert.deepEqual(parseYtDlpMeta({ id: 'x', title: 'T', duration: 31, view_count: 1200, like_count: 80, comment_count: 5, repost_count: 2 }),
    { id: 'x', title: 'T', durationSec: 31, viewCount: 1200, likeCount: 80, commentCount: 5, shareCount: 2 })
  assert.equal(parseYtDlpMeta({ id: 'x', view_count: -1 }).viewCount, null)
  const urls = parseAccountEntries({ entries: [
    { url: 'https://www.youtube.com/shorts/AbC123xyz' }, { webpage_url: 'https://www.youtube.com/shorts/AbC123xyz' },
    { url: 'https://evil.example/x' }, { url: 'https://www.youtube.com/shorts/ZZZ999yyy' }, { id: 'sans-url' }
  ] })
  assert.deepEqual(urls, ['https://www.youtube.com/shorts/AbC123xyz', 'https://www.youtube.com/shorts/ZZZ999yyy'])
})

function fakeChild(exit: { code: number, stdout?: string, stderr?: string, never?: boolean }) {
  const child: any = new EventEmitter()
  child.pid = 5
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => { setImmediate(() => child.emit('close', null)) }
  if (!exit.never) setImmediate(() => {
    if (exit.stdout) child.stdout.emit('data', Buffer.from(exit.stdout))
    if (exit.stderr) child.stderr.emit('data', Buffer.from(exit.stderr))
    child.emit('close', exit.code)
  })
  return child
}

test('runYtDlp returns stdout, runs at low priority and reports failures, timeouts and a missing binary', async () => {
  let priority = 0
  assert.equal(await runYtDlp(['x'], { spawnFn: (() => fakeChild({ code: 0, stdout: '{"ok":1}' })) as any, setPriorityFn: (_p, v) => { priority = v } }), '{"ok":1}')
  assert.ok(priority > 0)
  await assert.rejects(runYtDlp(['x'], { spawnFn: (() => fakeChild({ code: 1, stderr: 'ERROR: Video unavailable' })) as any, setPriorityFn: () => {} }), (e: any) => e instanceof YtDlpError && /unavailable/.test(e.message))
  await assert.rejects(runYtDlp(['x'], { spawnFn: (() => fakeChild({ code: 0, never: true })) as any, setPriorityFn: () => {}, timeoutMs: 20 }), /delai/)
  await assert.rejects(runYtDlp(['x'], { binary: 'yt-dlp-qui-n-existe-pas', setPriorityFn: () => {} }), /introuvable/)
})

test('rateBySimilarity lifts the score with an explanation, never above 10, and ignores unrelated moments', () => {
  const corpus = buildCorpus(refs)
  const titles = new Map([['marche', 'Le marche']])
  const close = rateBySimilarity(6, "hier au marche le vendeur m'a dit des trucs sur les legumes de ma mere, j'ai explose", corpus, titles)
  assert.ok(close.score > 6 && close.score <= 10)
  assert.match(close.note, /Le marche/)
  assert.equal(rateBySimilarity(9.8, "hier au marche le vendeur m'a dit des trucs sur les legumes de ma mere", corpus).score <= 10, true)
  assert.deepEqual(rateBySimilarity(6, 'la meteo de demain annonce du soleil sur toute la cote', corpus), { score: 6, boost: 0, best: rateBySimilarity(6, 'la meteo de demain annonce du soleil sur toute la cote', corpus).best, note: '' })
})

function pipelineHarness(job: Partial<ReferenceJob>, overrides: Partial<ReferenceDeps> = {}) {
  const calls: string[] = []
  const saved: any = {}
  const store: ReferenceStore = {
    requeueInterrupted: async () => 2,
    claimNext: async () => ({ id: 'j1', channelId: 'c1', kind: 'clip', source: 'youtube', url: 'https://www.youtube.com/shorts/AbC123xyz', filePath: null, title: null, ...job }),
    saveDone: async (id, result) => { saved.done = { id, result } },
    saveFailed: async (id, error) => { saved.failed = { id, error } },
    finishAccount: async (_job, urls) => { saved.account = urls; return urls.length }
  }
  const deps: ReferenceDeps = {
    expandAccount: async () => ['https://www.youtube.com/shorts/AAAAAAAAAA'],
    download: async () => ({ absolutePath: '/tmp/x.mp4', meta: { id: 'x', title: 'Titre', durationSec: 20, viewCount: 1000, likeCount: null, commentCount: null, shareCount: null } }),
    uploadedPath: j => `/data/${j.filePath}`,
    probeDuration: async () => 15,
    extractAudio: async () => { calls.push('audio') },
    transcribe: async () => '  bonjour   a tous  ',
    extractFrames: async () => [{ base64: 'AA', atSec: 1 }],
    analyze: async input => localAnalysis(input),
    tempWavPath: () => '/tmp/a.wav',
    removeFile: async (path) => { calls.push(`rm ${path}`) },
    ...overrides
  }
  return { store, deps, saved, calls }
}

test('pipeline: a linked clip is downloaded, transcribed, analysed, saved and its download removed', async () => {
  const h = pipelineHarness({})
  assert.equal(await processReference(await h.store.claimNext() as ReferenceJob, h.store, h.deps), 'done')
  assert.equal(h.saved.done.result.transcript, 'bonjour a tous')
  assert.equal(h.saved.done.result.viewCount, 1000)
  assert.equal(h.saved.done.result.title, 'Titre')
  assert.ok(h.calls.includes('rm /tmp/x.mp4') && h.calls.includes('rm /tmp/a.wav'))
})

test('pipeline: an uploaded file is kept, an account is expanded, failures are recorded without throwing', async () => {
  const upload = pipelineHarness({ url: null, filePath: 'reference/c1/a.mp4', source: 'upload', title: 'mon clip' })
  assert.equal(await processReference(await upload.store.claimNext() as ReferenceJob, upload.store, upload.deps), 'done')
  assert.equal(upload.saved.done.result.durationSec, 15)
  assert.equal(upload.calls.some(c => c.includes('a.mp4')), false)

  const account = pipelineHarness({ kind: 'account', url: 'https://www.youtube.com/@a/shorts' })
  assert.equal(await processReference(await account.store.claimNext() as ReferenceJob, account.store, account.deps), 'account')
  assert.deepEqual(account.saved.account, ['https://www.youtube.com/shorts/AAAAAAAAAA'])

  const broken = pipelineHarness({}, { download: async () => { throw new Error('Video unavailable') } })
  assert.equal(await processReference(await broken.store.claimNext() as ReferenceJob, broken.store, broken.deps), 'failed')
  assert.match(broken.saved.failed.error, /unavailable/)
  assert.equal(frameTimestamps(30).length, 6)
  assert.ok(frameTimestamps(30)[0] > 0 && frameTimestamps(30)[5] < 30)
})

test('pipeline step resumes interrupted items once, then returns false when the queue is empty', async () => {
  const h = pipelineHarness({})
  let left = 1
  h.store.claimNext = async () => (left-- > 0 ? { id: 'j', channelId: 'c', kind: 'clip', source: 'youtube', url: 'https://www.youtube.com/shorts/AbC123xyz', filePath: null, title: null } : null)
  const logs: string[] = []
  const step = createReferenceStep(h.store, h.deps, m => logs.push(m))
  assert.equal(await step(), true)
  assert.equal(await step(), false)
  assert.equal(logs.filter(l => /repris/.test(l)).length, 1)
})

test('ffmpeg arguments for references only read local files and the duration is parsed', () => {
  assert.deepEqual(audioArgs('/v.mp4', '/a.wav').slice(0, 2), ['-protocol_whitelist', 'file'])
  assert.deepEqual(frameArgs('/v.mp4', 3, '/f.jpg').slice(0, 2), ['-protocol_whitelist', 'file'])
  assert.equal(parseDuration('  Duration: 00:01:02.50, start: 0.0'), 62.5)
  assert.equal(parseDuration('rien'), null)
})
