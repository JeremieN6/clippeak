import { z } from 'zod'
import { prisma } from '../../../utils/prisma'
import { requireStudioAdmin } from '../../../utils/studioAuth'

const schema = z.object({ title: z.string().trim().min(3).max(80), description: z.string().trim().min(5).max(400) })

// Ajoute une fonction a la liste (elle pourra entrer dans un prochain bloc de vote).
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Titre (3 à 80 caractères) et description (5 à 400) requis.' })
  const slug = `${parsed.data.title.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)}-${Date.now().toString(36)}`
  const f = await prisma.roadmapFeature.create({ data: { slug, title: parsed.data.title, description: parsed.data.description } })
  return { id: f.id }
})
