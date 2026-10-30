import { readEnv } from '../../../utils/env'
import { requireStudioAdmin } from '../../../utils/studioAuth'
import { createTwitchApi, TwitchApiError } from '../../../utils/clipping/twitchApi'
import { prisma } from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)

  const body = await readBody<{ login?: unknown }>(event)
  const login = typeof body?.login === 'string' ? body.login.trim().toLowerCase() : ''
  if (!/^[a-z0-9_]{3,25}$/.test(login)) {
    throw createError({ statusCode: 400, statusMessage: 'Pseudo Twitch invalide' })
  }

  const clientId = readEnv('TWITCH_CLIENT_ID')
  const clientSecret = readEnv('TWITCH_CLIENT_SECRET')
  const secret = readEnv('TWITCH_EVENTSUB_SECRET')
  const callback = readEnv('TWITCH_EVENTSUB_CALLBACK_URL')
  const missing = Object.entries({
    TWITCH_CLIENT_ID: clientId,
    TWITCH_CLIENT_SECRET: clientSecret,
    TWITCH_EVENTSUB_SECRET: secret,
    TWITCH_EVENTSUB_CALLBACK_URL: callback
  }).filter(([, value]) => !value).map(([key]) => key)
  if (missing.length) {
    throw createError({ statusCode: 500, statusMessage: `Variables manquantes : ${missing.join(', ')}` })
  }

  try {
    const api = createTwitchApi({ clientId, clientSecret })
    const user = await api.getUserByLogin(login)
    if (!user) throw createError({ statusCode: 404, statusMessage: 'Streamer introuvable sur Twitch' })

    const channel = await prisma.channel.upsert({
      where: { twitchId: user.id },
      update: { login: user.login, displayName: user.displayName },
      create: {
        twitchId: user.id,
        login: user.login,
        displayName: user.displayName,
        settings: { create: {} }
      }
    })

    const online = await api.subscribe('stream.online', user.id, callback, secret)
    const offline = await api.subscribe('stream.offline', user.id, callback, secret)
    return { channelId: channel.id, login: user.login, subscriptions: { online, offline } }
  } catch (error) {
    if (error instanceof TwitchApiError) {
      throw createError({ statusCode: 502, statusMessage: error.message })
    }
    throw error
  }
})
