<script setup lang="ts">
// Panneau « Detail du clip » (maquette) : a droite de l'ecran, avec la fiche complete du clip (titre, legende, pourquoi cette note, alertes,
// publication). Se ferme avec la croix, la touche Echap ou un clic a cote ; le focus y entre et revient au bouton qui l'a ouvert.
const props = defineProps<{ clip: StudioClip }>()
const emit = defineEmits<{ close: [] }>()

const panel = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
let opener: HTMLElement | null = null
let previousOverflow = ''

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.stopPropagation(); emit('close') }
  // Le focus reste dans le panneau.
  if (e.key === 'Tab' && panel.value) {
    const items = [...panel.value.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
}

onMounted(() => {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  document.addEventListener('keydown', onKey)
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  nextTick(() => closeButton.value?.focus())
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = previousOverflow
  opener?.focus?.()
})
</script>

<template>
  <div class="fixed inset-0 z-50 flex justify-end">
    <button type="button" class="flex-1 cursor-default border-0 bg-[rgba(5,4,8,.66)]" aria-label="Fermer le détail" tabindex="-1" @click="emit('close')" />
    <div ref="panel" role="dialog" aria-modal="true" aria-label="Détail du clip" class="h-full w-full max-w-[560px] flex-none overflow-y-auto border-l border-st-borderStrong bg-st-bg">
      <div class="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-st-border bg-st-bg py-2 pl-5 pr-2">
        <span class="st-title text-lg font-bold">Détail du clip</span>
        <button ref="closeButton" type="button" class="flex h-11 w-11 items-center justify-center rounded-[10px] border-0 bg-transparent text-st-muted hover:text-st-text" aria-label="Fermer" @click="emit('close')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div class="p-4">
        <StudioClipCard :clip="props.clip" stacked />
      </div>
    </div>
  </div>
</template>
