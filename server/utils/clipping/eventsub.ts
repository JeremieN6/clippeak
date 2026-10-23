import { createHmac, timingSafeEqual } from 'node:crypto'

export interface SignatureInput {
  secret: string
  id: string | undefined
  timestamp: string | undefined
  signature: string | undefined
  rawBody: string
  now?: number
  maxAgeMs?: number
}

export function computeSignature(secret: string, id: string, timestamp: string, rawBody: string): string {
  return `sha256=${createHmac('sha256', secret).update(id + timestamp + rawBody).digest('hex')}`
}

export function verifyEventSubSignature(input: SignatureInput): boolean {
  const { secret, id, timestamp, signature, rawBody } = input
  if (!secret || !id || !timestamp || !signature) return false

  const sentAt = Date.parse(timestamp)
  if (Number.isNaN(sentAt)) return false
  if (Math.abs((input.now ?? Date.now()) - sentAt) > (input.maxAgeMs ?? 10 * 60_000)) return false

  const expected = Buffer.from(computeSignature(secret, id, timestamp, rawBody))
  const received = Buffer.from(signature)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export function createSeenMessages(capacity = 5000) {
  const seen = new Set<string>()
  return {
    // true si le message etait deja connu (Twitch peut renvoyer une notification)
    check(id: string): boolean {
      if (seen.has(id)) return true
      seen.add(id)
      if (seen.size > capacity) seen.delete(seen.values().next().value as string)
      return false
    }
  }
}
