import { readEnv } from '../utils/env'
import { createTwitchApi } from '../utils/clipping/twitchApi'
import { runVodCatchup } from '../utils/clipping/vodCatchup'
import { prismaCatchupStore } from '../utils/clipping/prismaCatchupStore'

const DEFAULT_INTERVAL_SEC = 300
const STARTUP_DELAY_MS = 30_000

// Filet de securite des notifications EventSub : actif en production (ou avec TWITCH_CATCHUP=1 en local).
export default defineNitroPlugin((nitro) => {
  if (process.env.NODE_ENV !== 'production' && readEnv('TWITCH_CATCHUP') !== '1') return

  const clientId = readEnv('TWITCH_CLIENT_ID')
  const clientSecret = readEnv('TWITCH_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    console.warn('[twitch] rattrapage desactive : TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET manquants')
    return
  }

  const configured = Number(readEnv('TWITCH_CATCHUP_INTERVAL_SEC'))
  const intervalMs = (Number.isFinite(configured) && configured >= 60 ? configured : DEFAULT_INTERVAL_SEC) * 1000
  const api = createTwitchApi({ clientId, clientSecret })
  let running = false

  async function tick() {
    if (running) return
    running = true
    try {
      const summary = await runVodCatchup({ api, store: prismaCatchupStore })
      if (summary.registered || summary.closed || summary.errors) console.info('[twitch] rattrapage', summary)
    } catch (error) {
      console.error('[twitch] rattrapage en echec', error)
    } finally {
      running = false
    }
  }

  const first = setTimeout(tick, STARTUP_DELAY_MS)
  const timer = setInterval(tick, intervalMs)
  nitro.hooks.hook('close', () => {
    clearTimeout(first)
    clearInterval(timer)
  })
  console.info(`[twitch] rattrapage actif toutes les ${intervalMs / 1000} s`)
})
