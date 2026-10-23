import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchVodChat, parseCommentsResponse, TwitchChatError } from './twitchChat.ts'

function edge(id: string, offset: number, texts: string[], cursor = `c-${id}`) {
  return {
    cursor,
    node: { id, contentOffsetSeconds: offset, message: { fragments: texts.map(text => ({ text })) } }
  }
}

function page(edges: any[], hasNextPage: boolean) {
  return [{ data: { video: { comments: { edges, pageInfo: { hasNextPage } } } } }]
}

function fakeFetch(responses: unknown[], calls: any[] = []) {
  let i = 0
  const fn = async (_url: any, init: any) => {
    calls.push(JSON.parse(init.body)[0])
    const body = responses[i++]
    return { ok: true, status: 200, json: async () => body } as Response
  }
  return fn as unknown as typeof fetch
}

test('parse joins fragments, skips empty messages, exposes paging info', () => {
  const result = parseCommentsResponse(page([
    edge('1', 10.5, ['MDR ', 'trop fort']),
    edge('2', 11, ['   ']),
    edge('3', 12, ['lol'], 'last')
  ], true))
  assert.deepEqual(result.messages, [{ t: 10.5, text: 'MDR trop fort' }, { t: 12, text: 'lol' }])
  assert.equal(result.hasNextPage, true)
  assert.equal(result.lastOffsetSec, 12)
})

test('parse reports the last page', () => {
  assert.equal(parseCommentsResponse(page([edge('1', 1, ['a'])], false)).hasNextPage, false)
})

test('parse raises explicit errors', () => {
  assert.throws(() => parseCommentsResponse([{ errors: [{ message: 'PersistedQueryNotFound' }] }]),
    (e: any) => e instanceof TwitchChatError && e.kind === 'graphql' && /PersistedQueryNotFound/.test(e.message))
  assert.throws(() => parseCommentsResponse([{ data: { video: null } }]),
    (e: any) => e.kind === 'graphql' && /introuvable/.test(e.message))
  assert.throws(() => parseCommentsResponse([{ data: { video: { comments: {} } } }]),
    (e: any) => e.kind === 'shape')
  assert.throws(() => parseCommentsResponse(null), (e: any) => e.kind === 'shape')
})

test('fetchVodChat pages by offset (cursors need an integrity token), dedupes and reports last offset', async () => {
  const calls: any[] = []
  const f = fakeFetch([
    page([edge('1', 5, ['mdr']), edge('2', 8, ['ptdr'])], true),
    page([edge('2', 8, ['ptdr']), edge('3', 20, ['OMG'])], false)
  ], calls)
  const result = await fetchVodChat('123', { fetchFn: f })
  assert.equal(result.messages.length, 3)
  assert.equal(result.pages, 2)
  assert.equal(result.lastOffsetSec, 20)
  assert.deepEqual(calls[0].variables, { videoID: '123', contentOffsetSeconds: 3 })
  assert.deepEqual(calls[1].variables, { videoID: '123', contentOffsetSeconds: 8 })
})

test('fetchVodChat moves forward one second when a page brings nothing new', async () => {
  const calls: any[] = []
  const f = fakeFetch([
    page([edge('1', 5, ['a'])], true),
    page([edge('1', 5, ['a'])], true),
    page([edge('2', 7, ['b'])], false)
  ], calls)
  const result = await fetchVodChat('1', { fetchFn: f })
  assert.equal(result.messages.length, 2)
  assert.deepEqual(calls.map(c => c.variables.contentOffsetSeconds), [3, 5, 6])
})

test('parse accepts the real response shape (extra fields, anonymised)', () => {
  const real = [{
    data: {
      video: {
        id: '1',
        creator: { id: '2', channel: { id: '2', __typename: 'Channel' }, __typename: 'User' },
        comments: {
          edges: [{
            cursor: 'eyJ...',
            node: {
              id: 'aaaa-bbbb',
              commenter: null,
              contentOffsetSeconds: 12,
              createdAt: '2026-01-01T00:00:00Z',
              message: { fragments: [{ text: 'mdr ', emote: null }, { text: 'KEKW', emote: { emoteID: '1' } }], userNoticeParams: [], __typename: 'CommentMessage' },
              __typename: 'Comment'
            },
            __typename: 'VideoCommentEdge'
          }],
          pageInfo: { hasNextPage: true, hasPreviousPage: false, __typename: 'PageInfo' },
          __typename: 'VideoCommentConnection'
        },
        __typename: 'Video'
      }
    },
    extensions: { durationMilliseconds: 30, operationName: 'VideoCommentsByOffsetOrCursor' }
  }]
  const parsed = parseCommentsResponse(real)
  assert.deepEqual(parsed.messages, [{ t: 12, text: 'mdr KEKW' }])
  assert.equal(parsed.hasNextPage, true)
})

test('parse surfaces the integrity error Twitch returns for cursor requests', () => {
  assert.throws(() => parseCommentsResponse([{ errors: [{ message: 'failed integrity check', extensions: { code: 'IntegrityCheckFailed' } }] }]),
    (e: any) => e.kind === 'graphql' && /integrity/.test(e.message))
})

test('fetchVodChat can resume from an offset for incremental live analysis', async () => {
  const calls: any[] = []
  await fetchVodChat('9', { fetchFn: fakeFetch([page([edge('1', 700, ['lol'])], false)], calls), startOffsetSec: 700 })
  assert.deepEqual(calls[0].variables, { videoID: '9', contentOffsetSeconds: 700 })
})

test('fetchVodChat surfaces HTTP failures and the page limit', async () => {
  const failing = (async () => ({ ok: false, status: 429, json: async () => ({}) })) as unknown as typeof fetch
  await assert.rejects(fetchVodChat('1', { fetchFn: failing }), (e: any) => e.kind === 'http' && /429/.test(e.message))

  const endless = fakeFetch(Array.from({ length: 5 }, (_, i) => page([edge(String(i), i, ['x'])], true)))
  await assert.rejects(fetchVodChat('1', { fetchFn: endless, maxPages: 3 }), (e: any) => e.kind === 'limit')
})
