import { requireStudioAdmin } from '../../utils/studioAuth'

// Sert a /admin pour savoir si la session admin est encore valide (401 sinon).
export default defineEventHandler((event) => {
  requireStudioAdmin(event)
  return { admin: true }
})
