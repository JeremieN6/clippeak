<script setup lang="ts">
// Back-office du streamer : parcours guide en 8 etapes (reglages) puis tableau de bord de contenu (lots a valider).
// Le mot de passe reste en memoire (jamais dans l'URL ni dans le stockage du navigateur) et part dans l'en-tete x-admin-password.
useHead({ title: 'Studio Clippeak' })

const studio = createStudio()
provide(STUDIO_KEY, studio)

const { password, connected, error, notice, busy, channels, channelId, view } = studio
</script>

<template>
  <div class="st-root min-h-screen bg-[#0E0D12]">
    <header class="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[#2C2837] px-5 py-2 sm:px-8">
      <div class="flex items-center gap-2.5">
        <span class="flex h-8 w-8 items-center justify-center rounded-full bg-[#7C3AED] text-xs font-extrabold text-white" aria-hidden="true">CP</span>
        <span class="st-title text-lg font-bold">Clippeak</span>
      </div>
      <div v-if="connected" class="flex flex-wrap items-center justify-end gap-2">
        <select v-if="channels.length > 1" v-model="channelId" class="st-field !w-auto" aria-label="Streamer" @change="studio.switchChannel()">
          <option v-for="c in channels" :key="c.id" :value="c.id">{{ c.displayName }}</option>
        </select>
        <span v-else-if="channels[0]" class="text-sm font-semibold st-muted">{{ channels[0].displayName }}</span>
        <button v-if="view !== 'dashboard' && studio.onboarding.value?.completed" type="button" class="st-btn-ghost" @click="view = 'dashboard'">Tableau de bord</button>
        <span v-else-if="view !== 'dashboard'" class="hidden items-center gap-2 text-[13px] font-semibold st-muted sm:inline-flex">Enregistré à chaque étape</span>
      </div>
    </header>

    <div v-if="error || notice" class="px-5 pt-4 sm:px-8">
      <p v-if="error" class="st-alert st-alert-error m-0" role="alert">{{ error }}</p>
      <p v-else class="st-alert st-alert-ok m-0" role="status">{{ notice }}</p>
    </div>

    <main v-if="!connected" class="mx-auto flex max-w-md flex-col gap-5 px-5 py-16">
      <h1 class="st-title m-0 text-3xl font-bold">Studio Clippeak</h1>
      <p class="m-0 text-sm leading-relaxed st-muted">Règle ton look, valide tes clips par lots de 4. Rien n’est publié ni payé par Clippeak : approuver un clip le marque seulement comme valide.</p>
      <form class="flex flex-col gap-3" @submit.prevent="studio.connect()">
        <label for="st-password" class="st-label">Mot de passe</label>
        <input id="st-password" v-model="password" type="password" autocomplete="current-password" class="st-field" placeholder="Mot de passe admin">
        <button type="submit" class="st-btn st-btn-lg" :disabled="busy || !password">Se connecter</button>
      </form>
    </main>

    <template v-else-if="studio.detail.value">
      <StudioDashboard v-if="view === 'dashboard'" />
      <StudioOnboarding v-else />
    </template>
  </div>
</template>
