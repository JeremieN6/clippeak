<script setup lang="ts">
const emit = defineEmits<{
  (e: 'completed'): void
}>()

const processingPhase = ref<'idle' | 'running' | 'done'>('idle')
const twitchUrl = ref('')
const validationError = ref('')
const validationSuccess = ref('')
const elapsedMs = ref(0)
const activeStepIndex = ref(-1)
const completedStepIndex = ref(-1)
const analysisPct = ref(0)
const detectedPeaks = ref<number | null>(null)
const resultClipsCount = ref(0)

const timers: Array<ReturnType<typeof setTimeout>> = []
const intervals: Array<ReturnType<typeof setInterval>> = []

const flowSteps = [
  { label: 'Lecture de la VOD', duration: 4000 },
  { label: 'Analyse du chat Twitch', duration: 11000 },
  { label: "Détection des pics d'activité", duration: 12000 },
  { label: 'Choix du début et de la fin de chaque clip', duration: 19000 },
  { label: 'Montage vertical avec titre et sous-titres', duration: 14000 }
]

const totalDurationMs = flowSteps.reduce((sum, step) => sum + step.duration, 0)

const progressPct = computed(() => {
  if (processingPhase.value === 'done') return 100
  if (processingPhase.value !== 'running') return 0
  return Math.min(100, Math.round((elapsedMs.value / totalDurationMs) * 100))
})

const remainingTimeLabel = computed(() => {
  const remaining = Math.max(0, totalDurationMs - elapsedMs.value)
  const seconds = Math.ceil(remaining / 1000)
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return `${min}:${String(sec).padStart(2, '0')}`
})

function validateVodUrl(input: string) {
  try {
    const parsed = new URL(input)
    const host = parsed.hostname.toLowerCase()
    const hostValid = host === 'twitch.tv' || host === 'www.twitch.tv'
    const pathValid = /^\/videos\/\d+\/?$/.test(parsed.pathname)
    return hostValid && pathValid
  } catch {
    return false
  }
}

function clearTimers() {
  for (const t of timers) clearTimeout(t)
  for (const i of intervals) clearInterval(i)
  timers.length = 0
  intervals.length = 0
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    timers.push(timer)
  })
}

function stepState(index: number) {
  if (index <= completedStepIndex.value) return 'done'
  if (index === activeStepIndex.value) return 'running'
  return 'pending'
}

async function startFakeProcessing() {
  processingPhase.value = 'running'
  elapsedMs.value = 0
  activeStepIndex.value = -1
  completedStepIndex.value = -1
  analysisPct.value = 0
  detectedPeaks.value = null

  const ticker = setInterval(() => {
    elapsedMs.value = Math.min(totalDurationMs, elapsedMs.value + 100)
  }, 100)
  intervals.push(ticker)

  for (const [index, step] of flowSteps.entries()) {
    activeStepIndex.value = index

    if (index === 0) {
      const started = Date.now()
      const analysisTicker = setInterval(() => {
        const ratio = Math.min(1, (Date.now() - started) / step.duration)
        analysisPct.value = Math.round(ratio * 100)
      }, 100)
      intervals.push(analysisTicker)
      await wait(step.duration)
      clearInterval(analysisTicker)
      analysisPct.value = 100
    } else {
      await wait(step.duration)
    }

    if (index === 2) {
      detectedPeaks.value = Math.floor(Math.random() * 8) + 8
    }

    completedStepIndex.value = index
  }

  clearTimers()
  processingPhase.value = 'done'
  activeStepIndex.value = -1
  elapsedMs.value = totalDurationMs
  resultClipsCount.value = detectedPeaks.value ?? Math.floor(Math.random() * 8) + 8
  emit('completed')
}

function launchFlow() {
  if (processingPhase.value === 'running') return

  if (!validateVodUrl(twitchUrl.value)) {
    validationSuccess.value = ''
    validationError.value = 'Cette URL ne semble pas être une VOD Twitch. Elle doit ressembler à : twitch.tv/videos/123456789'
    return
  }

  validationError.value = ''
  validationSuccess.value = 'VOD Twitch détectée ✓'
  clearTimers()
  startFakeProcessing()
}

// Exemples affiches a la fin de la simulation : de faux clips, jamais de fichier a telecharger.
const exampleClips = [
  { title: 'Il a vraiment dit ça en direct devant tout le monde', score: '8.6', duration: '0:42' },
  { title: 'Le penalty que personne n’a vu venir', score: '8.1', duration: '0:35' },
  { title: 'Mon chat a complètement pété les plombs', score: '7.4', duration: '0:51' }
]

onBeforeUnmount(() => {
  clearTimers()
})
</script>

