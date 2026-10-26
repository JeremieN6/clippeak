// Bruitages synthetises par ffmpeg (aucun fichier a fournir) ; les fichiers SFX du streamer s'y ajoutent ("asset:<id>").
export const BUILTIN_SOUNDS = [
  { id: 'wind', label: 'Bruit de vent' },
  { id: 'whoosh', label: 'Whoosh (passage rapide)' },
  { id: 'pop', label: 'Pop' },
  { id: 'ding', label: 'Ding (notification)' },
  { id: 'impact', label: 'Impact grave' }
] as const

export type BuiltinSound = typeof BUILTIN_SOUNDS[number]['id']

export const isBuiltinSound = (value: string): value is BuiltinSound => BUILTIN_SOUNDS.some(s => s.id === value)

export const ASSET_SOUND = /^asset:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

// Situations ou un bruitage peut etre joue.
export const SOUND_SITUATIONS = [
  { id: 'intro', label: 'Au debut du clip (avec le zoom d\'ouverture)' },
  { id: 'illustration', label: 'A chaque apparition d\'une illustration' },
  { id: 'avatar', label: 'A l\'apparition de l\'avatar' }
] as const

export type SoundSituation = typeof SOUND_SITUATIONS[number]['id']

// Source ffmpeg (filtre sans entree) de chaque bruitage integre, 48 kHz.
export const BUILTIN_SYNTH: Record<BuiltinSound, string> = {
  wind: 'anoisesrc=d=0.9:c=pink:a=0.5:r=48000,lowpass=f=1400,afade=t=in:d=0.25,afade=t=out:st=0.5:d=0.4',
  whoosh: 'anoisesrc=d=0.6:c=white:a=0.4:r=48000,highpass=f=400,lowpass=f=5000,afade=t=in:d=0.3,afade=t=out:st=0.3:d=0.3',
  pop: 'sine=f=800:r=48000:d=0.15,volume=4,afade=t=out:st=0.02:d=0.13',
  ding: 'sine=f=1318:r=48000:d=0.8,volume=4,afade=t=out:st=0.05:d=0.75',
  impact: 'sine=f=55:r=48000:d=0.6,volume=6,afade=t=out:st=0.05:d=0.55'
}
