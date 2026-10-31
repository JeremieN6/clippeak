import { prisma } from './prisma'
import { applySubscriptionEvent, planFor } from './clipping/billing'
import { uuidSchema } from './studioAuth'

// Ecritures de facturation declenchees par les evenements Stripe (webhook). Idempotent : rejouer un evenement donne le meme etat, et un
// evenement plus ancien que le dernier applique est ignore.
export interface StripeEventLike { id: string, type: string, created?: number, data: { object: any } }

async function channelFor(channelIdRaw: unknown, customerId: unknown): Promise<string | null> {
  const parsed = uuidSchema.safeParse(channelIdRaw)
  if (parsed.success) {
    const found = await prisma.channel.findUnique({ where: { id: parsed.data }, select: { id: true } })
    if (found) return found.id
  }
  if (typeof customerId === 'string' && customerId) {
    const byCustomer = await prisma.channelBilling.findUnique({ where: { stripeCustomerId: customerId }, select: { channelId: true } })
    if (byCustomer) return byCustomer.channelId
  }
  return null
}

const str = (value: unknown): string | null => typeof value === 'string' && value ? value : null

// Renvoie ce qui a ete fait, pour les journaux et les essais.
export async function applyStripeEvent(evt: StripeEventLike): Promise<'applied' | 'ignored' | 'stale' | 'unknown_channel'> {
  const object = evt.data?.object ?? {}
  const at = new Date((typeof evt.created === 'number' ? evt.created : Date.now() / 1000) * 1000)

  if (evt.type === 'checkout.session.completed') {
    if (object.mode !== 'subscription') return 'ignored'
    const channelId = await channelFor(object.client_reference_id ?? object.metadata?.channel_id, object.customer)
    if (!channelId) return 'unknown_channel'
    const current = await prisma.channelBilling.findUnique({ where: { channelId } })
    if (current?.lastEventAt && current.lastEventAt > at) {
      // Un evenement d'abonnement plus recent est deja passe : on garde seulement les identifiants.
      await prisma.channelBilling.update({ where: { channelId }, data: { stripeCustomerId: current.stripeCustomerId ?? str(object.customer), stripeSubscriptionId: current.stripeSubscriptionId ?? str(object.subscription) } })
      return 'stale'
    }
    const paid = object.payment_status === 'paid' || object.payment_status === 'no_payment_required'
    const fields = { plan: paid ? 'creator' : 'free', status: paid ? 'active' : 'incomplete', lastEventAt: at }
    await prisma.channelBilling.upsert({
      where: { channelId },
      create: { channelId, stripeCustomerId: str(object.customer), stripeSubscriptionId: str(object.subscription), ...fields },
      update: { stripeCustomerId: str(object.customer) ?? undefined, stripeSubscriptionId: str(object.subscription) ?? undefined, ...fields }
    })
    return 'applied'
  }

  const state = applySubscriptionEvent(evt.type, object)
  if (!state) return 'ignored'
  const channelId = await channelFor(object.metadata?.channel_id, object.customer)
  if (!channelId) return 'unknown_channel'
  const current = await prisma.channelBilling.findUnique({ where: { channelId } })
  if (current?.lastEventAt && current.lastEventAt > at) return 'stale'
  const fields = { plan: planFor(state.status), status: state.status, currentPeriodEnd: state.periodEnd, lastEventAt: at }
  await prisma.channelBilling.upsert({
    where: { channelId },
    create: { channelId, stripeCustomerId: str(object.customer), stripeSubscriptionId: str(object.id), ...fields },
    update: { stripeCustomerId: current?.stripeCustomerId ?? str(object.customer) ?? undefined, stripeSubscriptionId: str(object.id) ?? undefined, ...fields }
  })
  return 'applied'
}
