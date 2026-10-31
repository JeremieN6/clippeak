// Client Stripe minimal, sans dependance : seulement les trois appels dont Clippeak a besoin (paiement, portail, annulation).
// Les messages d'erreur ne contiennent jamais la cle secrete. `apiBase` permet de viser un faux Stripe dans les essais.
type FetchFn = typeof fetch

export class StripeError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.name = 'StripeError'; this.status = status }
}

export interface StripeClient {
  createCheckoutSession(input: { priceId: string, channelId: string, customerId: string | null, successUrl: string, cancelUrl: string }): Promise<{ url: string }>
  createPortalSession(input: { customerId: string, returnUrl: string }): Promise<{ url: string }>
  cancelSubscription(subscriptionId: string): Promise<void>
  createCustomer(input: { channelId: string, name: string, footer: string | null }): Promise<{ id: string }>
  setCustomerInvoiceFooter(customerId: string, footer: string): Promise<void>
  getPrice(priceId: string): Promise<{ amount: number, currency: string, interval: string | null }>
}

export function createStripeClient(config: { secretKey: string, apiBase?: string, fetchFn?: FetchFn }): StripeClient {
  const base = (config.apiBase ?? 'https://api.stripe.com').replace(/\/+$/, '')
  const fetchFn = config.fetchFn ?? fetch

  async function call<T>(method: 'GET' | 'POST' | 'DELETE', path: string, form?: Record<string, string>): Promise<T> {
    const response = await fetchFn(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${config.secretKey}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: form ? new URLSearchParams(form).toString() : undefined
    })
    const text = await response.text()
    let json: any = {}
    try { json = JSON.parse(text) } catch { /* reponse non JSON : traitee ci-dessous */ }
    if (!response.ok) throw new StripeError(`Stripe a refusé la demande (${response.status}${json?.error?.code ? `, ${json.error.code}` : ''}).`, response.status)
    return json as T
  }

  return {
    async createCheckoutSession({ priceId, channelId, customerId, successUrl, cancelUrl }) {
      const form: Record<string, string> = {
        mode: 'subscription',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        client_reference_id: channelId,
        'subscription_data[metadata][channel_id]': channelId,
        'metadata[channel_id]': channelId,
        allow_promotion_codes: 'true',
        success_url: successUrl,
        cancel_url: cancelUrl
      }
      if (customerId) form.customer = customerId
      const session = await call<{ url?: string }>('POST', '/v1/checkout/sessions', form)
      if (!session.url) throw new StripeError('Stripe n’a pas renvoyé de page de paiement.', 502)
      return { url: session.url }
    },
    async createPortalSession({ customerId, returnUrl }) {
      const session = await call<{ url?: string }>('POST', '/v1/billing_portal/sessions', { customer: customerId, return_url: returnUrl })
      if (!session.url) throw new StripeError('Stripe n’a pas renvoyé de portail.', 502)
      return { url: session.url }
    },
    async getPrice(priceId) {
      const price = await call<{ unit_amount?: number | null, currency?: string, recurring?: { interval?: string } | null }>('GET', `/v1/prices/${encodeURIComponent(priceId)}`)
      return { amount: price.unit_amount ?? 0, currency: price.currency ?? 'eur', interval: price.recurring?.interval ?? null }
    },
    // Le client est cree par Clippeak AVANT le paiement : son nom et le pied de ses factures (mention de TVA) figurent des la premiere facture.
    async createCustomer({ channelId, name, footer }) {
      const form: Record<string, string> = { name: name.slice(0, 120), 'metadata[channel_id]': channelId, 'preferred_locales[0]': 'fr' }
      if (footer) form['invoice_settings[footer]'] = footer
      const customer = await call<{ id?: string }>('POST', '/v1/customers', form)
      if (!customer.id) throw new StripeError('Stripe n’a pas créé le client.', 502)
      return { id: customer.id }
    },
    async setCustomerInvoiceFooter(customerId, footer) {
      await call('POST', `/v1/customers/${encodeURIComponent(customerId)}`, { 'invoice_settings[footer]': footer })
    },
    async cancelSubscription(subscriptionId) {
      await call('DELETE', `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`)
    }
  }
}
