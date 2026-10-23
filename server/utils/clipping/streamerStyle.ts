import { z } from 'zod'
import { DEFAULT_RENDER_STYLE } from './clipRender.ts'
import type { OverlaySpec, RenderStyleOptions } from './clipRender.ts'
import { DEFAULT_SUBTITLE_STYLE, DEFAULT_TITLE_STYLE } from './assBuilder.ts'
import type { SubtitleStyle, TitleStyle } from './assBuilder.ts'

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur au format #RRGGBB')
const fontName = z.string().trim().min(1).max(60).regex(/^[\p{L}\p{N} _-]+$/u, 'Nom de police invalide')
const fraction = z.number().min(0).max(1)
const assetId = z.string().uuid().nullable().default(null)

// Direction artistique modifiable depuis le back-office. Toute valeur absente prend la valeur par defaut.
export const styleSchema = z.object({
  title: z.object({
    enabled: z.boolean().default(DEFAULT_TITLE_STYLE.enabled),
    fontName: fontName.default(DEFAULT_TITLE_STYLE.fontName),
    fontSize: z.number().int().min(30).max(120).default(DEFAULT_TITLE_STYLE.fontSize),
    color: hex.default(DEFAULT_TITLE_STYLE.color),
    maxLines: z.number().int().min(1).max(3).default(3)
  }).prefault({}),
  subtitles: z.object({
    enabled: z.boolean().default(DEFAULT_SUBTITLE_STYLE.enabled),
    fontName: fontName.default(DEFAULT_SUBTITLE_STYLE.fontName),
    fontSize: z.number().int().min(40).max(160).default(DEFAULT_SUBTITLE_STYLE.fontSize),
    color: hex.default(DEFAULT_SUBTITLE_STYLE.color),
    highlightColor: hex.default(DEFAULT_SUBTITLE_STYLE.highlightColor),
    uppercase: z.boolean().default(DEFAULT_SUBTITLE_STYLE.uppercase),
    // Mots mis en couleur en plus des mots-cles du chat.
    keywords: z.array(z.string().trim().min(1).max(40)).max(50).default([])
  }).prefault({}),
  zoomIntro: z.object({
    enabled: z.boolean().default(DEFAULT_RENDER_STYLE.zoomIntro.enabled),
    amount: z.number().min(0).max(0.4).default(DEFAULT_RENDER_STYLE.zoomIntro.amount),
    durationSec: z.number().min(0.2).max(2).default(DEFAULT_RENDER_STYLE.zoomIntro.durationSec)
  }).prefault({}),
  sfx: z.object({
    enabled: z.boolean().default(true),
    volume: z.number().min(0).max(1).default(DEFAULT_RENDER_STYLE.sfx.volume),
    // Fichier SFX du streamer ; null = bruit de vent synthetise.
    assetId
  }).prefault({}),
  framing: z.object({
    centerX: fraction.default(0.5),
    centerY: fraction.default(0.5),
    zoom: z.number().min(1).max(3).default(1)
  }).prefault({}),
  overlay: z.object({
    enabled: z.boolean().default(false),
    assetId,
    x: z.number().int().min(0).max(1080).default(800),
    y: z.number().int().min(0).max(1920).default(1500),
    width: z.number().int().min(40).max(600).default(200),
    // 'always' ; 'intro' (3 premieres secondes) ; 'outro' (3 dernieres secondes)
    appear: z.enum(['always', 'intro', 'outro']).default('always')
  }).prefault({}),
  // Noms propres a ecrire exactement (controle qualite).
  names: z.array(z.string().trim().min(2).max(60)).max(100).default([]),
  // Illustrations en ecran scinde (dossier d'illustrations du streamer).
  illustrations: z.object({
    enabled: z.boolean().default(true),
    maxPerClip: z.number().int().min(0).max(4).default(2)
  }).prefault({})
})

export type StreamerStyleConfig = z.infer<typeof styleSchema>

export function parseStyle(input: unknown): StreamerStyleConfig {
  return styleSchema.parse(input ?? {})
}

export const defaultStyle = (): StreamerStyleConfig => parseStyle({})

export interface StyleAssets {
  sfxPath?: string
  overlayPath?: string
  overlayAnimated?: boolean
}

export interface ResolvedStyle {
  title: Partial<TitleStyle>
  subtitles: Partial<SubtitleStyle>
  render: RenderStyleOptions
  names: string[]
  illustrationsEnabled: boolean
  maxIllustrations: number
}

// Convertit la DA du streamer (et ses reglages de base : couleurs, mots-cles) en options de rendu.
export function resolveStyle(
  config: StreamerStyleConfig,
  settings: { accentColor: string, highlightColor: string, subtitles: boolean, keywords: string[] },
  assets: StyleAssets,
  clipDurationSec: number
): ResolvedStyle {
  const overlay: OverlaySpec | undefined = config.overlay.enabled && assets.overlayPath
    ? {
        path: assets.overlayPath,
        x: config.overlay.x,
        y: config.overlay.y,
        width: config.overlay.width,
        animated: assets.overlayAnimated ?? false,
        windows: config.overlay.appear === 'always' ? []
          : config.overlay.appear === 'intro' ? [{ start: 0, end: Math.min(3, clipDurationSec) }]
            : [{ start: Math.max(0, clipDurationSec - 3), end: clipDurationSec }]
      }
    : undefined

  return {
    title: { enabled: config.title.enabled, fontName: config.title.fontName, fontSize: config.title.fontSize, color: settings.accentColor || config.title.color, maxLines: config.title.maxLines },
    subtitles: {
      enabled: config.subtitles.enabled && settings.subtitles,
      fontName: config.subtitles.fontName,
      fontSize: config.subtitles.fontSize,
      color: config.subtitles.color,
      highlightColor: settings.highlightColor || config.subtitles.highlightColor,
      uppercase: config.subtitles.uppercase,
      keywords: [...new Set([...settings.keywords, ...config.subtitles.keywords])]
    },
    render: {
      ...DEFAULT_RENDER_STYLE,
      zoomIntro: config.zoomIntro,
      sfx: { enabled: config.sfx.enabled, volume: config.sfx.volume, path: assets.sfxPath },
      framing: config.framing,
      overlay
    },
    names: config.names,
    illustrationsEnabled: config.illustrations.enabled,
    maxIllustrations: config.illustrations.maxPerClip
  }
}
