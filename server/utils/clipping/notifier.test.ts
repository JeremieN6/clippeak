import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBatchText, createDiscordNotifier, createTelegramNotifier, NotifierConfigError, notifiersFromEnv } from './notifier.ts'
import type { BatchNotification } from './notifier.ts'

const WEBHOOK = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJ-0123456789'
const TOKEN = '123456789:AAEhBP0av28LNjKxgsmjAbCdEfGhIjKlMnOpQ'

const notification = (count = 4): BatchNotification => ({
  batch: 3,
  studioUrl: 'https://example.test/studio',
  clips: Array.from({ length: count }, (_, i) => ({ id: `c${i}`, title: `Titre ${i + 1} @everyone`, caption: null, score: 8.2 - i, videoPath: `/data/clips/c${i}.mp4` }))
})

const fakeRead = (size = 1000) => async () => Buffer.alloc(size, 1)
const ok = (status = 200) => ({ ok: status < 400, status, json: async () => ({}) }) as Response

test('buildBatchText lists titles with their note, the studio link and the no-publication promise', () => {
  const text = buildBatchText(notification(2))
  assert.match(text, /^Lot 3 : 2 clips pret/)
  assert.match(text, /1\. Titre 1 @everyone \(note 8\.2\/10\)/)
  assert.match(text, /https:\/\/example\.test\/studio/)
  assert.match(text, /Rien n'est publie/)
  assert.ok(buildBatchText(notification(1)).startsWith('Lot 3 : 1 clip pret a valider'))
  assert.ok(buildBatchText({ ...notification(4), clips: Array.from({ length: 200 }, (_, i) => ({ id: String(i), title: 'x'.repeat(90), caption: null, score: 1, videoPath: 'p' })) }).length <= 1900)
})

test('discord notifier refuses any URL that is not a Discord webhook (no request to arbitrary hosts)', () => {
  for (const bad of ['', 'http://discord.com/api/webhooks/1/x', 'https://evil.example/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz', 'https://discord.com/api/webhooks/abc/def', `${WEBHOOK}/../../x`]) {
    assert.throws(() => createDiscordNotifier({ webhookUrl: bad }), NotifierConfigError)
  }
  assert.doesNotThrow(() => createDiscordNotifier({ webhookUrl: WEBHOOK }))
})

test('discord notifier sends one multipart message with the videos and suppresses all mentions', async () => {
  const calls: any[] = []
  const notifier = createDiscordNotifier({ webhookUrl: WEBHOOK, readFile: fakeRead(), fetchFn: (async (url: string, init: any) => { calls.push({ url, init }); return ok() }) as any })
  await notifier.send(notification(4))
  assert.equal(calls.length, 1)
  assert.ok(calls[0].url.startsWith(WEBHOOK))
  const form = calls[0].init.body as FormData
  const payload = JSON.parse(String(form.get('payload_json')))
  assert.deepEqual(payload.allowed_mentions, { parse: [] })
  assert.match(payload.content, /Lot 3/)
  assert.equal(payload.attachments.length, 4)
  assert.ok(form.get('files[3]'))
})

test('discord notifier falls back to text only when the videos are too big or unreadable', async () => {
  const calls: any[] = []
  const fetchFn = (async (_url: string, init: any) => { calls.push(init); return ok() }) as any
  await createDiscordNotifier({ webhookUrl: WEBHOOK, readFile: fakeRead(30 * 1024 * 1024), fetchFn }).send(notification(2))
  assert.equal(typeof calls[0].body, 'string')
  assert.deepEqual(JSON.parse(calls[0].body).allowed_mentions, { parse: [] })
  await createDiscordNotifier({ webhookUrl: WEBHOOK, readFile: async () => { throw new Error('absent') }, fetchFn }).send(notification(2))
  assert.equal(typeof calls[1].body, 'string')
})

test('discord notifier retries once on 429 and reports other failures without leaking the webhook', async () => {
  let n = 0
  const slept: number[] = []
  const retrying = createDiscordNotifier({
    webhookUrl: WEBHOOK, readFile: fakeRead(), sleep: async ms => { slept.push(ms) },
    fetchFn: (async () => (n++ === 0 ? ({ ok: false, status: 429, json: async () => ({ retry_after: 1.5 }) } as Response) : ok())) as any
  })
  await retrying.send(notification(1))
  assert.equal(n, 2)
  assert.deepEqual(slept, [1500])

  const failing = createDiscordNotifier({ webhookUrl: WEBHOOK, readFile: fakeRead(), fetchFn: (async () => ok(500)) as any })
  await assert.rejects(failing.send(notification(1)), (e: any) => /HTTP 500/.test(e.message) && !e.message.includes('webhooks'))
})

test('telegram notifier validates its settings, sends the text then each video, and never leaks the token', async () => {
  assert.throws(() => createTelegramNotifier({ token: 'pas-un-jeton', chatId: '123456' }), NotifierConfigError)
  assert.throws(() => createTelegramNotifier({ token: TOKEN, chatId: 'n importe quoi' }), NotifierConfigError)

  const calls: Array<{ url: string, init: any }> = []
  const notifier = createTelegramNotifier({ token: TOKEN, chatId: '-1001234567890', readFile: fakeRead(), fetchFn: (async (url: string, init: any) => { calls.push({ url, init }); return ok() }) as any })
  await notifier.send(notification(2))
  assert.deepEqual(calls.map(c => c.url.split('/').pop()), ['sendMessage', 'sendVideo', 'sendVideo'])
  assert.ok(calls.every(c => c.url.startsWith('https://api.telegram.org/bot')))
  assert.equal(JSON.parse(calls[0].init.body).chat_id, '-1001234567890')

  const failing = createTelegramNotifier({ token: TOKEN, chatId: '123456', fetchFn: (async () => { throw new Error(`boom ${TOKEN}`) }) as any })
  await assert.rejects(failing.send(notification(1)), (e: any) => !e.message.includes(TOKEN))
  const refused = createTelegramNotifier({ token: TOKEN, chatId: '123456', fetchFn: (async () => ok(401)) as any })
  await assert.rejects(refused.send(notification(1)), (e: any) => /HTTP 401/.test(e.message) && !e.message.includes(TOKEN))
})

test('notifiersFromEnv enables only configured channels and reports invalid values without printing them', () => {
  const env = (values: Record<string, string>) => (key: string) => values[key] ?? ''
  assert.deepEqual(notifiersFromEnv(env({})), { notifiers: [], problems: [] })
  const both = notifiersFromEnv(env({ DISCORD_WEBHOOK_URL: WEBHOOK, TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: '123456' }))
  assert.deepEqual(both.notifiers.map(n => n.name), ['discord', 'telegram'])
  const bad = notifiersFromEnv(env({ DISCORD_WEBHOOK_URL: 'https://evil.example/x', TELEGRAM_BOT_TOKEN: TOKEN }))
  assert.equal(bad.notifiers.length, 0)
  assert.equal(bad.problems.length, 2)
  assert.ok(bad.problems.every(p => !p.includes('evil') && !p.includes(TOKEN)))
})
