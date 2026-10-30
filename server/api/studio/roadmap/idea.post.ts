import { z } from 'zod'
import { prisma } from '../../../utils/prisma'
import { requireStudioActor } from '../../../utils/studioAuth'
import { voterChannel } from '../../../utils/roadmapChannel'
import { IDEAS_PER_DAY } from '../../../utils/clipping/roadmap'

const schema = z.object({ text: z.string().trim().min(5, 'Décris ton idée en quelques mots.').max(500, '500 caractères au maximum.'), channelId: z.string().optional() })

// « Propose une idee » : lue par l'admin, qui s'en sert pour les prochains blocs. 5 idees par chaine et par jour.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Idée invalide' })
  const channelId = await voterChannel(actor, parsed.data.channelId)
  const today = await prisma.roadmapIdea.count({ where: { channelId, createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } })
  if (today >= IDEAS_PER_DAY) throw createError({ statusCode: 429, statusMessage: 'Tu as déjà proposé plusieurs idées aujourd’hui. Reviens demain !' })
  await prisma.roadmapIdea.create({ data: { channelId, text: parsed.data.text } })
  return { ok: true }
})
