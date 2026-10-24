import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { transcribePeak, windowForPeak } from './peakTranscript.ts'
import { parseWhisperOutput, transcribeWav, WhisperError } from './whisperTranscribe.ts'
import { audioWindowArgs } from './audioWindow.ts'
import { getVodAudioPlaylistUrl, parseAudioOnlyUrl, VodPlaylistError } from './vodPlaylist.ts'

test('windowForPeak puts ~45 s before and ~15 s after the peak and never starts before 0', () => {
  assert.deepEqual(windowForPeak({ startSec: 980, endSec: 1000, peakSec: 1035 }), { startSec: 990, durationSec: 65 })
  assert.deepEqual(windowForPeak({ startSec: 0, endSec: 10, peakSec: 20 }), { startSec: 0, durationSec: 40 })
})

test('transcribePeak shifts segments to VOD time, extracts what is said before the peak and cleans up', async () => {
  const calls: string[] = []
  const result = await transcribePeak({ startSec: 980, endSec: 1000, peakSec: 1035 }, {
    tempWavPath: () => '/tmp/w.wav',
    extractWindow: async (start, duration, path) => { calls.push(`extract ${start} ${duration} ${path}`) },
    transcribe: async () => ({
      audioSec: 60,
      transcribeSec: 8,
      segments: [
        { start: 2, end: 5, text: 'Elles ont une intelligence' },
        { start: 40, end: 44, text: 'attends la suite' },
        { start: 50, end: 52, text: '   ' },
        { start: 46, end: 50, text: 'apres le pic' }
      ]
    }),
    removeFile: async (path) => { calls.push(`remove ${path}`) }
  })
  assert.deepEqual(calls, ['extract 990 65 /tmp/w.wav', 'remove /tmp/w.wav'])
  assert.equal(result.segments.length, 3)
  assert.equal(result.segments[0].start, 992)
  assert.equal(result.beforePeak, 'Elles ont une intelligence attends la suite')
})

test('transcribePeak removes the temp file even when transcription fails', async () => {
  let removed = false
  await assert.rejects(transcribePeak({ startSec: 0, endSec: 5, peakSec: 10 }, {
    tempWavPath: () => 'w',
    extractWindow: async () => {},
    transcribe: async () => { throw new WhisperError('boom', 1) },
    removeFile: async () => { removed = true }
  }), /boom/)
  assert.equal(removed, true)
})

test('parseWhisperOutput reads the last JSON line and rejects garbage', () => {
  const out = parseWhisperOutput('warning\n{"load_s":2,"transcribe_s":7.9,"audio_s":60,"segments":[{"start":0.5,"end":2,"text":" Salut "}]}\n')
  assert.deepEqual(out.segments, [{ start: 0.5, end: 2, text: 'Salut' }])
  assert.equal(out.transcribeSec, 7.9)
  assert.throws(() => parseWhisperOutput('rien'), WhisperError)
  assert.throws(() => parseWhisperOutput('{"x":1}'), WhisperError)
})

function fakeChild(exit: { code: number, stdout?: string, stderr?: string }) {
  const child: any = new EventEmitter()
  child.pid = 99
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => {}
  setImmediate(() => {
    if (exit.stdout) child.stdout.emit('data', Buffer.from(exit.stdout))
    if (exit.stderr) child.stderr.emit('data', Buffer.from(exit.stderr))
    child.emit('close', exit.code)
  })
  return child
}

test('transcribeWav runs python at low priority with the model and parses the result', async () => {
  let seen: { cmd?: string, args?: string[], priority?: number } = {}
  const result = await transcribeWav('/tmp/w.wav', {
    python: 'py', script: '/s/transcribe.py', model: 'base',
    spawnFn: ((cmd: string, args: string[]) => {
      seen = { ...seen, cmd, args }
      return fakeChild({ code: 0, stdout: '{"audio_s":60,"transcribe_s":3,"segments":[]}\n' })
    }) as any,
    setPriorityFn: (_pid, priority) => { seen.priority = priority }
  })
  assert.deepEqual(seen.args, ['/s/transcribe.py', '/tmp/w.wav', 'base'])
  assert.ok(seen.priority! > 0)
  assert.equal(result.audioSec, 60)
})

