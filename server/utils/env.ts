import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Nuxt ne charge pas .env.local en production : meme repli que le reste du projet.
export function readEnv(key: string): string {
  const fromProcess = process.env[key]
  if (fromProcess && fromProcess.trim()) return fromProcess.trim()

  try {
    const path = resolve(process.cwd(), '.env.local')
    if (!existsSync(path)) return ''
    const line = readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .find(current => current.trim().startsWith(`${key}=`))
    if (!line) return ''
    const value = line.slice(line.indexOf('=') + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1).trim()
    }
    return value
  } catch {
    return ''
  }
}
