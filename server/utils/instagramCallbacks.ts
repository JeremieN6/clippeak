import type { H3Event } from 'h3'
import { prisma } from './prisma'
import { readEnv } from './env'
import { parseInstagramSignedRequest } from './clipping/instagramApi'

// Lit le `signed_request` envoye par Meta (corps formulaire) et renvoie l'identifiant du compte Instagram, ou null si la signature est fausse.
export async function instagramUserFromSignedRequest(event: H3Event): Promise<string | null> {
  const body = await readBody(event).catch(() => null) as Record<string, unknown> | null
  const signed = typeof body?.signed_request === 'string' ? body.signed_request : ''
  const payload = signed ? parseInstagramSignedRequest(signed, readEnv('INSTAGRAM_APP_SECRET')) : null
  return payload?.user_id != null ? String(payload.user_id) : null
}

// Efface la connexion Instagram de ce compte et annule ses publications encore programmees. Renvoie le nombre de connexions effacees.
export async function removeInstagramConnections(externalId: string): Promise<number> {
  const rows = await prisma.platformConnection.findMany({ where: { platform: 'instagram', externalId }, select: { id: true, channelId: true } })
  for (const row of rows) {
    await prisma.publication.updateMany({
      where: { platform: 'instagram', status: 'scheduled', clipJob: { moment: { vod: { channelId: row.channelId } } } },
      data: { status: 'cancelled', error: 'Compte déconnecté.' }
    })
    await prisma.platformConnection.delete({ where: { id: row.id } })
  }
  return rows.length
}
