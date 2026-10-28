import test from 'node:test'
import assert from 'node:assert/strict'
import { parseTwitchVodId } from './vodUrl.ts'
import { createTwitchApi } from './twitchApi.ts'

test('parseTwitchVodId accepts VOD links and bare ids, nothing else', () => {
  for (const ok of [
    'https://www.twitch.tv/videos/2908665744',
    'http://twitch.tv/videos/2908665744?t=1h2m3s',
    'twitch.tv/videos/2908665744',
    'https://m.twitch.tv/videos/2908665744/',
    'https://www.twitch.tv/jeremfut7/v/2908665744',
    '  2908665744  '
  ]) assert.equal(parseTwitchVodId(ok), '2908665744', ok)
  for (const bad of [
    '', 'abc', '123', 'https://www.twitch.tv/jeremfut7', 'https://www.twitch.tv/videos/abc', 'https://www.twitch.tv/videos/2908665744/../x',
    'https://evil.example/videos/2908665744', 'https://twitch.tv.evil.example/videos/2908665744', 'https://www.youtube.com/watch?v=2908665744',
    'https://www.twitch.tv/clip/AbCdEf', 'javascript:alert(1)', '2908665744; DROP TABLE vods'
  ]) assert.equal(parseTwitchVodId(bad), null, bad)
})

test('getVideoById reads owner, type and visibility, and uses the replacement addresses', async () => {
  const seen: string[] = []
  const fetchFn = (async (url: any) => {
    const u = String(url)
    seen.push(u)
    if (u.endsWith('/oauth2/token')) return Response.json({ access_token: 't', expires_in: 3600 })
    if (u.includes('/helix/videos?id=111')) {
      return Response.json({ data: [{ id: '111', stream_id: '9', user_login: 'ami', user_name: 'Ami', url: 'https://www.twitch.tv/videos/111', title: 'Un live', created_at: '2026-10-20T18:00:00Z', duration: '2h3m4s', type: 'archive', viewable: 'public' }] })
    }
    return Response.json({ data: [] })
  }) as typeof fetch
  const api = createTwitchApi({ clientId: 'a', clientSecret: 'b', idBase: 'http://fake-id', apiBase: 'http://fake-api/' }, fetchFn)
  const video = await api.getVideoById('111')
  assert.equal(video?.userName, 'Ami')
  assert.equal(video?.type, 'archive')
  assert.equal(video?.viewable, 'public')
  assert.equal(video?.durationSec, 2 * 3600 + 3 * 60 + 4)
  assert.equal(await api.getVideoById('999'), null)
  assert.ok(seen[0].startsWith('http://fake-id/oauth2/token') && seen[1].startsWith('http://fake-api/helix/videos'))
})
