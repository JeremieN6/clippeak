import { z } from 'zod'
import { prisma } from '../../../../utils/prisma'
import { assertChannel, parseId, requireStudioActor } from '../../../../utils/studioAuth'
import { INSTAGRAM_CAPTION_MAX, MAX_SCHEDULE_DAYS, PUBLISH_PLATFORMS, TIKTOK_PRIVACY_LEVELS } from '../../../../utils/clipping/publishing'
import { instagramConfig, tiktokConfig } from '../../../../utils/publishConfig'
import { isDemoTwitchId, isTestTwitchId } from '../../../../utils/demoChannel'
import { tiktokAccessFor } from '../../../../utils/tiktokAccess'
import { checkPostOptions, queryCreatorInfo } from '../../../../utils/clipping/tiktokApi'

// Reglages TikTok : la visibilite n'a pas de valeur par defaut (regle de TikTok), et `consent` doit etre vrai : le streamer a coche
// la phrase d'accord avant de publier.
const tiktokSchema = z.object({
  title: z.string().trim().min(1).max(2200),
  privacyLevel: z.enum(TIKTOK_PRIVACY_LEVELS),
  disableComment: z.boolean(),
  disableDuet: z.boolean(),
  disableStitch: z.boolean(),
  brandOrganic: z.boolean(),
  brandContent: z.boolean(),
  consent: z.literal(true)
})
// Reglages Instagram : la legende (modifiable) et `consent`, vrai seulement si le streamer a clique sur « Publier sur Instagram ».
const instagramSchema = z.object({ caption: z.string().trim().max(INSTAGRAM_CAPTION_MAX), consent: z.literal(true) })
const bodySchema = z.object({ platform: z.enum(PUBLISH_PLATFORMS), at: z.string().datetime({ offset: true }).optional(), options: z.unknown().optional() })

// Programme (ou lance) la publication d'un clip APPROUVE sur une plateforme connectee. C'est la seule porte d'entree de la
// publication : une action explicite du streamer, jamais deduite de l'approbation. Sans heure : maintenant.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Plateforme ou heure invalide' })
  const { platform } = parsed.data

  const job = await prisma.clipJob.findUnique({ where: { id }, select: { status: true, format: true, outputPath: true, moment: { select: { vod: { select: { channelId: true } } } } } })
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Clip introuvable' })
  const channelId = job.moment.vod.channelId
  assertChannel(actor, channelId)
  if (job.status !== 'approved') throw createError({ statusCode: 409, statusMessage: 'Approuve d’abord le clip pour pouvoir le publier' })
  if (!job.outputPath) throw createError({ statusCode: 409, statusMessage: 'Ce clip n’a pas de vidéo à publier' })
  if (job.format === 'long' && platform !== 'youtube') throw createError({ statusCode: 400, statusMessage: 'Les extraits longs se publient seulement sur YouTube.' })
  const connection = await prisma.platformConnection.findUnique({ where: { channelId_platform: { channelId, platform } }, select: { id: true, externalId: true, expiresAt: true } })
  if (!connection) throw createError({ statusCode: 409, statusMessage: 'Connecte d’abord ton compte à cette plateforme' })

  // TikTok : pas de programmation (le streamer valide chaque publication sur l'ecran de TikTok) ; ses choix sont controles contre ce que
  // son compte permet, puis gardes avec la publication. `consent` n'est pas conserve.
  let options: Record<string, unknown> | undefined
  if (platform === 'tiktok') {
    if (parsed.data.at) throw createError({ statusCode: 400, statusMessage: 'TikTok : la publication part tout de suite, sans programmation.' })
    const chosen = tiktokSchema.safeParse(parsed.data.options)
    if (!chosen.success) throw createError({ statusCode: 400, statusMessage: 'Complète les réglages TikTok (visibilité, interactions) et coche l’accord avant de publier.' })
    const { consent: _consent, ...tiktokOptions } = chosen.data
    const config = tiktokConfig(event)
    const access = config.configured ? await tiktokAccessFor(event, channelId) : null
    if (!access) throw createError({ statusCode: 409, statusMessage: 'Compte TikTok non connecté ou accès expiré : reconnecte-le.' })
    const creator = await queryCreatorInfo(fetch, access, config.apiBase).catch(() => null)
    if (!creator) throw createError({ statusCode: 503, statusMessage: 'TikTok ne répond pas pour le moment. Réessaie dans quelques minutes.' })
    const problem = checkPostOptions(tiktokOptions, creator, null)
    if (problem) throw createError({ statusCode: 400, statusMessage: problem })
    options = tiktokOptions
  }

  // Instagram : pas de programmation (la publication part sur clic), jamais pour une chaine de test ou de demonstration, compte et acces
  // valides. Seule la legende est choisie ; elle part avec la publication.
  if (platform === 'instagram') {
    if (parsed.data.at) throw createError({ statusCode: 400, statusMessage: 'Instagram : la publication part tout de suite, sans programmation.' })
    const chosen = instagramSchema.safeParse(parsed.data.options)
    if (!chosen.success) throw createError({ statusCode: 400, statusMessage: 'Vérifie la légende (2 200 caractères au plus) et clique sur « Publier sur Instagram ».' })
    const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { twitchId: true } })
    if (!channel || isDemoTwitchId(channel.twitchId) || isTestTwitchId(channel.twitchId)) throw createError({ statusCode: 403, statusMessage: 'Les chaînes de test et de démonstration ne publient jamais sur Instagram.' })
    if (!instagramConfig(event).configured) throw createError({ statusCode: 409, statusMessage: 'La publication Instagram n’est pas encore activée.' })
    if (!connection.externalId || !connection.expiresAt || connection.expiresAt.getTime() <= Date.now()) throw createError({ statusCode: 409, statusMessage: 'Accès Instagram expiré : reconnecte ton compte.' })
    options = { caption: chosen.data.caption }
  }

  const now = Date.now()
  const requested = parsed.data.at ? new Date(parsed.data.at).getTime() : now
  if (requested > now + MAX_SCHEDULE_DAYS * 24 * 3600 * 1000) throw createError({ statusCode: 400, statusMessage: `Programme dans les ${MAX_SCHEDULE_DAYS} jours qui viennent` })
  const scheduledAt = new Date(Math.max(requested, now))

  const existing = await prisma.publication.findUnique({ where: { clipJobId_platform: { clipJobId: id, platform } }, select: { id: true, status: true } })
  if (existing && (existing.status === 'publishing' || existing.status === 'published')) {
    throw createError({ statusCode: 409, statusMessage: existing.status === 'published' ? 'Ce clip est déjà publié sur cette plateforme' : 'Ce clip est en cours de publication' })
  }
  const publication = existing
    ? await prisma.publication.update({ where: { id: existing.id }, data: { status: 'scheduled', scheduledAt, attempts: 0, error: null, ...(options ? { options } : {}) } })
    : await prisma.publication.create({ data: { clipJobId: id, platform, scheduledAt, ...(options ? { options } : {}) } })
  return { id: publication.id, status: publication.status, scheduledAt: publication.scheduledAt }
})
