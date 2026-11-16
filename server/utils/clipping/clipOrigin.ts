// D'ou vient un moment : du chat (pic de messages) ou d'une ressemblance avec les clips de reference, sans pic de chat.
// Le balayage par ressemblance (server/worker/similarityScan.ts) ecrit une justification qui commence par ce libelle.
const SIMILARITY_PREFIX = 'detecte par ressemblance'
// La detection par le contenu du live (contentDetection.ts) ecrit une justification qui commence par ce libelle.
const CONTENT_PREFIX = 'detecte par le contenu'

export type ClipOrigin = 'chat' | 'ref' | 'content'

export function clipOrigin(rationale: string | null | undefined): ClipOrigin {
  const text = rationale?.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') ?? ''
  if (text.startsWith(SIMILARITY_PREFIX)) return 'ref'
  return text.startsWith(CONTENT_PREFIX) ? 'content' : 'chat'
}
