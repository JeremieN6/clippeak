<script setup lang="ts">
// Etape 3 en petites questions : titre, sous-titres, couleur du mot mis en valeur, zoom d'ouverture, ecran partage. Chaque reponse regle
// le style tout de suite (l'apercu a droite bouge) ; l'enregistrement se fait au « Continuer » de la barre du bas, comme avant.
// Cadrage, polices, avatar et illustrations restent dans les « Reglages detailles ».
import {
  ACCENT_COLORS, applySplitPreset, applySubtitlePreset, applyTitlePreset, applyZoomPreset, asksAccentColor,
  splitPresetOf, subtitlePresetOf, titlePresetOf, zoomPresetOf,
  type QuickQuestion, type SplitPreset, type SubtitlePreset, type TitlePreset, type ZoomPreset
} from '~~/server/utils/clipping/lookPresets'

defineProps<{ resume?: boolean }>()
const emit = defineEmits<{ (e: 'detailed'): void }>()
const studio = useStudio()
const detail = studio.detail

const questions = computed<QuickQuestion[]>(() => {
  const d = detail.value
  if (!d) return []
  const s = d.style
  const list: QuickQuestion[] = [
    {
      id: 'title', label: 'Titre', text: 'Comment tu veux le titre de tes clips ?', current: titlePresetOf(s),
      options: [{ value: 'big', label: 'Gros et punchy', hint: 'Peu de mots, grand' }, { value: 'mid', label: 'Équilibré' }, { value: 'small', label: 'Discret', hint: 'Plus de place pour le texte' }, { value: 'none', label: 'Sans titre' }]
    },
    {
      id: 'subs', label: 'Sous-titres', text: 'Des sous-titres, mot par mot ?', current: subtitlePresetOf(s),
      options: [{ value: 'color', label: 'Oui, avec des mots en couleur', hint: 'Je mets en valeur les mots importants' }, { value: 'plain', label: 'Oui, sans couleur' }, { value: 'none', label: 'Non' }]
    }
  ]
  if (asksAccentColor(s)) {
    list.push({
      id: 'color', label: 'Couleur', text: 'Quelle couleur pour les mots mis en valeur ?', current: (d.settings?.highlightColor ?? '').toUpperCase() || null,
      options: ACCENT_COLORS.map(c => ({ value: c.value, label: c.label, color: c.value }))
    })
  }
  list.push(
    {
      id: 'zoom', label: 'Zoom', text: 'Un petit zoom au tout début du clip ?', current: zoomPresetOf(s),
      options: [{ value: 'strong', label: 'Oui, marqué' }, { value: 'light', label: 'Oui, léger' }, { value: 'none', label: 'Non' }]
    },
    {
      id: 'split', label: 'Écran partagé', text: 'Si ta caméra est dans un coin de l’écran, je montre ce que tu regardes en haut et toi en bas ?', current: splitPresetOf(s),
      options: [{ value: 'auto', label: 'Oui, automatiquement' }, { value: 'off', label: 'Non, plein écran' }]
    }
  )
  return list
})

function onPick(id: string, value: string) {
  const d = detail.value
  if (!d) return
  if (id === 'title') applyTitlePreset(d.style, value as TitlePreset)
  else if (id === 'subs') applySubtitlePreset(d.style, value as SubtitlePreset)
  else if (id === 'color' && d.settings) d.settings.highlightColor = value
  else if (id === 'zoom') applyZoomPreset(d.style, value as ZoomPreset)
  else if (id === 'split') applySplitPreset(d.style, value as SplitPreset)
}
</script>

<template>
  <StudioQuickFlow
    :questions="questions"
    :resume="resume"
    done-text="C’est réglé. Tu peux continuer : le cadrage, l’avatar et les illustrations se règlent à part, quand tu veux."
    @pick="onPick"
    @defaults="studio.advance('done')"
    @detailed="emit('detailed')"
  />
</template>