<template>
  <section class="scroll-mt-24">
    <span class="inline-flex rounded-full border border-clippeak-violet/40 bg-clippeak-violet/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white/90">Simulation</span>
    <h2 class="mt-3 font-display text-3xl font-extrabold sm:text-4xl">Découvre le parcours de Clippeak en 1 minute</h2>
    <p class="mt-2 text-clippeak-muted">Colle une URL de VOD Twitch pour voir comment ça se passe. C'est une démonstration : ta VOD n'est pas lue et aucun vrai clip n'est généré. Pour de vrais clips, connecte-toi avec Twitch (accès sur invitation).</p>

    <div class="mt-3 rounded-2xl border border-clippeak-violet/20 bg-clippeak-surface/55 p-3 sm:p-7">
      <form class="space-y-4" @submit.prevent="launchFlow">
        <div class="flex flex-col gap-3 sm:flex-row mb-2">
          <input
            v-model="twitchUrl"
            type="url"
            placeholder="https://www.twitch.tv/videos/123456789"
            class="h-12 w-full rounded-xl border border-white/15 bg-black/35 px-4 text-sm outline-none transition focus:border-clippeak-violet focus:ring-2 focus:ring-clippeak-violet/30"
          >
          <button
            type="submit"
            :disabled="processingPhase === 'running'"
            class="h-12 whitespace-nowrap rounded-xl bg-clippeak-violet px-6 text-sm font-semibold transition hover:bg-clippeak-violetLight disabled:cursor-not-allowed disabled:opacity-70"
          >
            Lancer la simulation
          </button>
        </div>

          <span class=" mt-4 text-xs text-clippeak-muted">Pas de VOD sous la main ? Colle n'importe quel lien de ce type : <strong><em>https://www.twitch.tv/videos/123456789</em></strong></span>
        

        <p v-if="validationError" class="text-sm font-semibold text-red-400">{{ validationError }}</p>
        <p v-else-if="validationSuccess" class="text-sm font-semibold text-emerald-400">{{ validationSuccess }}</p>
      </form>

      <div v-if="processingPhase !== 'idle'" class="mt-6">
        <p class="text-sm text-white/80">
          {{ processingPhase === 'done'
            ? 'Simulation terminée. Voilà ce que tu recevrais dans ton espace. Un formulaire facultatif apparaît juste après si tu veux nous laisser ton avis.'
            : 'Simulation en cours. Dans le vrai produit, tout se passe sur nos serveurs : tu peux fermer la page et revenir quand tes clips sont prêts.' }}
        </p>

        <div class="mt-4 flex items-center justify-between text-sm text-white/85">
          <span>Progression globale</span>
          <span class="font-semibold">{{ progressPct }}%</span>
        </div>
        <div class="mt-2 h-3 w-full rounded-full bg-black/40">
          <div
            class="h-3 rounded-full bg-gradient-to-r from-clippeak-violet to-clippeak-violetLight transition-all duration-300"
            :style="{ width: `${progressPct}%` }"
          ></div>
        </div>
        <p class="mt-2 text-sm text-clippeak-muted">Temps restant estimé : {{ remainingTimeLabel }}</p>

        <ol class="mt-5 space-y-3">
          <li v-for="(step, index) in flowSteps" :key="step.label" class="rounded-xl border border-white/10 bg-black/20 p-4">
            <div class="flex items-center justify-between gap-3">
              <span class="font-semibold">{{ step.label }}</span>
              <span
                class="text-xs uppercase tracking-wider"
                :class="{
                  'text-clippeak-muted': stepState(index) === 'pending',
                  'text-amber-300': stepState(index) === 'running',
                  'text-emerald-400': stepState(index) === 'done'
                }"
              >
                {{ stepState(index) === 'pending' ? 'En attente' : stepState(index) === 'running' ? 'En cours' : 'Terminé' }}
              </span>
            </div>
            <p v-if="index === 0 && stepState(index) !== 'pending'" class="mt-2 text-sm text-clippeak-muted">
              Scan ultra-rapide : {{ analysisPct }}%
            </p>
            <p v-if="index === 2 && detectedPeaks !== null && stepState(index) === 'done'" class="mt-2 text-sm text-emerald-300">
              {{ detectedPeaks }} pics trouvés
            </p>
          </li>
        </ol>
      </div>

      <div v-if="processingPhase === 'done'" class="mt-6 rounded-xl border border-clippeak-violet/30 bg-clippeak-violet/10 p-5">
        <h3 class="font-display text-2xl font-bold">Voilà ce que Clippeak ferait pour toi</h3>
        <p class="mt-2 text-white/85">Sur une vraie VOD, Clippeak prépare jusqu'à 8 clips par live (exemples ci-dessous, fictifs). Ils arrivent par lots de 4 dans ton espace : tu valides, tu ajustes le titre si besoin, puis tu les télécharges ou tu les publies sur YouTube Shorts.</p>
        <ul class="mt-4 grid gap-3 sm:grid-cols-3">
          <li v-for="clip in exampleClips" :key="clip.title" class="rounded-xl border border-white/10 bg-black/30 p-4">
            <span class="text-xs font-semibold uppercase tracking-wider text-clippeak-violetLight">Exemple</span>
            <p class="mt-2 text-sm font-semibold leading-5">{{ clip.title }}</p>
            <p class="mt-2 text-xs text-clippeak-muted">★ {{ clip.score }} · {{ clip.duration }}</p>
          </li>
        </ul>
        <a
          href="/connexion"
          class="mt-5 block w-full rounded-xl bg-clippeak-violet px-6 py-3 text-center font-semibold text-white transition hover:bg-clippeak-violetLight"
        >
          Se connecter avec Twitch
        </a>
        <p class="mt-2 text-center text-xs text-clippeak-muted">Accès sur invitation pendant la bêta · gratuit jusqu'à 40 clips par mois</p>
      </div>
    </div>
  </section>
</template>
