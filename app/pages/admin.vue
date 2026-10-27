<script setup lang="ts">
// Administration de Clippeak : page non liee depuis le site, on y arrive en tapant /admin. Le mot de passe est verifie une fois
// puis remplace par un cookie de session (12 h). Elle regroupe : le studio de demonstration, les invitations et les feedbacks.
// Le studio (/studio) reste l'espace des streamers : ici on gere, la-bas on essaie.
useHead({ title: 'Administration Clippeak', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

const admin = createAdmin()
const { authed, checking, password, error, notice, busy } = admin
const tab = ref<'studio' | 'invites' | 'feedback'>('studio')
const tabs = [
  { id: 'studio', label: 'Studio' },
  { id: 'invites', label: 'Invitations' },
  { id: 'feedback', label: 'Feedbacks' }
] as const

onMounted(() => admin.restore())
</script>

<template>
  <div class="st-root min-h-screen bg-[#0E0D12]">
    <header class="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[#2C2837] px-5 py-2 sm:px-8">
      <div class="flex items-center gap-2.5">
        <span class="flex h-8 w-8 items-center justify-center rounded-full bg-[#7C3AED] text-xs font-extrabold text-white" aria-hidden="true">CP</span>
        <span class="st-title text-lg font-bold">Clippeak</span>
        <span class="st-badge st-badge-neutral">Administration</span>
      </div>
      <button v-if="authed" type="button" class="st-btn-quiet" :disabled="busy" @click="admin.logout()">Se déconnecter</button>
    </header>

    <div v-if="error || notice" class="mx-auto max-w-[900px] px-5 pt-4 sm:px-8">
      <p v-if="error" class="st-alert st-alert-error m-0" role="alert">{{ error }}</p>
      <p v-else class="st-alert st-alert-ok m-0" role="status">{{ notice }}</p>
    </div>

    <main v-if="!authed" class="mx-auto flex max-w-md flex-col gap-6 px-5 py-16">
      <template v-if="!checking">
        <h1 class="st-title m-0 text-3xl font-bold">Administration</h1>
        <form class="flex flex-col gap-3" @submit.prevent="admin.login()">
          <label for="admin-password" class="st-label">Mot de passe</label>
          <input id="admin-password" v-model="password" type="password" autocomplete="current-password" class="st-field">
          <button type="submit" class="st-btn" :disabled="busy || !password">Entrer</button>
        </form>
      </template>
    </main>

    <main v-else class="mx-auto flex max-w-[900px] flex-col gap-6 px-5 py-8 sm:px-8">
      <nav class="flex flex-wrap gap-2" aria-label="Sections de l’administration">
        <button
          v-for="t in tabs" :key="t.id" type="button" :class="tab === t.id ? 'st-btn' : 'st-btn-ghost'"
          :aria-pressed="tab === t.id" @click="tab = t.id"
        >{{ t.label }}</button>
      </nav>
      <AdminChannels v-if="tab === 'studio'" :admin="admin" />
      <AdminInvites v-else-if="tab === 'invites'" :admin="admin" />
      <AdminFeedback v-else />
    </main>
  </div>
</template>
