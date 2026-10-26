import { z } from 'zod'
import { DEFAULT_RENDER_STYLE } from './clipRender.ts'
import type { OverlaySpec, RenderStyleOptions, SoundRef } from './clipRender.ts'
import { DEFAULT_SUBTITLE_STYLE, DEFAULT_TITLE_STYLE } from './assBuilder.ts'
import type { SubtitleStyle, TitleStyle } from './assBuilder.ts'
import { ASSET_SOUND, isBuiltinSound } from './sounds.ts'
import type { BuiltinSound } from './sounds.ts'

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur au format #RRGGBB')
const fontName = z.string().trim().min(1).max(60).regex(/^[\p{L}\p{N} _-]+$/u, 'Nom de police invalide')
const fraction = z.number().min(0).max(1)
const assetId = z.string().uuid().nullable().default(null)

// Bruitage : un son integre ("wind", "whoosh"...) ou un fichier SFX du streamer ("asset:<id>").
const sound = z.string().refine(value => isBuiltinSound(value) || ASSET_SOUND.test(value), 'Bruitage inconnu')
const trigger = (enabled: boolean, defaultSound: BuiltinSound) =>
  z.object({ enabled: z.boolean().default(enabled), sound: sound.default(defaultSound) }).prefault({})

// Ancien format : un seul fichier SFX (`sfx.assetId`) joue au debut du clip.
function migrateLegacy(input: unknown): unknown {
  const sfx = (input as { sfx?: Record<string, unknown> } | null)?.sfx
  if (!sfx || typeof sfx.assetId !== 'string' || sfx.intro) return input
  return { ...(input as object), sfx: { ...sfx, intro: { enabled: sfx.enabled ?? true, sound: `asset:${sfx.assetId}` } } }
}

// Direction artistique modifiable depuis le back-office. Toute valeur absente prend la valeur par defaut.
const baseStyleSchema = z.object({
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
    // Interrupteur general des bruitages ; chaque situation a ensuite son propre interrupteur et son propre son.
    enabled: z.boolean().default(true),
    volume: z.number().min(0).max(1).default(DEFAULT_RENDER_STYLE.sfx.volume),
    intro: trigger(true, 'wind'),
    illustration: trigger(false, 'whoosh'),
    avatar: trigger(false, 'pop')
  }).prefault({}),
  framing: z.object({
    // Cadrage automatique par reconnaissance du visage (photos du streamer) ; le cadrage manuel sert de repli.
    auto: z.boolean().default(false),
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

export const styleSchema = z.preprocess(migrateLegacy, baseStyleSchema)

export type StreamerStyleConfig = z.infer<typeof baseStyleSchema>

// Identifiants des fichiers SFX references par la DA (a verifier : ils doivent appartenir au streamer).
export function referencedSoundAssets(config: StreamerStyleConfig): string[] {
  const ids = [config.sfx.intro.sound, config.sfx.illustration.sound, config.sfx.avatar.sound]
    .map(value => ASSET_SOUND.exec(value)?.[1])
    .filter((id): id is string => Boolean(id))
  return [...new Set(ids)]
}

export function parseStyle(input: unknown): StreamerStyleConfig {
  return styleSchema.parse(input ?? {})
}

export const defaultStyle = (): StreamerStyleConfig => parseStyle({})

export interface StyleAssets {
  // Chemins des fichiers SFX du streamer, par identifiant d'asset.
  sfxPaths?: Record<string, string>
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

// Situation desactivee, ou fichier supprime / hors du dossier du streamer : pas de bruitage (jamais d'erreur de rendu).
function soundRef(rule: { enabled: boolean, sound: string }, assets: StyleAssets): SoundRef | undefined {
  if (!rule.enabled) return undefined
  if (isBuiltinSound(rule.sound)) return { builtin: rule.sound }
  const id = ASSET_SOUND.exec(rule.sound)?.[1]
  const path = id ? assets.sfxPaths?.[id] : undefined
  return path ? { path } : undefined
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
      sfx: {
        enabled: config.sfx.enabled,
        volume: config.sfx.volume,
        rules: {
          intro: soundRef(config.sfx.intro, assets),
          illustration: soundRef(config.sfx.illustration, assets),
          avatar: soundRef(config.sfx.avatar, assets)
        }
      },
      framing: config.framing,
      overlay
    },
    names: config.names,
    illustrationsEnabled: config.illustrations.enabled,
    maxIllustrations: config.illustrations.maxPerClip
  }
}
