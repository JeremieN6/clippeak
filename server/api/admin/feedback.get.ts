import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { prisma } from '../../utils/prisma'

function readAdminPasswordFromDotEnvLocal() {
  try {
    const envLocalPath = resolve(process.cwd(), '.env.local')
    if (!existsSync(envLocalPath)) return ''

    const raw = readFileSync(envLocalPath, 'utf8')
    const line = raw
      .split(/\r?\n/)
      .find((current) => current.trim().startsWith('ADMIN_PASSWORD='))

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

const fallbackAdminPassword = readAdminPasswordFromDotEnvLocal()

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const query = getQuery(event)
  const password = typeof query.password === 'string' ? query.password.trim() : ''
  const expected = (config.adminPassword || process.env.ADMIN_PASSWORD || fallbackAdminPassword || '').trim()

  if (!expected || password !== expected) {
    throw createError({ statusCode: 401, statusMessage: 'Acces refuse' })
  }

  const feedbacks = await prisma.feedback.findMany({
    orderBy: { createdAt: 'desc' }
  })

  const total = feedbacks.length
  const automationOui = feedbacks.filter((f) => f.outilAutomatise === 'oui').length
  const automationOuiPct = total > 0 ? Math.round((automationOui / total) * 100) : 0

  const plateformeRepartition = feedbacks.reduce<Record<string, number>>((acc, current) => {
    const key = current.plateformeReception
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const profilRepartition = feedbacks.reduce<Record<string, number>>((acc, current) => {
    const key = current.profil
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  return {
    metrics: {
      total,
      automationOuiPct,
      plateformeRepartition,
      profilRepartition
    },
    feedbacks
  }
})
