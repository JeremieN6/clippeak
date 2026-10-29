import { z } from 'zod'
import { requireStudioAdmin } from '../../utils/studioAuth'
import { createTestChannel } from '../../utils/demoChannel'

const schema = z.object({ name: z.string().trim().min(2).max(60) })

// Cree une chaine de test (un ami, un essai) : studio, photos et reglages separes, VODs ajoutees a la main analysees, rien d'ecoute.
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Nom invalide (2 a 60 caracteres)' })
  const channel = await createTestChannel(parsed.data.name)
  if (channel === null) throw createError({ statusCode: 400, statusMessage: 'Le nom doit contenir des lettres ou des chiffres' })
  if (channel === 'duplicate') throw createError({ statusCode: 409, statusMessage: 'Une chaîne de test porte déjà ce nom' })
  return { channel }
})
