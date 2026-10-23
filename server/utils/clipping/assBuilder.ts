export interface TimedWord {
  start: number
  end: number
  text: string
}

export interface TitleStyle {
  enabled: boolean
  fontName: string
  fontSize: number
  color: string
  outlineColor: string
  bandHeight: number
  maxLines: number
  maxCharsPerLine: number
}

export interface SubtitleStyle {
  enabled: boolean
  fontName: string
  fontSize: number
  color: string
  highlightColor: string
  outlineColor: string
  // Distance du bas de l'ecran (px sur 1920).
  marginBottom: number
  uppercase: boolean
  // Mots mis en valeur par la couleur d'accent (compares sans accents ni ponctuation).
  keywords: string[]
}

export const DEFAULT_TITLE_STYLE: TitleStyle = {
  enabled: true,
  fontName: 'Lato',
  fontSize: 68,
  color: '#FFFFFF',
  outlineColor: '#000000',
  bandHeight: 300,
  maxLines: 3,
  maxCharsPerLine: 24
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  enabled: true,
  fontName: 'Lato',
  fontSize: 96,
  color: '#FFFFFF',
  highlightColor: '#FFD400',
  outlineColor: '#000000',
  marginBottom: 420,
  uppercase: true,
  keywords: []
}

// "#RRGGBB" -> "&H00BBGGRR" (format ASS).
export function hexToAss(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const value = match ? match[1] : 'FFFFFF'
  const r = value.slice(0, 2)
  const g = value.slice(2, 4)
  const b = value.slice(4, 6)
  return `&H00${b}${g}${r}`.toUpperCase()
}

export function normalizeWord(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Decoupe un titre en 3 lignes maximum ; si le texte est trop long il est tronque proprement (jamais de 4e ligne).
export function wrapTitle(title: string, maxLines = 3, maxCharsPerLine = 24): string[] {
  const words = title.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxCharsPerLine || !current) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[.,;:!?…-]+$/, '')}…`
    return kept
  }
  return lines
}

function assTime(seconds: number): string {
  const total = Math.max(0, seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total - h * 3600 - m * 60
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`
}

function escapeAssText(text: string): string {
  return text.replace(/[{}\\]/g, '').replace(/\r?\n/g, ' ')
}

export interface AssInput {
  title: string
  // Mots en temps de CLIP (silences deja retires, voir timeline.ts).
  words: TimedWord[]
  durationSec: number
  titleStyle?: Partial<TitleStyle>
  subtitleStyle?: Partial<SubtitleStyle>
}

export function buildAss(input: AssInput): string {
  const title = { ...DEFAULT_TITLE_STYLE, ...input.titleStyle }
  const subs = { ...DEFAULT_SUBTITLE_STYLE, ...input.subtitleStyle }
  const keywords = new Set(subs.keywords.map(normalizeWord).filter(Boolean))

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Titre : blanc, contour noir, legere ombre, aligne en haut (Alignment 8) dans la bande noire.
    `Style: Title,${title.fontName},${title.fontSize},${hexToAss(title.color)},${hexToAss(title.color)},${hexToAss(title.outlineColor)},&H80000000,-1,0,0,0,100,100,0,0,1,4,3,8,50,50,40,1`,
    // Sous-titres : mot par mot, centres, au-dessus du bas de l'ecran (Alignment 2).
    `Style: Word,${subs.fontName},${subs.fontSize},${hexToAss(subs.color)},${hexToAss(subs.color)},${hexToAss(subs.outlineColor)},&H80000000,-1,0,0,0,100,100,0,0,1,7,3,2,40,40,${subs.marginBottom},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ]

  const events: string[] = []
  if (title.enabled && input.title.trim()) {
    const lines = wrapTitle(input.title, title.maxLines, title.maxCharsPerLine).map(escapeAssText)
    events.push(`Dialogue: 0,${assTime(0)},${assTime(input.durationSec)},Title,,0,0,0,,${lines.join('\\N')}`)
  }

  if (subs.enabled) {
    const words = input.words.filter(w => w.text.trim())
    words.forEach((word, i) => {
      const next = words[i + 1]
      // Le mot reste affiche jusqu'au suivant (pas de scintillement), 0,4 s maximum apres sa fin.
      const end = Math.min(input.durationSec, next ? Math.min(next.start, word.end + 0.4) : word.end + 0.4)
      if (end <= word.start) return
      const raw = escapeAssText(word.text)
      const text = subs.uppercase ? raw.toLocaleUpperCase('fr-FR') : raw
      const highlighted = keywords.has(normalizeWord(word.text))
      const styled = highlighted ? `{\\c${hexToAss(subs.highlightColor)}}${text}` : text
      events.push(`Dialogue: 1,${assTime(word.start)},${assTime(end)},Word,,0,0,0,,${styled}`)
    })
  }

  return [...header, ...events, ''].join('\n')
}
