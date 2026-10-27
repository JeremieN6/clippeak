import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { prisma } from '../../../../utils/prisma'
import { parseId, assertChannel, requireStudioActor } from '../../../../utils/studioAuth'
import { ASSET_KINDS, dataDir, safeFilename } from '../../../../utils/clipping/dataDir'
import type { AssetKind } from '../../../../utils/clipping/dataDir'
import { validateUpload } from '../../../../utils/clipping/assetValidation'

// Depot d'un fichier du streamer (photo, avatar/GIF, SFX, illustration, police) : type, taille et contenu verifies.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  const channel = await prisma.channel.findUnique({ where: { id }, select: { id: true } })
  if (!channel) throw createError({ statusCode: 404, statusMessage: 'Streamer introuvable' })

  const parts = await readMultipartFormData(event)
  const field = (name: string) => parts?.find(p => p.name === name && !p.filename)?.data.toString('utf8').trim() ?? ''
  const file = parts?.find(p => p.name === 'file' && p.filename)
  const kind = field('kind') as AssetKind
  if (!file || !(ASSET_KINDS as readonly string[]).includes(kind)) throw createError({ statusCode: 400, statusMessage: 'Fichier ou type manquant' })

  const check = validateUpload(kind, file.filename ?? '', file.data)
  if (!check.ok) throw createError({ statusCode: 400, statusMessage: check.error ?? 'Fichier refuse' })

  const filename = safeFilename(file.filename ?? 'fichier')
  const target = join(dataDir(), 'assets', id, `${randomUUID()}-${filename}`)
  await mkdir(join(dataDir(), 'assets', id), { recursive: true })
  await writeFile(target, file.data, { flag: 'wx' })

  const tags = field('tags').split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 20)
  const asset = await prisma.streamerAsset.create({
    data: {
      channelId: id,
      kind,
      filename,
      path: relative(dataDir(), target).replace(/\\/g, '/'),
      tags,
      source: field('source').slice(0, 500) || null
    }
  })
  return { id: asset.id, kind: asset.kind, filename: asset.filename, tags: asset.tags, source: asset.source }
})
