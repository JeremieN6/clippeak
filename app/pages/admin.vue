<script setup lang="ts">
interface AdminResponse {
  metrics: {
    total: number
    automationOuiPct: number
    plateformeRepartition: Record<string, number>
    profilRepartition: Record<string, number>
  }
  feedbacks: Array<{
    id: string
    version: string
    zipParMail: boolean
    outilAutomatise: 'oui' | 'non' | 'peut_etre'
    plateformeReception: string
    plateformeAutre: string | null
    vodsParMois: string
    profil: string
    manque: string | null
    email: string | null
    createdAt: string
  }>
}

const password = ref('')
const loading = ref(false)
const error = ref('')
const adminData = ref<AdminResponse | null>(null)

const totalResponses = computed(() => adminData.value?.metrics.total ?? 0)

async function loadFeedbacks() {
  loading.value = true
  error.value = ''

  try {
    const data = await $fetch<AdminResponse>('/api/admin/feedback', {
      query: { password: password.value.trim() }
    })
    adminData.value = data
  } catch {
    error.value = 'Mot de passe invalide ou acces refuse.'
  } finally {
    loading.value = false
  }
}

const platformEntries = computed(() => Object.entries(adminData.value?.metrics.plateformeRepartition || {}))
const profileEntries = computed(() => Object.entries(adminData.value?.metrics.profilRepartition || {}))

function percent(count: number) {
  if (!totalResponses.value) return 0
  return Math.round((count / totalResponses.value) * 100)
}
</script>

<template>
  <main class="mx-auto min-h-screen w-full max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
    <section class="card-surface p-6 sm:p-8">
      <h1 class="font-display text-3xl font-bold sm:text-4xl">Admin Clippeak</h1>
      <p class="mt-2 text-sm text-clippeak-muted">Acces protege par mot de passe.</p>

      <div class="mt-6 flex flex-col gap-3 sm:flex-row">
        <input
          v-model="password"
          type="password"
          placeholder="Mot de passe admin"
          class="h-12 w-full rounded-xl border border-white/15 bg-black/35 px-4 text-sm outline-none focus:border-clippeak-violet"
        >
        <button
          type="button"
          class="h-12 rounded-xl bg-clippeak-violet px-6 font-semibold transition hover:bg-clippeak-violetLight disabled:opacity-70"
          :disabled="loading"
          @click="loadFeedbacks"
        >
          {{ loading ? 'Chargement...' : 'Voir les feedbacks' }}
        </button>
      </div>

      <p v-if="error" class="mt-3 text-sm font-semibold text-red-400">{{ error }}</p>
    </section>

    <section v-if="adminData" class="mt-8 space-y-6">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article class="card-surface p-5">
          <p class="text-xs uppercase tracking-wider text-clippeak-muted">Total reponses</p>
          <p class="mt-2 text-3xl font-bold">{{ adminData.metrics.total }}</p>
        </article>
        <article class="card-surface p-5">
          <p class="text-xs uppercase tracking-wider text-clippeak-muted">Automatisation oui</p>
          <p class="mt-2 text-3xl font-bold">{{ adminData.metrics.automationOuiPct }}%</p>
        </article>
        <article class="card-surface p-5">
          <p class="text-xs uppercase tracking-wider text-clippeak-muted">Plateformes</p>
          <p class="mt-2 text-sm text-white/85">{{ platformEntries.map(([key, value]) => `${key}: ${value}`).join(' | ') }}</p>
        </article>
        <article class="card-surface p-5">
          <p class="text-xs uppercase tracking-wider text-clippeak-muted">Profils</p>
          <p class="mt-2 text-sm text-white/85">{{ profileEntries.map(([key, value]) => `${key}: ${value}`).join(' | ') }}</p>
        </article>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <article class="card-surface p-5">
          <h2 class="font-semibold">Repartition plateformes</h2>
          <div class="mt-4 space-y-3">
            <div v-for="[label, count] in platformEntries" :key="label" class="space-y-1">
              <div class="flex items-center justify-between text-sm">
                <span>{{ label }}</span>
                <span class="text-clippeak-muted">{{ count }} ({{ percent(count) }}%)</span>
              </div>
              <div class="h-2 rounded-full bg-black/30">
                <div class="h-2 rounded-full bg-clippeak-violet" :style="{ width: `${percent(count)}%` }"></div>
              </div>
            </div>
          </div>
        </article>

        <article class="card-surface p-5">
          <h2 class="font-semibold">Repartition profils</h2>
          <div class="mt-4 space-y-3">
            <div v-for="[label, count] in profileEntries" :key="label" class="space-y-1">
              <div class="flex items-center justify-between text-sm">
                <span>{{ label }}</span>
                <span class="text-clippeak-muted">{{ count }} ({{ percent(count) }}%)</span>
              </div>
              <div class="h-2 rounded-full bg-black/30">
                <div class="h-2 rounded-full bg-clippeak-violetLight" :style="{ width: `${percent(count)}%` }"></div>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div class="card-surface overflow-x-auto p-4">
        <table class="w-full min-w-[920px] text-left text-sm">
          <thead>
            <tr class="border-b border-white/10 text-clippeak-muted">
              <th class="px-3 py-2">Date</th>
              <th class="px-3 py-2">Profil</th>
              <th class="px-3 py-2">Auto</th>
              <th class="px-3 py-2">ZIP mail</th>
              <th class="px-3 py-2">Plateforme</th>
              <th class="px-3 py-2">VOD/mois</th>
              <th class="px-3 py-2">Email</th>
              <th class="px-3 py-2">Manque</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in adminData.feedbacks" :key="item.id" class="border-b border-white/5 align-top">
              <td class="px-3 py-3 text-white/80">{{ new Date(item.createdAt).toLocaleString('fr-FR') }}</td>
              <td class="px-3 py-3">{{ item.profil }}</td>
              <td class="px-3 py-3">{{ item.outilAutomatise }}</td>
              <td class="px-3 py-3">{{ item.zipParMail ? 'oui' : 'non' }}</td>
              <td class="px-3 py-3">{{ item.plateformeAutre || item.plateformeReception }}</td>
              <td class="px-3 py-3">{{ item.vodsParMois }}</td>
              <td class="px-3 py-3">{{ item.email || '-' }}</td>
              <td class="px-3 py-3">{{ item.manque || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>
