import { randomInt } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { isReferralCode, referralAllowed, REFERRAL_ALPHABET, REFERRAL_LIVES } from './waves'
import { monthlyReferralBonus } from './prismaQuota'
import { DEFAULT_REFERRAL_BONUS_CAP } from './waves'

// Acces base du parrainage (regles pures : ./waves.ts). Un parrainage = +1 LIVE gratuit pour le parrain (pour le mois) quand la personne amenee a
// son premier clip pret a valider. La personne amenee ne recoit rien de plus. Plafonne par mois.
type Db = Pick<PrismaClient, 'channel' | 'clipJob' | 'referralGrant' | 'invitationSettings'>

const newCode = () => Array.from({ length: 8 }, () => REFERRAL_ALPHABET[randomInt(REFERRAL_ALPHABET.length)]).join('')

// Code personnel du lien de parrainage (cree a la premiere demande, puis toujours le meme).
export async function ensureReferralCode(db: Db, channelId: string): Promise<string> {
  const channel = await db.channel.findUnique({ where: { id: channelId }, select: { referralCode: true } })
  if (!channel) throw new Error('chaine introuvable')
  if (channel.referralCode) return channel.referralCode
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const updated = await db.channel.update({ where: { id: channelId }, data: { referralCode: newCode() }, select: { referralCode: true } })
      return updated.referralCode as string
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error // un code deja pris : on en tire un autre
    }
  }
  throw new Error('code de parrainage impossible a creer')
}

// Parrain d'un code (null si le code est inconnu ou mal forme).
export async function referrerFromCode(db: Pick<Db, 'channel'>, code: unknown): Promise<{ id: string, twitchId: string } | null> {
  if (!isReferralCode(code)) return null
  return db.channel.findUnique({ where: { referralCode: code }, select: { id: true, twitchId: true } })
}

// Rattache une chaine a son parrain (une seule fois), sans rien donner encore : le bonus du parrain vient avec le premier clip de la personne
// amenee. Faux parrainage (meme compte, chaine de test) ou deja parraine : rien. Renvoie true si le parrainage a ete enregistre.
export async function attachReferral(db: Db, channel: { id: string, twitchId: string }, referrerId: string): Promise<boolean> {
  const referrer = await db.channel.findUnique({ where: { id: referrerId }, select: { id: true, twitchId: true } })
  if (!referrer || !referralAllowed({ channelId: channel.id, channelTwitchId: channel.twitchId, referrerId: referrer.id, referrerTwitchId: referrer.twitchId })) return false
  const { count } = await db.channel.updateMany({ where: { id: channel.id, referredById: null }, data: { referredById: referrer.id } })
  return count > 0
}

// Appele quand un clip devient PRET a valider (fin du rendu) ou est valide : si la chaine a ete parrainee et qu'elle a au moins un clip pret, le
// parrain gagne 1 live (une seule fois par personne amenee). Un clip en echec ou refuse ne donne rien.
export async function grantReferrerOnFirstClip(db: Db, channelId: string): Promise<boolean> {
  const channel = await db.channel.findUnique({ where: { id: channelId }, select: { id: true, twitchId: true, referredById: true } })
  if (!channel?.referredById) return false
  const referrer = await db.channel.findUnique({ where: { id: channel.referredById }, select: { id: true, twitchId: true } })
  if (!referrer || !referralAllowed({ channelId: channel.id, channelTwitchId: channel.twitchId, referrerId: referrer.id, referrerTwitchId: referrer.twitchId })) return false
  const validated = await db.clipJob.count({ where: { status: { in: ['review', 'approved'] }, format: 'short', moment: { vod: { channelId } } } })
  if (validated < 1) return false
  const { count } = await db.referralGrant.createMany({ data: [{ channelId: referrer.id, otherChannelId: channel.id, kind: 'referrer', clips: REFERRAL_LIVES }], skipDuplicates: true })
  return count > 0
}

export interface ReferralSummary {
  code: string
  referred: Array<{ name: string, validated: boolean, grantedAt: string | null }>
  bonusThisMonth: number
  bonusCap: number
  livesPerReferral: number
}

export async function referralSummary(db: Db, channelId: string, now: Date = new Date()): Promise<ReferralSummary> {
  const code = await ensureReferralCode(db, channelId)
  const [referred, grants, settings, bonus] = await Promise.all([
    db.channel.findMany({ where: { referredById: channelId }, select: { id: true, displayName: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 100 }),
    db.referralGrant.findMany({ where: { channelId, kind: 'referrer' }, select: { otherChannelId: true, createdAt: true } }),
    db.invitationSettings.findUnique({ where: { id: 1 }, select: { referralBonusCap: true } }),
    monthlyReferralBonus(db, channelId, now)
  ])
  const granted = new Map(grants.map(g => [g.otherChannelId, g.createdAt]))
  return {
    code,
    referred: referred.map(r => ({ name: r.displayName, validated: granted.has(r.id), grantedAt: granted.get(r.id)?.toISOString() ?? null })),
    bonusThisMonth: bonus,
    bonusCap: settings?.referralBonusCap ?? DEFAULT_REFERRAL_BONUS_CAP,
    livesPerReferral: REFERRAL_LIVES
  }
}
