import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

function readEnvValueFromDotEnvLocal(key: string) {
  try {
    const envLocalPath = resolve(process.cwd(), '.env.local')
    if (!existsSync(envLocalPath)) return ''

    const raw = readFileSync(envLocalPath, 'utf8')
    const line = raw
      .split(/\r?\n/)
      .find((current) => current.trim().startsWith(`${key}=`))

    if (!line) return ''

    const value = line.slice(line.indexOf('=') + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1).trim()
    }

    return value
  } catch {
    return ''
  }
}

if (!process.env.DATABASE_URL) {
  const fallbackDatabaseUrl = readEnvValueFromDotEnvLocal('DATABASE_URL')
  if (fallbackDatabaseUrl) {
    process.env.DATABASE_URL = fallbackDatabaseUrl
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined
}

export const prisma = globalThis.__prisma__ ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma__ = prisma
}
