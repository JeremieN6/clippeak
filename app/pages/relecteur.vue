<script setup lang="ts">
// Entree de l'equipe de relecture de Meta (revue de l'application) : un code ouvre le studio sur une chaine d'exemple.
// La page ne dit rien de plus que necessaire ; sans code configure sur le serveur, la connexion repond 404.
useHead({ title: 'Reviewer access - Clippeak', meta: [{ name: 'robots', content: 'noindex' }] })

const code = ref('')
const error = ref('')
const busy = ref(false)

async function enter() {
  if (!code.value.trim() || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/relecteur', { method: 'POST', body: { code: code.value } })
    await navigateTo('/studio', { external: true })
  } catch (e) {
    const status = (e as { statusCode?: number, status?: number }).statusCode ?? (e as { status?: number }).status
    error.value = status === 429 ? 'Too many attempts. Try again in a minute.' : 'This code is not valid.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="st-root min-h-screen bg-st-bg">
    <header class="flex min-h-16 items-center border-b border-st-border px-5 py-2 sm:px-8">
      <span class="flex items-center gap-2.5">
        <BrandMark class="h-8 w-8" />
        <span class="st-title text-lg font-bold">Clippeak</span>
      </span>
    </header>
    <main class="mx-auto flex max-w-md flex-col gap-6 px-5 py-16">
      <div class="flex flex-col gap-2">
        <h1 class="st-title m-0 text-3xl font-bold">Reviewer access</h1>
        <p class="m-0 text-sm leading-relaxed st-muted">Clippeak is invitation-only. Enter the access code given in the review instructions to open the studio on an example channel.</p>
      </div>
      <p v-if="error" class="st-alert st-alert-warn m-0" role="alert">{{ error }}</p>
      <form class="flex flex-col gap-3" @submit.prevent="enter">
        <label class="flex flex-col gap-1.5">
          <span class="st-label">Access code</span>
          <input v-model="code" type="password" autocomplete="off" class="st-field" maxlength="200">
        </label>
        <button type="submit" class="st-btn st-btn-lg" :disabled="busy || !code.trim()">Open the studio</button>
      </form>
    </main>
  </div>
</template>
