<script setup lang="ts">
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
  { label: 'Analyse de la VOD', duration: 4000 },
  { label: 'Téléchargement du chat Twitch', duration: 11000 },
  { label: "Détection des pics d'activité", duration: 12000 },
  { label: 'Extraction des séquences vidéo', duration: 19000 },
  { label: 'Création du ZIP', duration: 14000 }
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

async function downloadZip() {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  zip.file(
    'OUVRE-IMPORTANT.txt',
    "Déjà merci d'avoir ouvert. Dans ce .zip tu trouveras une liste de clip pré sélectionné pour illustré jusqu'au bout le processus. Clippeak est en cours de développement. Merci d'avoir testé ! Tes clips seront bientôt réels. Laisse-nous ton email pour être prévenu en avant-première."
  )

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'clippeak-beta.zip'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

onBeforeUnmount(() => {
  clearTimers()
})
</script>

<template>
  <section class="scroll-mt-24">
    <h2 class="font-display text-3xl font-extrabold sm:text-4xl">Essaye Clippeak sur ta dernière VOD</h2>
    <p class="mt-2 text-clippeak-muted">Colle l'URL de ta VOD Twitch ci-dessous. Aucun compte requis.</p>

    <div class="mt-6 rounded-2xl border border-clippeak-violet/20 bg-clippeak-surface/55 p-5 sm:p-7">
      <form class="space-y-4" @submit.prevent="launchFlow">
        <div class="flex flex-col gap-3 sm:flex-row">
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
            Générer mes clips viraux
          </button>
        </div>

        <p v-if="validationError" class="text-sm font-semibold text-red-400">{{ validationError }}</p>
        <p v-else-if="validationSuccess" class="text-sm font-semibold text-emerald-400">{{ validationSuccess }}</p>
      </form>

      <div v-if="processingPhase !== 'idle'" class="mt-6">
        <p class="text-sm text-white/80">
          Ne ferme pas cet onglet pendant que Clippeak travaille. Tu seras notifié dès que tes clips sont prêts.
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
              Faux scan ultra-rapide : {{ analysisPct }}%
            </p>
            <p v-if="index === 2 && detectedPeaks !== null && stepState(index) === 'done'" class="mt-2 text-sm text-emerald-300">
              {{ detectedPeaks }} pics trouvés
            </p>
          </li>
        </ol>
      </div>

      <div v-if="processingPhase === 'done'" class="mt-6 rounded-xl border border-clippeak-violet/30 bg-clippeak-violet/10 p-5">
        <h3 class="font-display text-2xl font-bold">Tes clips sont prêts 🎉</h3>
        <p class="mt-2 text-white/85">{{ resultClipsCount }} clips détectés sur ta VOD</p>
        <button
          type="button"
          class="mt-4 rounded-xl bg-clippeak-violet px-6 py-3 font-semibold text-white transition hover:bg-clippeak-violetLight"
          @click="downloadZip"
        >
          Télécharger mes clips (.zip)
        </button>
      </div>
    </div>
  </section>
</template>
