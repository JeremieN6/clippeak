import { prisma } from '../../../../utils/prisma'
import { parseId, assertChannel, requireStudioActor } from '../../../../utils/studioAuth'
import { buildReferenceBankProfile } from '../../../../utils/clipping/referenceProfile'
import { toProfileItem, transcriptText } from '../../../../utils/clipping/prismaReferenceStore'

// Banque de reference d'un streamer : elements (fichiers, liens, comptes), etat d'analyse et profil agrege.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  const rows = await prisma.referenceItem.findMany({ where: { channelId: id }, orderBy: { createdAt: 'desc' }, take: 300 })
  const profile = buildReferenceBankProfile(rows.filter(r => r.kind === 'clip' && r.status === 'done').map(toProfileItem))
  return {
    items: rows.map(r => ({
      id: r.id,
      parentId: r.parentId,
      kind: r.kind,
      source: r.source,
      url: r.url,
      hasFile: Boolean(r.filePath),
      title: r.title,
      durationSec: r.durationSec,
      viewCount: r.viewCount,
      likeCount: r.likeCount,
      commentCount: r.commentCount,
      shareCount: r.shareCount,
      status: r.status,
      note: r.note,
      error: r.error,
      analysis: r.analysis,
      transcriptExcerpt: transcriptText(r.transcript).slice(0, 300),
      createdAt: r.createdAt
    })),
    profile,
    pending: rows.filter(r => r.status === 'pending' || r.status === 'processing').length
  }
})
