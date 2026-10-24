// Erreurs de connexion transitoires : Neon coupe les connexions inactives et se met en veille (reveil ~1 s) ;
// Prisma renvoie alors P1001/P1002/P1008/P1017 a la premiere requete apres une longue transcription.
const TRANSIENT_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017'])
const TRANSIENT_MESSAGE = /can't reach database server|server has closed the connection|connection terminated|connection (reset|refused)|timed out fetching a new connection/i

export function isTransientDbError(error: unknown): boolean {
  const e = error as { code?: string, message?: string } | null
  if (!e) return false
  return (typeof e.code === 'string' && TRANSIENT_CODES.has(e.code)) || TRANSIENT_MESSAGE.test(String(e.message ?? ''))
}

export interface RetryOptions {
  attempts?: number
  delaysMs?: number[]
  sleep?: (ms: number) => Promise<void>
  onRetry?: (error: unknown, attempt: number) => void
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

// Reessaie une operation de base apres une erreur de connexion transitoire (1 s, 3 s, 8 s) ; toute autre erreur
// (contrainte, donnee invalide...) est renvoyee tout de suite : on ne rejoue jamais une ecriture refusee.
export async function withDbRetry<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const delays = options.delaysMs ?? [1_000, 3_000, 8_000]
  const attempts = options.attempts ?? delays.length + 1
  const sleep = options.sleep ?? wait
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (!isTransientDbError(error) || attempt === attempts) throw error
      options.onRetry?.(error, attempt)
      await sleep(delays[Math.min(attempt - 1, delays.length - 1)])
    }
  }
  throw lastError
}

// Enveloppe toutes les methodes asynchrones d'un store avec withDbRetry.
export function retrying<T extends Record<string, any>>(store: T, options: RetryOptions = {}): T {
  const wrapped: Record<string, any> = {}
  for (const [name, value] of Object.entries(store)) {
    wrapped[name] = typeof value === 'function' ? (...args: unknown[]) => withDbRetry(() => value.apply(store, args), options) : value
  }
  return wrapped as T
}
