import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Chiffrement des jetons d'acces aux plateformes (AES-256-GCM). La cle (32 octets en base64) vient de CLIPPEAK_TOKEN_KEY,
// jamais du depot. Format stocke : v1.<iv>.<tag>.<texte chiffre>, tout en base64url ; toute alteration fait echouer le dechiffrement.
export function parseKey(raw: string | undefined): Buffer {
  const key = Buffer.from((raw ?? '').trim(), 'base64')
  if (key.length !== 32) throw new Error('CLIPPEAK_TOKEN_KEY absente ou invalide (32 octets en base64 attendus)')
  return key
}

export function encryptToken(plain: string, key: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.')
}

export function decryptToken(stored: string, key: Buffer): string {
  const [version, iv, tag, body] = stored.split('.')
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('Jeton chiffre illisible')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')
}
