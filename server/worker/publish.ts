import { readEnv } from '../utils/env'
import { prisma } from '../utils/prisma'
import { retrying } from '../utils/clipping/dbRetry'
import { decryptToken, encryptToken, parseKey } from '../utils/clipping/tokenVault'
import { createPrismaPublishStore } from '../utils/clipping/prismaPublishStore'
import { runPublishOnce } from '../utils/clipping/publishQueue'
import { createYoutubePublisher } from '../utils/clipping/youtubePublisher'
import type { Publisher, PublishPlatform } from '../utils/clipping/publishing'
import type { PublishStore } from '../utils/clipping/publishQueue'

let ready: { store: PublishStore, publishers: Partial<Record<PublishPlatform, Publisher>> } | null | undefined

function setup() {
  if (ready !== undefined) return ready
  const clientId = readEnv('GOOGLE_CLIENT_ID')
  const clientSecret = readEnv('GOOGLE_CLIENT_SECRET')
  let key: Buffer
  try {
    key = parseKey(readEnv('CLIPPEAK_TOKEN_KEY'))
  } catch {
    console.info('[worker] publication desactivee (CLIPPEAK_TOKEN_KEY absente) : aucun compte de plateforme ne peut etre connecte')
    return (ready = null)
  }
  if (!clientId || !clientSecret) {
    console.info('[worker] publication YouTube desactivee (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET absents)')
    return (ready = null)
  }
  const inner = createPrismaPublishStore(prisma, { decrypt: stored => decryptToken(stored, key) })
  // Le jeton d'acces renouvele est chiffre avant d'etre range en base.
  const store: PublishStore = { ...inner, saveAccessToken: (id, token) => inner.saveAccessToken(id, { ...token, value: encryptToken(token.value, key) }) }
  ready = {
    store: retrying(store, { onRetry: (error, attempt) => console.warn(`[worker] base injoignable (tentative ${attempt}), nouvel essai`) }),
    publishers: { youtube: createYoutubePublisher({ clientId, clientSecret }) }
  }
  return ready
}

let recovered = false

// Publie UNE publication dont l'heure est venue (si le streamer en a programme une). Sans configuration : aucune requete.
export async function publishStep(): Promise<boolean> {
  const env = setup()
  if (!env) return false
  if (!recovered) {
    recovered = true
    const interrupted = await env.store.requeueInterrupted()
    if (interrupted) console.warn(`[worker] ${interrupted} publication(s) interrompue(s) marquee(s) en echec : a verifier par le streamer`)
  }
  return runPublishOnce({ store: env.store, publishers: env.publishers, log: message => console.info('[worker]', message) })
}
