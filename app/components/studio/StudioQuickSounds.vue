<script setup lang="ts">
// Etape 4 en petites questions : un son au debut du clip, a chaque illustration, a l'arrivee de l'avatar (seulement si ces elements
// sont actives dans le look), puis le volume. Les sons integres sont fabriques au rendu : ils ne s'ecoutent pas ici (sauf les tiens, a l'etape detaillee).
import { applySound, applyVolumePreset, soundOf, volumePresetOf, type QuickOption, type QuickQuestion, type SoundSituation } from '~~/server/utils/clipping/lookPresets'

defineProps<{ resume?: boolean }>()
const emit = defineEmits<{ (e: 'detailed'): void }>()
const studio = useStudio()
const detail = studio.detail

const soundOptions = computed<QuickOption[]>(() => {
  const d = detail.value
  if (!d) return []
  return [
    { value: 'none', label: 'Aucun' },
    ...d.sounds.builtin.map((s: { id: string, label: string }) => ({ value: s.id, label: s.label })),
    ...studio.assetsOf('sfx').map((a: { id: string, filename: string }) => ({ value: `asset:${a.id}`, label: a.filename, hint: 'Mon son' }))
  ]
})

const questions = computed<QuickQuestion[]>(() => {
  const d = detail.value
  if (!d) return []
  const s = d.style
  const list: QuickQuestion[] = [{ id: 'intro', label: 'Début du clip', text: 'Un petit son au début de chaque clip ?', options: soundOptions.value, current: soundOf(s, 'intro') }]
  if (s.illustrations.enabled) list.push({ id: 'illustration', label: 'Illustrations', text: 'Et quand une illustration apparaît en haut de l’écran ?', options: soundOptions.value, current: soundOf(s, 'illustration') })
  if (s.overlay.enabled) list.push({ id: 'avatar', label: 'Avatar', text: 'Et quand ton avatar apparaît ?', options: soundOptions.value, current: soundOf(s, 'avatar') })
  if (s.sfx.enabled) {
    list.push({
      id: 'volume', label: 'Volume', text: 'Les sons doivent être plus ou moins forts ?', current: volumePresetOf(s),
      options: [{ value: 'soft', label: 'Discrets' }, { value: 'normal', label: 'Normaux' }, { value: 'loud', label: 'Forts' }]
    })
  }
  return list
})

function onPick(id: string, value: string) {
  const d = detail.value
  if (!d) return
  if (id === 'volume') applyVolumePreset(d.style, value as 'soft' | 'normal' | 'loud')
  else applySound(d.style, id as SoundSituation, value)
}
</script>

<template>
  <StudioQuickFlow
    :questions="questions"
    :resume="resume"
    done-text="C’est noté. Les sons sont ajoutés quand le clip est fabriqué : tu les entendras dans ton premier lot."
    @pick="onPick"
    @defaults="studio.advance('done')"
    @detailed="emit('detailed')"
  />
</template>
