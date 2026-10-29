import { countTitleLines, fitTitle, titleLayout } from './assBuilder.ts'

export const MIN_TITLE_FONT_SIZE = 48
const STEP = 4

export interface FittedTitle {
  // Texte a ecrire : identique a la demande, sauf s'il a fallu le raccourcir (alors termine par "...").
  text: string
  fontSize: number
  maxCharsPerLine: number
  maxLines: number
  // Nombre de lignes occupees par le texte retenu.
  lines: number
  // La taille de police a ete reduite par rapport a la taille choisie.
  shrunk: boolean
  // Le texte a ete raccourci (meme avec la plus petite police il ne tenait pas).
  truncated: boolean
}

// Fait tenir un titre dans la bande noire : jamais d'erreur, jamais de 4e ligne.
//   1. on garde la taille de police choisie si le titre tient ;
//   2. sinon on la reduit par paliers jusqu'a MIN_TITLE_FONT_SIZE (plus petite, il y a plus de caracteres par ligne) ;
//   3. si le titre ne tient toujours pas, on le coupe au dernier mot entier et on ajoute « … ».
export function fitTitleToBand(raw: string, fontSize: number, maxLines = 3): FittedTitle {
  const text = raw.replace(/\s+/g, ' ').trim()
  const floor = Math.min(fontSize, MIN_TITLE_FONT_SIZE)
  let size = fontSize
  for (;;) {
    const layout = titleLayout(size, maxLines)
    const lines = countTitleLines(text, layout.maxCharsPerLine)
    if (lines <= layout.maxLines) return { text, fontSize: size, ...layout, lines, shrunk: size < fontSize, truncated: false }
    if (size <= floor) break
    size = Math.max(floor, size - STEP)
  }
  const layout = titleLayout(floor, maxLines)
  const words = fitTitle(text, layout.maxLines, layout.maxCharsPerLine).split(' ')
  let kept = words
  const withEllipsis = (list: string[]) => `${list.join(' ').replace(/[.,;:!?…-]+$/, '')}…`
  while (kept.length > 1 && countTitleLines(withEllipsis(kept), layout.maxCharsPerLine) > layout.maxLines) kept = kept.slice(0, -1)
  const cut = withEllipsis(kept)
  return { text: cut, fontSize: floor, ...layout, lines: countTitleLines(cut, layout.maxCharsPerLine), shrunk: floor < fontSize, truncated: true }
}