test('transcribeWav explains failures and a missing python', async () => {
  await assert.rejects(
    transcribeWav('w', { spawnFn: (() => fakeChild({ code: 1, stderr: 'ModuleNotFoundError: faster_whisper' })) as any, setPriorityFn: () => {} }),
    (e: any) => e instanceof WhisperError && /faster_whisper/.test(e.message)
  )
  await assert.rejects(
    transcribeWav('w', { python: 'python-qui-n-existe-pas', setPriorityFn: () => {} }),
    (e: any) => e instanceof WhisperError && /introuvable/.test(e.message)
  )
})

test('audioWindowArgs seeks before the input and produces 16 kHz mono PCM', () => {
  assert.deepEqual(audioWindowArgs('https://x/a.m3u8', 990.7, 59.2, 'o.wav'), [
    '-ss', '990', '-t', '60', '-i', 'https://x/a.m3u8', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', 'o.wav'
  ])
})

test('parseAudioOnlyUrl finds the audio_only variant of a master playlist', () => {
  const master = [
    '#EXTM3U',
    '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="chunked",NAME="1080p60 (source)"',
    '#EXT-X-STREAM-INF:BANDWIDTH=8000000',
    'https://cdn.example/chunked/index-dvr.m3u8',
    '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="audio_only",NAME="audio_only"',
    '#EXT-X-STREAM-INF:BANDWIDTH=160000',
    'https://cdn.example/audio_only/index-dvr.m3u8'
  ].join('\n')
  assert.equal(parseAudioOnlyUrl(master), 'https://cdn.example/audio_only/index-dvr.m3u8')
  assert.equal(parseAudioOnlyUrl('#EXTM3U\n#EXT-X-MEDIA:GROUP-ID="chunked"\nhttps://a'), null)
})

function fetchSequence(...responses: Array<{ ok: boolean, status: number, body: string }>) {
  let i = 0
  return (async () => {
    const r = responses[i++]
    return { ok: r.ok, status: r.status, json: async () => JSON.parse(r.body), text: async () => r.body } as Response
  }) as unknown as typeof fetch
}

const token = { ok: true, status: 200, body: JSON.stringify({ data: { videoPlaybackAccessToken: { value: '{}', signature: 'sig' } } }) }

test('getVodAudioPlaylistUrl chains token and master playlist', async () => {
  const master = '#EXTM3U\n#EXT-X-MEDIA:GROUP-ID="audio_only"\n#EXT-X-STREAM-INF:X=1\nhttps://cdn.example/audio_only/index-dvr.m3u8'
  const url = await getVodAudioPlaylistUrl('1', fetchSequence(token, { ok: true, status: 200, body: master }))
  assert.equal(url, 'https://cdn.example/audio_only/index-dvr.m3u8')
})

test('getVodAudioPlaylistUrl reports restricted VODs and missing tokens explicitly', async () => {
  const restricted = { ok: false, status: 403, body: JSON.stringify([{ error: 'Manifest is restricted', error_code: 'vod_manifest_restricted', type: 'error' }]) }
  await assert.rejects(getVodAudioPlaylistUrl('1', fetchSequence(token, restricted)),
    (e: any) => e instanceof VodPlaylistError && e.kind === 'restricted')
  await assert.rejects(getVodAudioPlaylistUrl('1', fetchSequence({ ok: true, status: 200, body: '{"data":{"videoPlaybackAccessToken":null}}' })),
    (e: any) => e.kind === 'token')
  await assert.rejects(getVodAudioPlaylistUrl('1', fetchSequence({ ok: false, status: 500, body: '{}' })), (e: any) => e.kind === 'http')
})
