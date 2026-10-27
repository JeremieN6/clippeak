import { requireStudioAdmin } from '../../../utils/studioAuth'
import { ensureDemoChannel } from '../../../utils/demoChannel'

// Chaine de demonstration (creee au premier appel) : l'admin y essaie le studio sans toucher a un vrai compte.
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  return { channel: await ensureDemoChannel() }
})
