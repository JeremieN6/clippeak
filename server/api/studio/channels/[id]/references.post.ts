import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { prisma } from '../../../../utils/prisma'
import { parseId, assertChannel, requireStudioActor } from '../../../../utils/studioAuth'
import { dataDir, safeFilename } from '../../../../utils/clipping/dataDir'
import { validateReferenceVideo } from '../../../../utils/clipping/assetValidation'
import { parseReferenceUrls } from '../../../../utils/clipping/referenceSource'

const MAX_FILES = 20

// Ajoute des clips de reference : videos deposees (champ "files", plusieurs possibles) et/ou liens de clips ou de comptes
// (champ "urls", un par ligne). L'analyse est faite ensuite par le worker.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  const channel = await prisma.channel.findUnique({ where: { id }, select: { id: true } })
  if (!channel) throw createError({ statusCode: 404, statusMessage: 'Streamer introuvable' })

  const parts = (await readMultipartFormData(event)) ?? []
  const files = parts.filter(p => p.name === 'files' && p.filename)
  const urlText = parts.filter(p => p.name === 'urls' && !p.filename).map(p => p.data.toString('utf8')).join('\n')
  if (!files.length && !urlText.trim()) throw createError({ statusCode: 400, statusMessage: 'Aucun fichier ni lien' })
  if (files.length > MAX_FILES) throw createError({ statusCode: 400, statusMessage: `${MAX_FILES} fichiers maximum a la fois` })

  const { accepted, rejected } = parseReferenceUrls(urlText.split(/\r?\n/).slice(0, 100))
  const refusedFiles: string[] = []
  let addedFiles = 0
  for (const file of files) {
    const name = file.filename ?? 'clip'
    const check = validateReferenceVideo(name, file.data)
    if (!check.ok) {
      refusedFiles.push(`${safeFilename(name)} : ${check.error}`)
      continue
    }
    const dir = join(dataDir(), 'reference', id)
    await mkdir(dir, { recursive: true })
    const target = join(dir, `${randomUUID()}-${safeFilename(name)}`)
    await writeFile(target, file.data, { flag: 'wx' })
    try {
      await prisma.referenceItem.create({
        data: { channelId: id, kind: 'clip', source: 'upload', filePath: relative(dataDir(), target).replace(/\\/g, '/'), title: safeFilename(name).replace(/\.[^.]+$/, '').slice(0, 255) }
      })
      addedFiles++
    } catch (error) {
      await unlink(target).catch(() => {})
      throw error
    }
  }

  const created = await prisma.referenceItem.createMany({
    data: accepted.map(a => ({ channelId: id, kind: a.kind, source: a.source, url: a.url })),
    skipDuplicates: true
  })
  return { addedFiles, addedLinks: created.count, duplicateLinks: accepted.length - created.count, rejectedLinks: rejected, refusedFiles }
})
