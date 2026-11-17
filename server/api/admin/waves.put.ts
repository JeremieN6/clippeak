import { z } from 'zod'
import { prisma } from '../../utils/prisma'
import { requireStudioAdmin } from '../../utils/studioAuth'
import { loadInvitationConfig } from '../../utils/clipping/prismaWaves'

const schema = z.object({
  wavesEnabled: z.boolean().optional(),
  dailyCap: z.number().int().min(0).max(500).optional(),
  referralBonusCap: z.number().int().min(0).max(5).optional(),
  openUntil: z.number().int().min(0).max(500).optional()
}).strict()

// Regle les vagues : actives ou non, plafond d'invitations par jour (0 a 500), plafond mensuel de clips bonus de parrainage (0 a 500).
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Reglage invalide : des nombres entiers de 0 a 500.' })
  await prisma.invitationSettings.upsert({ where: { id: 1 }, update: parsed.data, create: { id: 1, ...parsed.data } })
  return loadInvitationConfig(prisma)
})
