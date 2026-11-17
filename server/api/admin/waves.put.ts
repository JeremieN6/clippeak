import { z } from 'zod'
import { prisma } from '../../utils/prisma'
import { requireStudioAdmin } from '../../utils/studioAuth'
import { loadInvitationConfig, openSlotsTaken } from '../../utils/clipping/prismaWaves'
import { openUntilAfterAdd } from '../../utils/clipping/batchHealth'

const schema = z.object({
  wavesEnabled: z.boolean().optional(),
  dailyCap: z.number().int().min(0).max(500).optional(),
  referralBonusCap: z.number().int().min(0).max(5).optional(),
  openUntil: z.number().int().min(0).max(500).optional(),
  // « +N places » : s'ajoute aux places libres (le serveur calcule le total, on n'a jamais a le retenir).
  openAdd: z.number().int().min(1).max(500).optional(),
  autoOpenBatch: z.number().int().min(0).max(100).optional()
}).strict()

// Regle les vagues : actives ou non, plafond d'invitations par jour (0 a 500), plafond mensuel de clips bonus de parrainage (0 a 500).
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Reglage invalide : des nombres entiers de 0 a 500.' })
  const { openAdd, ...data } = parsed.data
  if (openAdd) {
    const current = await loadInvitationConfig(prisma)
    Object.assign(data, { openUntil: openUntilAfterAdd(current.openUntil, await openSlotsTaken(prisma), openAdd) })
  }
  await prisma.invitationSettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } })
  return loadInvitationConfig(prisma)
})
