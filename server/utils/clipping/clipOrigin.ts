// D'ou vient un moment : du chat (pic de messages) ou d'une ressemblance avec les clips de reference, sans pic de chat.
// Le balayage par ressemblance (server/worker/similarityScan.ts) ecrit une justification qui commence par ce libelle.
const SIMILARITY_PREFIX = 'detecte par ressemblance'

export type ClipOrigin = 'chat' | 'ref'

export function clipOrigin(rationale: string | null | undefined): ClipOrigin {
  return rationale?.trim().toLowerCase().startsWith(SIMILARITY_PREFIX) ? 'ref' : 'chat'
}
