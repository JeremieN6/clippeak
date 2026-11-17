import { prisma } from '../../../utils/prisma'
import { billingConfig, stripeClient } from '../../../utils/billingConfig'
import { requireBillingChannel } from '../../../utils/studioBilling'
import { clampPacks, isPayingStatus, normalizeInterval } from '../../../utils/clipping/billing'
import { isMissingResource } from '../../../utils/clipping/stripeApi'

// Ouvre la page de paiement Stripe pour l'offre payante. Le paiement a lieu chez Stripe : Clippeak ne voit jamais la carte.
export default defineEventHandler(async (event) => {
  const channelId = await requireBillingChannel(event)
  const config = billingConfig(event)
  const stripe = stripeClient()
  if (!config.configured || !stripe) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const billing = await prisma.channelBilling.findUnique({ where: { channelId } })
  if (isPayingStatus(billing?.status)) throw createError({ statusCode: 409, statusMessage: 'Tu as déjà l’offre payante. Gère-la depuis « Gérer mon abonnement ».' })
  // Rythme (annuel par defaut quand le prix annuel existe) et nombre de packs : valeurs inconnues ou hors limites ramenees a 1 ... 5.
  const body = await readBody(event).catch(() => null) as { interval?: unknown, packs?: unknown } | null
  const interval = normalizeInterval(body?.interval) ?? (config.yearlyPriceId ? 'year' : 'month')
  if (interval === 'year' && !config.yearlyPriceId) throw createError({ statusCode: 400, statusMessage: 'L’offre annuelle n’est pas encore disponible.' })
  const packs = clampPacks(body?.packs)
  try {
    // Client Stripe cree par nos soins (nom de la chaine + mention de TVA en pied de facture) ou mis a jour s'il existe deja.
    const newCustomer = async (): Promise<string> => {
      const channel = await prisma.channel.findUniqueOrThrow({ where: { id: channelId }, select: { displayName: true } })
      const id = (await stripe.createCustomer({ channelId, name: channel.displayName, footer: config.invoiceFooter })).id
      await prisma.channelBilling.upsert({ where: { channelId }, create: { channelId, stripeCustomerId: id }, update: { stripeCustomerId: id } })
      return id
    }
    let customerId = billing?.stripeCustomerId ?? null
    if (!customerId) customerId = await newCustomer()
    else if (config.invoiceFooter) await stripe.setCustomerInvoiceFooter(customerId, config.invoiceFooter).catch(() => {})
    const open = (customer: string) => stripe.createCheckoutSession({
      priceId: interval === 'year' ? config.yearlyPriceId : config.priceId, channelId, customerId: customer, packs, interval,
      successUrl: `${config.origin}/studio?billing=ok`, cancelUrl: `${config.origin}/studio?billing=cancel`
    })
    // Client connu mais absent chez Stripe (cree avec les cles de test, jamais retrouve en production) : on en cree un nouveau, une seule fois.
    const session = await open(customerId).catch(async (error) => {
      if (!isMissingResource(error)) throw error
      return open(await newCustomer())
    })
    return { url: session.url }
  } catch (error) {
    console.error('[stripe] paiement impossible', error instanceof Error ? error.message : error)
    throw createError({ statusCode: 503, statusMessage: 'Le paiement n’est pas disponible pour le moment. Réessaie dans quelques minutes.' })
  }
})
