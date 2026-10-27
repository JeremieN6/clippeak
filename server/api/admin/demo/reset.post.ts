import { requireStudioAdmin } from '../../../utils/studioAuth'
import { resetDemoChannel } from '../../../utils/demoChannel'

// Remet la chaine de demonstration a zero : l'admin peut refaire le parcours d'un nouveau streamer.
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  return { channel: await resetDemoChannel() }
})
