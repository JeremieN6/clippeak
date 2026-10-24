import { extname } from 'node:path'
import { ASSET_RULES } from './dataDir.ts'
import type { AssetKind } from './dataDir.ts'

const startsWith = (buf: Buffer, bytes: number[], offset = 0) => bytes.every((b, i) => buf[offset + i] === b)
const ascii = (buf: Buffer, text: string, offset = 0) => buf.length >= offset + text.length && buf.toString('latin1', offset, offset + text.length) === text

// Verifie que le contenu correspond a l'extension annoncee (octets magiques) : on ne se fie pas au nom du fichier.
export function contentMatchesExtension(ext: string, buf: Buffer): boolean {
  switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg': return startsWith(buf, [0xFF, 0xD8, 0xFF])
    case '.png': return startsWith(buf, [0x89, 0x50, 0x4E, 0x47])
    case '.gif': return ascii(buf, 'GIF87a') || ascii(buf, 'GIF89a')
    case '.webp': return ascii(buf, 'RIFF') && ascii(buf, 'WEBP', 8)
    case '.mp4':
    case '.mov':
    case '.m4a': return ascii(buf, 'ftyp', 4)
    case '.webm': return startsWith(buf, [0x1A, 0x45, 0xDF, 0xA3])
    case '.mp3': return ascii(buf, 'ID3') || (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0)
    case '.wav': return ascii(buf, 'RIFF') && ascii(buf, 'WAVE', 8)
    case '.ogg': return ascii(buf, 'OggS')
    case '.ttf': return startsWith(buf, [0x00, 0x01, 0x00, 0x00]) || ascii(buf, 'true')
    case '.otf': return ascii(buf, 'OTTO')
    default: return false
  }
}

export const REFERENCE_VIDEO_MAX_BYTES = 80 * 1024 * 1024
export const REFERENCE_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm']

// Clip de reference depose par le streamer : video courte, extension et contenu verifies.
export function validateReferenceVideo(filename: string, data: Buffer): UploadCheck {
  const extension = extname(filename).toLowerCase()
  if (!REFERENCE_VIDEO_EXTENSIONS.includes(extension)) return { ok: false, error: `Extension ${extension || '(aucune)'} non acceptee (${REFERENCE_VIDEO_EXTENSIONS.join(', ')})` }
  if (!data.length) return { ok: false, error: 'Fichier vide' }
  if (data.length > REFERENCE_VIDEO_MAX_BYTES) return { ok: false, error: `Fichier trop volumineux (max ${Math.round(REFERENCE_VIDEO_MAX_BYTES / 1024 / 1024)} Mo)` }
  if (!contentMatchesExtension(extension, data)) return { ok: false, error: 'Le contenu ne correspond pas a l\'extension' }
  return { ok: true, extension }
}

export interface UploadCheck {
  ok: boolean
  error?: string
  extension?: string
}

export function validateUpload(kind: AssetKind, filename: string, data: Buffer): UploadCheck {
  const rule = ASSET_RULES[kind]
  const extension = extname(filename).toLowerCase()
  if (!rule.extensions.includes(extension)) return { ok: false, error: `Extension ${extension || '(aucune)'} non acceptee pour ${kind} (${rule.extensions.join(', ')})` }
  if (!data.length) return { ok: false, error: 'Fichier vide' }
  if (data.length > rule.maxBytes) return { ok: false, error: `Fichier trop volumineux (max ${Math.round(rule.maxBytes / 1024 / 1024)} Mo)` }
  if (!contentMatchesExtension(extension, data)) return { ok: false, error: 'Le contenu ne correspond pas a l\'extension' }
  return { ok: true, extension }
}
