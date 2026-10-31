// Reponses « en un clic » de l'onboarding en petites questions : chaque reponse regle plusieurs valeurs du style d'un coup.
// Regles pures et testees ; elles ne touchent qu'aux champs qu'elles annoncent (jamais aux polices, couleurs de titre, cadrage, avatar...).
// Les bornes respectent celles de `streamerStyle.ts` (titre 30-120 px sur 1 a 3 lignes, zoom d'ouverture 0 a 0,4).

// Types des petites questions (affichees par StudioQuickFlow.vue) : definis ici pour etre importables sans passer par un composant.
export interface QuickOption { value: string, label: string, hint?: string, color?: string }
export interface QuickQuestion { id: string, label: string, text: string, options: QuickOption[], current: string | null }

export type TitlePreset = 'big' | 'mid' | 'small' | 'none'
export type SubtitlePreset = 'color' | 'plain' | 'none'
export type ZoomPreset = 'strong' | 'light' | 'none'
export type SplitPreset = 'auto' | 'off'

export const TITLE_PRESETS: Record<Exclude<TitlePreset, 'none'>, { fontSize: number, maxLines: number }> = {
  big: { fontSize: 90, maxLines: 2 }, // gros et punchy : peu de mots, grande taille
  mid: { fontSize: 68, maxLines: 3 }, // equilibre : le reglage d'origine
  small: { fontSize: 54, maxLines: 3 } // discret : plus de place pour le texte
}
export const ZOOM_PRESETS: Record<Exclude<ZoomPreset, 'none'>, number> = { strong: 0.25, light: 0.12 }
export const ACCENT_COLORS: Array<{ value: string, label: string }> = [
  { value: '#FFD400', label: 'Jaune' }, { value: '#FF4D8D', label: 'Rose' }, { value: '#3DDC97', label: 'Vert' }, { value: '#4DA3FF', label: 'Bleu' }, { value: '#FFFFFF', label: 'Blanc' }
]

interface LookStyle {
  title: { enabled: boolean, fontSize: number, maxLines: number }
  subtitles: { enabled: boolean, autoEmphasis: 'off' | 'low' | 'normal' | 'high' }
  zoomIntro: { enabled: boolean, amount: number }
  layout?: { split?: 'auto' | 'off' }
}

export function applyTitlePreset(style: LookStyle, preset: TitlePreset): void {
  if (preset === 'none') { style.title.enabled = false; return }
  style.title.enabled = true
  style.title.fontSize = TITLE_PRESETS[preset].fontSize
  style.title.maxLines = TITLE_PRESETS[preset].maxLines
}

// Preset correspondant au style actuel, ou null si le reglage a ete fait a la main (« Reglages detailles »).
export function titlePresetOf(style: LookStyle): TitlePreset | null {
  if (!style.title.enabled) return 'none'
  for (const key of Object.keys(TITLE_PRESETS) as Array<keyof typeof TITLE_PRESETS>) {
    if (TITLE_PRESETS[key].fontSize === style.title.fontSize && TITLE_PRESETS[key].maxLines === style.title.maxLines) return key
  }
  return null
}

export function applySubtitlePreset(style: LookStyle, preset: SubtitlePreset): void {
  if (preset === 'none') { style.subtitles.enabled = false; return }
  style.subtitles.enabled = true
  style.subtitles.autoEmphasis = preset === 'color' ? 'normal' : 'off'
}

export function subtitlePresetOf(style: LookStyle): SubtitlePreset | null {
  if (!style.subtitles.enabled) return 'none'
  if (style.subtitles.autoEmphasis === 'off') return 'plain'
  if (style.subtitles.autoEmphasis === 'normal') return 'color'
  return null
}

export function applyZoomPreset(style: LookStyle, preset: ZoomPreset): void {
  if (preset === 'none') { style.zoomIntro.enabled = false; return }
  style.zoomIntro.enabled = true
  style.zoomIntro.amount = ZOOM_PRESETS[preset]
}

export function zoomPresetOf(style: LookStyle): ZoomPreset | null {
  if (!style.zoomIntro.enabled) return 'none'
  if (style.zoomIntro.amount === ZOOM_PRESETS.strong) return 'strong'
  if (style.zoomIntro.amount === ZOOM_PRESETS.light) return 'light'
  return null
}

// La couleur du mot mis en valeur n'a de sens que si les sous-titres existent ET que des mots sont mis en valeur.
export const asksAccentColor = (style: LookStyle): boolean => style.subtitles.enabled && style.subtitles.autoEmphasis !== 'off'

export function applySplitPreset(style: LookStyle, preset: SplitPreset): void {
  style.layout = { split: preset }
}
export const splitPresetOf = (style: LookStyle): SplitPreset => style.layout?.split === 'off' ? 'off' : 'auto'

// Sons : reponse « Aucun » = situation coupee ; sinon situation activee avec ce son. L'interrupteur general suit : allume des qu'un son est choisi.
interface SoundStyle {
  sfx: { enabled: boolean, volume: number } & Record<'intro' | 'illustration' | 'avatar', { enabled: boolean, sound: string }>
}
export type SoundSituation = 'intro' | 'illustration' | 'avatar'
export const VOLUME_PRESETS: Record<'soft' | 'normal' | 'loud', number> = { soft: 0.3, normal: 0.6, loud: 1 }

export function applySound(style: SoundStyle, situation: SoundSituation, sound: string | 'none'): void {
  if (sound === 'none') {
    style.sfx[situation].enabled = false
    if (!(['intro', 'illustration', 'avatar'] as const).some(s => style.sfx[s].enabled)) style.sfx.enabled = false
    return
  }
  style.sfx[situation].enabled = true
  style.sfx[situation].sound = sound
  style.sfx.enabled = true
}
export const soundOf = (style: SoundStyle, situation: SoundSituation): string => style.sfx.enabled && style.sfx[situation].enabled ? style.sfx[situation].sound : 'none'

export function applyVolumePreset(style: SoundStyle, preset: keyof typeof VOLUME_PRESETS): void {
  style.sfx.volume = VOLUME_PRESETS[preset]
}
export function volumePresetOf(style: SoundStyle): keyof typeof VOLUME_PRESETS | null {
  for (const key of Object.keys(VOLUME_PRESETS) as Array<keyof typeof VOLUME_PRESETS>) if (Math.abs(VOLUME_PRESETS[key] - style.sfx.volume) < 0.01) return key
  return null
}
