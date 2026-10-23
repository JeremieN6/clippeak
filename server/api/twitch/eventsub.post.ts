import { readEnv } from '../../utils/env'
import { createSeenMessages, verifyEventSubSignature } from '../../utils/clipping/eventsub'
import { createTwitchApi } from '../../utils/clipping/twitchApi'
import { handleStreamOffline, handleStreamOnline } from '../../utils/clipping/vodSync'
import { prismaVodStore } from '../../utils/clipping/prismaVodStore'

const seen = createSeenMessages()

export default defineEventHandler(async (event) => {
  const secret = readEnv('TWITCH_EVENTSUB_SECRET')
  const rawBody = (await readRawBody(event, 'utf8')) ?? ''
  const id = getHeader(event, 'twitch-eventsub-message-id')
  const messageType = getHeader(event, 'twitch-eventsub-message-type')

  const valid = verifyEventSubSignature({
    secret,
    id,
    timestamp: getHeader(event, 'twitch-eventsub-message-timestamp'),
    signature: getHeader(event, 'twitch-eventsub-message-signature'),
    rawBody
  })
  if (!valid) throw createError({ statusCode: 403, statusMessage: 'Signature invalide' })

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Corps invalide' })
  }

  if (messageType === 'webhook_callback_verification') {
    setHeader(event, 'content-type', 'text/plain')
    return String(payload.challenge ?? '')
  }

  if (messageType === 'revocation') {
    console.warn('[twitch] abonnement revoque', payload?.subscription?.type, payload?.subscription?.status)
    setResponseStatus(event, 204)
    return null
  }

  if (messageType !== 'notification' || !id || seen.check(id)) {
    setResponseStatus(event, 204)
    return null
  }

  const clientId = readEnv('TWITCH_CLIENT_ID')
  const clientSecret = readEnv('TWITCH_CLIENT_SECRET')
  const deps = { api: createTwitchApi({ clientId, clientSecret }), store: prismaVodStore }
  const type = payload?.subscription?.type

  // Twitch exige une reponse en quelques secondes : le travail se poursuit en arriere-plan.
  const work = type === 'stream.online'
    ? handleStreamOnline(payload.event, deps)
    : type === 'stream.offline'
      ? handleStreamOffline(payload.event, deps)
      : Promise.resolve('ignored')
  void work
    .then(outcome => console.info('[twitch]', type, outcome))
    .catch(error => console.error('[twitch] echec', type, error))

  setResponseStatus(event, 204)
  return null
})
