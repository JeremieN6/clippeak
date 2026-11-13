<script setup lang="ts">
// Barre du haut de la landing : logo, liens et bouton de connexion sur grand ecran ; sur telephone, le bouton de connexion reste visible
// et les liens passent dans un panneau (bouton menu >= 44 px, fermeture par Echap, par un clic dehors ou sur un lien, defilement fige).
const props = defineProps<{
  links: Array<{ href: string; label: string }>
  primaryHref: string
}>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const toggler = ref<HTMLButtonElement | null>(null)
const panelId = 'landing-menu'

const close = (focusButton = false) => {
  open.value = false
  if (focusButton) toggler.value?.focus()
}
// composedPath et non target : l'icone du bouton change pendant le clic, et sa cible n'est plus dans la page quand ce gestionnaire s'execute.
const away = (e: MouseEvent) => { if (open.value && root.value && !e.composedPath().includes(root.value)) close() }
const esc = (e: KeyboardEvent) => { if (open.value && e.key === 'Escape') close(true) }
// Au-dessus du point de bascule le panneau n'existe plus : on le referme pour ne pas garder le defilement fige.
const wide = (e: MediaQueryListEvent) => { if (e.matches) close() }

let query: MediaQueryList | null = null
onMounted(() => {
  document.addEventListener('click', away)
  document.addEventListener('keydown', esc)
  query = window.matchMedia('(min-width: 1024px)')
  query.addEventListener('change', wide)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', away)
  document.removeEventListener('keydown', esc)
  query?.removeEventListener('change', wide)
  document.body.style.overflow = ''
})
watch(open, (on) => { document.body.style.overflow = on ? 'hidden' : '' })
</script>

<template>
  <header ref="root" class="sticky top-3 z-30 mb-8 sm:top-4">
    <div class="rounded-2xl border border-white/10 bg-black/60 px-3 backdrop-blur-lg sm:px-6">
      <div class="flex min-h-16 items-center justify-between gap-3">
        <NuxtLink to="/" class="flex min-h-11 items-center gap-2.5 no-underline" aria-label="Clippeak, accueil" @click="close()">
          <BrandMark class="h-9 w-9" />
          <span class="font-display text-lg font-bold">Clippeak</span>
        </NuxtLink>

        <nav class="hidden items-center gap-1 lg:flex" aria-label="Navigation principale">
          <a
            v-for="link in props.links"
            :key="link.href"
            :href="link.href"
            class="inline-flex h-11 items-center rounded-[10px] px-3.5 text-sm font-semibold text-white/80 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clippeak-violetLight"
          >
            {{ link.label }}
          </a>
        </nav>

        <div class="flex items-center gap-2">
          <a
            :href="props.primaryHref"
            class="inline-flex h-11 items-center whitespace-nowrap rounded-[10px] bg-clippeak-violet px-3.5 text-sm font-bold transition sm:px-4 hover:bg-clippeak-violetLight focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clippeak-violetLight"
          >
            Se connecter
          </a>

          <button
            ref="toggler"
            type="button"
            class="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-white/15 bg-white/5 text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clippeak-violetLight lg:hidden"
            :class="open ? '!border-clippeak-violetLight' : ''"
            :aria-expanded="open"
            :aria-controls="panelId"
            :aria-label="open ? 'Fermer le menu' : 'Ouvrir le menu'"
            @click="open = !open"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path v-if="!open" d="M4 7h16M4 12h16M4 17h16" />
              <path v-else d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="-translate-y-2 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="-translate-y-2 opacity-0"
    >
      <nav
        v-if="open"
        :id="panelId"
        aria-label="Navigation principale"
        class="absolute inset-x-0 top-[calc(100%+8px)] max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl border border-white/15 bg-clippeak-surface p-2 shadow-[0_16px_40px_rgba(0,0,0,.55)] lg:hidden"
      >
        <a
          v-for="link in props.links"
          :key="link.href"
          :href="link.href"
          class="flex min-h-12 items-center justify-between rounded-xl px-4 text-[15px] font-semibold text-white/90 transition hover:bg-white/5 active:bg-white/10"
          @click="close()"
        >
          {{ link.label }}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="text-white/40" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </a>
      </nav>
    </Transition>

    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 -z-10 bg-black/50 lg:hidden" aria-hidden="true" @click="close()" />
    </Transition>
  </header>
</template>
