import type { PrismaClient } from '@prisma/client'
import { DEFAULT_DAILY_CAP, DEFAULT_REFERRAL_BONUS_CAP, openSignupAllowed, parisDayStart, serverAllowsWave, waitState, waveSize, type WaitState } from './waves'

// Acces base des vagues d'invitations (regles pures : ./waves.ts). Partage par le worker (qui invite), les routes du site (page d'attente)
// et l'administration (file, reglages).
type Db = Pick<PrismaClient, 'accessRequest' | 'channelInvite' | 'invitationSettings' | 'opsSample'>

// Duree de conservation d'une demande d'acces (vie privee : on ne garde que le pseudo Twitch, 90 jours au plus).
export const REQUEST_KEEP_DAYS = 90

export interface InvitationConfig { wavesEnabled: boolean, dailyCap: number, referralBonusCap: number, openUntil: number, autoOpenBatch: number }

export async function loadInvitationConfig(db: Pick<Db, 'invitationSettings'>): Promise<InvitationConfig> {
  const row = await db.invitationSettings.findUnique({ where: { id: 1 } })
  return { wavesEnabled: row?.wavesEnabled ?? false, dailyCap: row?.dailyCap ?? DEFAULT_DAILY_CAP, referralBonusCap: row?.referralBonusCap ?? DEFAULT_REFERRAL_BONUS_CAP, openUntil: row?.openUntil ?? 0, autoOpenBatch: row?.autoOpenBatch ?? 0 }
}

// Places prises = invitations (manuelles, par vague ou par inscription libre) : une invitation reserve sa place meme avant la premiere connexion.
export const openSlotsTaken = (db: Pick<Db, 'channelInvite'>) => db.channelInvite.count()

// Inscription libre possible maintenant ? Reglage actif, places restantes, serveur calme (memes mesures que les vagues).
export async function openSignupAvailable(db: Db, now: Date = new Date()): Promise<boolean> {
  const config = await loadInvitationConfig(db)
  if (config.openUntil <= 0) return false
  const samples = await db.opsSample.findMany({ where: { at: { gte: new Date(now.getTime() - 10 * 60_000) } }, orderBy: { at: 'desc' }, take: 20 })
  return openSignupAllowed({ openUntil: config.openUntil, taken: await openSlotsTaken(db), serverOk: serverAllowsWave(samples, now) })
}

// Invitations lancees aujourd'hui (jour de Paris) par les vagues automatiques : celles-ci seules comptent dans le plafond du jour,
// l'admin peut toujours inviter a la main.
export const invitedToday = (db: Pick<Db, 'channelInvite'>, now: Date = new Date()) =>
  db.channelInvite.count({ where: { source: 'wave', createdAt: { gte: parisDayStart(now) } } })

export async function purgeOldRequests(db: Pick<Db, 'accessRequest'>, now: Date = new Date()): Promise<number> {
  const { count } = await db.accessRequest.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - REQUEST_KEEP_DAYS * 24 * 3600_000) } } })
  return count
}

// Place dans la file (1 = le prochain) : les parraines d'abord, puis l'ordre d'arrivee. null si la personne n'est pas dans la file.
export async function queuePosition(db: Pick<Db, 'accessRequest'>, twitchId: string): Promise<{ position: number, total: number } | null> {
  const mine = await db.accessRequest.findUnique({ where: { twitchId }, select: { createdAt: true, referredByChannelId: true } })
  if (!mine) return null
  const [total, referredBefore, plainBefore, referredAll] = await Promise.all([
    db.accessRequest.count(),
    db.accessRequest.count({ where: { referredByChannelId: { not: null }, createdAt: { lt: mine.createdAt } } }),
    db.accessRequest.count({ where: { referredByChannelId: null, createdAt: { lt: mine.createdAt } } }),
    db.accessRequest.count({ where: { referredByChannelId: { not: null } } })
  ])
  return { position: mine.referredByChannelId ? referredBefore + 1 : referredAll + plainBefore + 1, total }
}

// File d'attente ordonnee (parraines d'abord, puis arrivee), `take` premieres demandes.
export async function queueHead(db: Pick<Db, 'accessRequest'>, take: number) {
  const referred = await db.accessRequest.findMany({ where: { referredByChannelId: { not: null } }, orderBy: { createdAt: 'asc' }, take })
  if (referred.length >= take) return referred
  const plain = await db.accessRequest.findMany({ where: { referredByChannelId: null }, orderBy: { createdAt: 'asc' }, take: take - referred.length })
  return [...referred, ...plain]
}

export interface WaveResult { invited: string[], reason: 'off' | 'server' | 'cap' | 'empty' | 'ok' }

// Une vague : invite les plus anciennes demandes (parraines d'abord) tant que les vagues sont actives, que le serveur est calme et que le
// plafond du jour n'est pas atteint. Chaque demande invitee devient une invitation (source « wave ») et est effacee de la file.
export async function runWave(db: Db, now: Date = new Date()): Promise<WaveResult> {
  await purgeOldRequests(db, now)
  const config = await loadInvitationConfig(db)
  if (!config.wavesEnabled) return { invited: [], reason: 'off' }
  const samples = await db.opsSample.findMany({ where: { at: { gte: new Date(now.getTime() - 10 * 60_000) } }, orderBy: { at: 'desc' }, take: 20 })
  const serverOk = serverAllowsWave(samples, now)
  const [today, queueLength] = await Promise.all([invitedToday(db, now), db.accessRequest.count()])
  const size = waveSize({ enabled: true, dailyCap: config.dailyCap, invitedToday: today, serverOk, queueLength })
  if (size === 0) return { invited: [], reason: !serverOk ? 'server' : queueLength === 0 ? 'empty' : 'cap' }
  const invited: string[] = []
  for (const request of await queueHead(db, size)) {
    await (db as PrismaClient).$transaction([
      db.channelInvite.upsert({
        where: { twitchLogin: request.twitchLogin },
        update: {},
        create: { twitchLogin: request.twitchLogin, twitchId: null, note: 'Vague automatique', source: 'wave', referredByChannelId: request.referredByChannelId }
      }),
      db.accessRequest.delete({ where: { id: request.id } })
    ])
    invited.push(request.twitchLogin)
  }
  return { invited, reason: 'ok' }
}

// Ce que voit la page d'attente : etat des vagues et place dans la file.
export async function waitStatus(db: Db, who: { id: string, login: string }, now: Date = new Date()): Promise<{ invited: boolean, requested: boolean, position: number | null, total: number, state: WaitState }> {
  const config = await loadInvitationConfig(db)
  const openFull = config.openUntil > 0 && (await openSlotsTaken(db)) >= config.openUntil
  const state = waitState({ enabled: config.wavesEnabled, dailyCap: config.dailyCap, invitedToday: await invitedToday(db, now), openFull })
  const invite = await db.channelInvite.findFirst({ where: { OR: [{ twitchId: who.id }, { twitchLogin: who.login }] }, select: { id: true } })
  if (invite) return { invited: true, requested: false, position: null, total: 0, state }
  const place = await queuePosition(db, who.id)
  return { invited: false, requested: Boolean(place), position: place?.position ?? null, total: place?.total ?? 0, state }
}
