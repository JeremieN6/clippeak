import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAuthorizeUrl, exchangeCode, fetchIdentity, hashToken, newToken, normalizeLogin, TwitchLoginError } from './twitchLogin.ts'

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json })
const ko = (status: number) => ({ ok: false, status, json: async () => ({}) })

test('authorize URL asks for no scope and carries the state', () => {
  const url = new URL(buildAuthorizeUrl({ clientId: 'cid', redirectUri: 'https://x.test/cb', state: 's1' }))
  assert.equal(url.origin + url.pathname, 'https://id.twitch.tv/oauth2/authorize')
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('state'), 's1')
  assert.equal(url.searchParams.get('redirect_uri'), 'https://x.test/cb')
  assert.equal(url.searchParams.has('scope'), false)
})

test('code exchange posts the secret in the body and returns only the access token', async () => {
  let seen: { url: string, body: string } | null = null
  const token = await exchangeCode(async (url, init) => { seen = { url, body: String(init?.body) }; return ok({ access_token: 'tok', refresh_token: 'r' }) }, { clientId: 'cid', clientSecret: 'sec', code: 'c', redirectUri: 'https://x.test/cb' })
  assert.equal(token, 'tok')
  assert.equal(seen!.url, 'https://id.twitch.tv/oauth2/token')
  assert.ok(seen!.body.includes('grant_type=authorization_code') && seen!.body.includes('code=c'))
  await assert.rejects(exchangeCode(async () => ko(400), { clientId: 'a', clientSecret: 'b', code: 'c', redirectUri: 'd' }), TwitchLoginError)
  await assert.rejects(exchangeCode(async () => ok({}), { clientId: 'a', clientSecret: 'b', code: 'c', redirectUri: 'd' }), TwitchLoginError)
})

test('identity is read with the user token, login lower-cased, errors typed', async () => {
  const id = await fetchIdentity(async (url, init) => {
    assert.equal(url, 'https://api.twitch.tv/helix/users')
    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer tok')
    return ok({ data: [{ id: '42', login: 'JeremFut7', display_name: 'JeremFut7' }] })
  }, { clientId: 'cid', accessToken: 'tok' })
  assert.deepEqual(id, { id: '42', login: 'jeremfut7', displayName: 'JeremFut7' })
  await assert.rejects(fetchIdentity(async () => ko(401), { clientId: 'a', accessToken: 'b' }), TwitchLoginError)
  await assert.rejects(fetchIdentity(async () => ok({ data: [] }), { clientId: 'a', accessToken: 'b' }), TwitchLoginError)
})

test('login normalisation and session tokens', () => {
  assert.equal(normalizeLogin('  @JeremFut7 '), 'jeremfut7')
  assert.equal(normalizeLogin('ab'), null)
  assert.equal(normalizeLogin('a b c'), null)
  assert.equal(normalizeLogin(12), null)
  const a = newToken()
  assert.notEqual(a, newToken())
  assert.ok(a.length >= 43)
  assert.equal(hashToken(a).length, 64)
  assert.equal(hashToken(a), hashToken(a))
  assert.notEqual(hashToken(a), a)
})
