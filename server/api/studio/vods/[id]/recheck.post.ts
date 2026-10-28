import { prisma } from '../../../../utils/prisma'
import { readEnv } from '../../../../utils/env'
import { assertChannel, parseId, requireStudioActor } from '../../../../utils/studioAuth'
import { checkVodReadable } from '../../../../utils/clipping/vodAccess'

const lastCheck = new Map<string, number>()
const cooldownMs = () => { const v = Number(readEnv('CLIPPEAK_RECHECK_COOLDOWN_MS')); return Number.isFinite(v) && readEnv('CLIPPEAK_RECHECK_COOLDOWN_MS') !== '' ? Math.max(0, v) : 15_000 }

// « C'est fait, vérifier maintenant » : le streamer vient de rendre sa VOD publique, on revérifie tout de suite au lieu d'attendre
// le passage du worker (toutes les 3 minutes). Une vérification par VOD toutes les 15 secondes au plus.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  const vod = await prisma.vod.findUnique({ where: { id }, select: { channelId: true, status: true, twitchVodId: true } })
  if (!vod) throw createError({ statusCode: 404, statusMessage: 'VOD introuvable' })
  assertChannel(actor, vod.channelId)
  if (vod.status !== 'blocked') return { state: 'readable' as const }

  if (Date.now() - (lastCheck.get(id) ?? 0) < cooldownMs()) return { state: 'restricted' as const }
  lastCheck.set(id, Date.now())

  const access = await checkVodReadable(vod.twitchVodId, fetch, { gql: readEnv('TWITCH_GQL_URL') || undefined, usher: readEnv('TWITCH_USHER_URL') || undefined })
  if (access.state === 'unknown') throw createError({ statusCode: 502, statusMessage: 'Impossible de vérifier pour le moment, Clippeak réessaie tout seul toutes les 3 minutes.' })
  if (access.state === 'restricted') return { state: 'restricted' as const }
  await prisma.vod.updateMany({ where: { id, status: 'blocked' }, data: { status: 'ended', error: null } })
  return { state: 'readable' as const }
})
