import { z } from 'zod'
import { prisma } from '../utils/prisma'

const feedbackSchema = z.object({
  version: z.string().default('v1'),
  zipParMail: z.boolean(),
  outilAutomatise: z.enum(['oui', 'non', 'peut-etre']),
  plateformeReception: z.enum(['discord', 'telegram', 'mail', 'autre']),
  plateformeAutre: z.string().trim().max(120).optional().nullable(),
  vodsParMois: z.enum(['1-2', '3-5', '6-10', '10+']),
  profil: z.enum(['streamer', 'clippeur', 'les deux']),
  manque: z.string().trim().max(2000).optional().nullable(),
  email: z.string().email().optional().nullable()
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = feedbackSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Le formulaire contient des champs invalides.'
    })
  }

  const payload = parsed.data

  const feedback = await prisma.feedback.create({
    data: {
      version: payload.version,
      zipParMail: payload.zipParMail,
      outilAutomatise: payload.outilAutomatise === 'peut-etre' ? 'peut_etre' : payload.outilAutomatise,
      plateformeReception: payload.plateformeReception,
      plateformeAutre: payload.plateformeAutre || null,
      vodsParMois: payload.vodsParMois,
      profil: payload.profil,
      manque: payload.manque || null,
      email: payload.email || null
    }
  })

  return {
    ok: true,
    id: feedback.id
  }
})
