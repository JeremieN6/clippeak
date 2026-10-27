<script setup lang="ts">
// Page de connexion ou d'inscription : le meme bouton « Twitch », car le compte se cree a la premiere connexion (sur invitation).
// Un streamer deja connecte est renvoye directement vers /studio.
const props = defineProps<{ mode: 'connexion' | 'inscription' }>()
const signup = computed(() => props.mode === 'inscription')

useHead({ title: signup.value ? 'Inscription Clippeak' : 'Connexion Clippeak', meta: [{ name: 'robots', content: 'noindex' }] })

const route = useRoute()
const messages: Record<string, string> = {
  refused: 'Cette chaîne Twitch n’est pas encore invitée. Clippeak est en accès sur invitation : demande à être invité.',
  error: 'La connexion avec Twitch a échoué. Réessaie dans un instant.',
  cancelled: 'Connexion annulée.'
}
const message = computed(() => messages[String(route.query.login ?? '')] ?? '')
const checking = ref(true)

onMounted(async () => {
  try {
    await $fetch('/api/auth/me')
    await navigateTo('/studio', { replace: true })
  } catch {
    checking.value = false
  }
})
</script>

<template>
  <div class="st-root min-h-screen bg-[#0E0D12]">
    <header class="flex min-h-16 items-center justify-between gap-4 border-b border-[#2C2837] px-5 py-2 sm:px-8">
      <NuxtLink to="/" class="flex items-center gap-2.5 no-underline">
        <span class="flex h-8 w-8 items-center justify-center rounded-full bg-[#7C3AED] text-xs font-extrabold text-white" aria-hidden="true">CP</span>
        <span class="st-title text-lg font-bold">Clippeak</span>
      </NuxtLink>
    </header>

    <main class="mx-auto flex max-w-md flex-col gap-6 px-5 py-16">
      <template v-if="!checking">
        <div class="flex flex-col gap-2">
          <h1 class="st-title m-0 text-3xl font-bold">{{ signup ? 'Créer mon compte' : 'Connexion' }}</h1>
          <p class="m-0 text-sm leading-relaxed st-muted">
            {{ signup
              ? 'Clippeak est en accès sur invitation. Si ta chaîne Twitch est invitée, ton compte est créé dès que tu te connectes avec Twitch.'
              : 'Connecte-toi avec ton compte Twitch pour régler ton look et valider tes clips. Rien n’est publié sans ton accord.' }}
          </p>
        </div>

        <p v-if="message" class="st-alert st-alert-warn m-0" role="alert">{{ message }}</p>

        <a href="/api/auth/twitch" class="st-btn st-btn-lg w-full !bg-[#9146FF] no-underline hover:!bg-[#A970FF]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.3 3 3 6.4V19h4.3v2.3H10L12.3 19h3.4L21 13.7V3H4.3zm14.9 9.7-3 3h-4.4l-2.3 2.3v-2.3H7.3V4.7h11.9v8zM16.4 7.4h-1.7v4.7h1.7V7.4zm-4.5 0h-1.7v4.7h1.7V7.4z" /></svg>
          {{ signup ? 'S’inscrire avec Twitch' : 'Se connecter avec Twitch' }}
        </a>
        <p class="m-0 text-[13px] leading-5 st-muted">Clippeak lit seulement ton pseudo et ton identifiant Twitch. Aucune permission supplémentaire n’est demandée, et on ne publie rien sur ta chaîne.</p>

        <p class="m-0 border-t border-[#2C2837] pt-5 text-sm st-muted">
          <template v-if="signup">Déjà un compte ? <NuxtLink to="/connexion" class="font-semibold">Se connecter</NuxtLink></template>
          <template v-else>Pas encore de compte ? <NuxtLink to="/inscription" class="font-semibold">S’inscrire</NuxtLink></template>
        </p>
      </template>
    </main>
  </div>
</template>
