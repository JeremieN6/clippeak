import { join, resolve, sep } from 'node:path'
import { readEnv } from '../env.ts'

// Dossier des fichiers generes et deposes (clips, photos, SFX, illustrations). Jamais dans le depot (voir .gitignore),
// jamais servi tel quel : les routes passent par safeResolve et verifient l'identifiant.
// Le site (Nuxt, en production) ne charge pas .env.local dans process.env, contrairement au worker : sans ce repli, le site lisait un autre
// dossier que le worker (clips introuvables, fichiers deposes ranges ailleurs). Le fichier n'est lu qu'une fois.
let fromFile: string | undefined

export function dataDir(): string {
  fromFile ??= readEnv('CLIPPEAK_DATA_DIR')
  return resolve(process.env.CLIPPEAK_DATA_DIR || fromFile || join(process.cwd(), 'data'))
}

export const clipsDir = () => join(dataDir(), 'clips')

// Resout un chemin relatif a la racine donnee ; refuse tout ce qui en sortirait (.., chemin absolu, octet nul).
export function safeResolve(base: string, relative: string): string {
  if (!relative || relative.includes('\0')) throw new Error('Chemin invalide')
  const root = resolve(base)
  const target = resolve(root, relative)
  if (target !== root && !target.startsWith(root + sep)) throw new Error('Chemin hors du dossier de donnees')
  return target
}

// Nom de fichier depose par un utilisateur : on ne garde que lettres, chiffres, point, tiret et underscore.
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const cleaned = base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 120)
  return cleaned || 'fichier'
}

export const ASSET_KINDS = ['photo', 'avatar', 'sfx', 'illustration'] as const
export type AssetKind = typeof ASSET_KINDS[number]

// Extensions et taille maximale acceptees par type de fichier.
export const ASSET_RULES: Record<AssetKind, { extensions: string[], maxBytes: number }> = {
  photo: { extensions: ['.jpg', '.jpeg', '.png'], maxBytes: 8 * 1024 * 1024 },
  avatar: { extensions: ['.gif', '.png', '.webp'], maxBytes: 8 * 1024 * 1024 },
  sfx: { extensions: ['.mp3', '.wav', '.ogg', '.m4a'], maxBytes: 5 * 1024 * 1024 },
  illustration: { extensions: ['.mp4', '.mov', '.webm'], maxBytes: 60 * 1024 * 1024 }
}
