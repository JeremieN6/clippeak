<script setup lang="ts">
import JSZip from 'jszip'

type StepState = 'pending' | 'running' | 'done'
type Phase = 'idle' | 'processing' | 'done'

interface ProcessingStep {
  label: string
  duration: number
}

const phase = ref<Phase>('idle')
const twitchUrl = ref('')
const validationMessage = ref('')
const validationError = ref('')

const steps: ProcessingStep[] = [
  { label: 'Analyse de la VOD', duration: 4000 },
  { label: 'Telechargement du chat Twitch', duration: 9000 },
  { label: 'Detection des pics d activite', duration: 12000 },
  { label: 'Extraction des sequences video', duration: 18000 },
  { label: 'Creation du ZIP', duration: 15000 }
]

const totalDuration = steps.reduce((acc, step) => acc + step.duration, 0)

const currentStep = ref(-1)
const completedSteps = ref(-1)
const elapsed = ref(0)
const analysisProgress = ref(0)
const clipsDetected = ref(0)

const timers: Array<ReturnType<typeof setTimeout>> = []
const intervals: Array<ReturnType<typeof setInterval>> = []

const feedbackSubmitted = ref(false)
const feedbackSubmitting = ref(false)
const feedbackError = ref('')

const feedbackForm = reactive({
  profil: 'streamer',
  zipParMail: 'non',
  outilAutomatise: 'oui',
  plateformeReception: 'discord',
  plateformeAutre: '',
  vodsParMois: '1-2',
  manquePreset: 'rien',
  manqueLibre: '',
  email: ''
})

const globalProgress = computed(() => {
  if (phase.value === 'done') {
    return 100
  }

  if (phase.value !== 'processing') {
    return 0
  }

  return Math.min(100, Math.round((elapsed.value / totalDuration) * 100))
})

const remainingTime = computed(() => {
  const remaining = Math.max(0, totalDuration - elapsed.value)
  const seconds = Math.ceil(remaining / 1000)
  const minutesPart = Math.floor(seconds / 60)
  const secondsPart = seconds % 60

  return `${minutesPart}:${String(secondsPart).padStart(2, '0')}`
})

function getStepState(index: number): StepState {
  if (index <= completedSteps.value) {
    return 'done'
  }

  if (index === currentStep.value) {
    return 'running'
  }

  return 'pending'
}

function validateTwitchVideoUrl(url: string) {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    const validHost = host === 'twitch.tv' || host === 'www.twitch.tv'
    const validPath = /^\/videos\/\d+\/?$/.test(parsed.pathname)

    if (!validHost || !validPath) {
      return {
        valid: false,
        message: 'URL invalide: utilise une URL Twitch de type https://www.twitch.tv/videos/123456789'
      }
    }

    return { valid: true, message: 'URL valide. Pret a generer tes clips viraux.' }
  } catch {
    return {
      valid: false,
      message: 'URL invalide: saisis une URL complete avec https://'
    }
  }
}

function resetTimers() {
  for (const timer of timers) {
    clearTimeout(timer)
  }

  for (const interval of intervals) {
    clearInterval(interval)
  }

  timers.length = 0
  intervals.length = 0
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), ms)
    timers.push(timer)
  })
}

async function runProcessingFlow() {
  phase.value = 'processing'
  elapsed.value = 0
  completedSteps.value = -1
  currentStep.value = -1
  analysisProgress.value = 0

  const elapsedInterval = setInterval(() => {
    elapsed.value = Math.min(totalDuration, elapsed.value + 100)
  }, 100)
  intervals.push(elapsedInterval)

  for (let index = 0; index < steps.length; index += 1) {
    currentStep.value = index

    if (index === 0) {
      const startedAt = Date.now()
      const analysisInterval = setInterval(() => {
        const ratio = Math.min(1, (Date.now() - startedAt) / steps[index].duration)
        analysisProgress.value = Math.round(ratio * 100)
      }, 120)
      intervals.push(analysisInterval)

      await wait(steps[index].duration)
      clearInterval(analysisInterval)
      analysisProgress.value = 100
    } else {
      await wait(steps[index].duration)
    }

    completedSteps.value = index
  }

  phase.value = 'done'
  currentStep.value = -1
  elapsed.value = totalDuration
  clipsDetected.value = Math.floor(Math.random() * 8) + 8
}

function onSubmitUrl() {
  if (phase.value === 'processing') {
    return
  }

  const result = validateTwitchVideoUrl(twitchUrl.value)

  if (!result.valid) {
    validationError.value = result.message
    validationMessage.value = ''
    return
  }

  validationError.value = ''
  validationMessage.value = result.message
  resetTimers()
  runProcessingFlow()
}

async function downloadZip() {
  const zip = new JSZip()

  zip.file(
    'README.txt',
    'Clippeak Beta V1\n\nMerci de tester la version de validation du concept.\nLe moteur reel de clipping arrive bientot.'
  )

  const blob = await zip.generateAsync({ type: 'blob' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.href = url
  link.download = 'clippeak-beta-v1.zip'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function submitFeedback() {
  if (feedbackSubmitting.value || feedbackSubmitted.value) {
    return
  }

  feedbackSubmitting.value = true
  feedbackError.value = ''

  try {
    await $fetch('/api/feedback', {
      method: 'POST',
      body: {
        version: 'v1',
        profil: feedbackForm.profil,
        zipParMail: feedbackForm.zipParMail === 'oui',
        outilAutomatise: feedbackForm.outilAutomatise,
        plateformeReception: feedbackForm.plateformeReception,
        plateformeAutre: feedbackForm.plateformeReception === 'autre' ? feedbackForm.plateformeAutre || null : null,
        vodsParMois: feedbackForm.vodsParMois,
        manque:
          feedbackForm.manquePreset === 'rien'
            ? 'Rien je suis chaud de l utiliser'
            : feedbackForm.manqueLibre || null,
        email: feedbackForm.email || null
      }
    })

    feedbackSubmitted.value = true
  } catch {
    feedbackError.value = 'Impossible d envoyer ton feedback pour le moment. Reessaie dans quelques instants.'
  } finally {
    feedbackSubmitting.value = false
  }
}

onBeforeUnmount(() => {
  resetTimers()
})
</script>

<template>
  <main class="mx-auto min-h-screen w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
    <section class="relative overflow-hidden rounded-3xl border border-white/10 bg-clippeak-bg/55 p-6 shadow-glow sm:p-12">
      <div class="absolute left-1/2 top-16 h-56 w-56 -translate-x-1/2 rounded-full bg-clippeak-violet/40 blur-[90px]" />
      <div class="relative space-y-8 animate-riseIn">
        <div class="flex items-center gap-3 text-sm uppercase tracking-[0.2em] text-white/70">
          <span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-clippeak-violet font-display text-xs font-bold">CP</span>
          <span class="font-display">Clippeak</span>
        </div>

        <div class="max-w-3xl space-y-5">
          <h1 class="font-display text-4xl font-extrabold leading-tight sm:text-6xl">
            Tes meilleurs moments.<br>
            En clips. <span class="text-clippeak-violetLight">Automatiquement.</span>
          </h1>
          <p class="max-w-2xl text-base text-clippeak-muted sm:text-lg">
            Balance ta VOD Twitch. Clippeak simule un traitement turbo, detecte les temps forts et te sort un pack pret a poster.
          </p>
        </div>

        <form class="space-y-4" @submit.prevent="onSubmitUrl">
          <label class="block text-sm font-semibold text-white/80" for="vod-url">Colle ton URL Twitch VOD</label>
          <div class="flex flex-col gap-3 sm:flex-row">
            <input
              id="vod-url"
              v-model="twitchUrl"
              type="url"
              placeholder="https://www.twitch.tv/videos/123456789"
              class="h-12 w-full rounded-xl border border-white/15 bg-black/35 px-4 text-sm outline-none transition focus:border-clippeak-violet focus:ring-2 focus:ring-clippeak-violet/30"
            >
            <button
              type="submit"
              class="h-12 whitespace-nowrap rounded-xl bg-clippeak-violet px-6 font-semibold text-white transition hover:bg-clippeak-violetLight disabled:cursor-not-allowed disabled:opacity-70"
              :disabled="phase === 'processing'"
            >
              Generer des clips viraux
            </button>
          </div>
          <p v-if="validationError" class="text-sm font-semibold text-red-400">{{ validationError }}</p>
          <p v-else-if="validationMessage" class="text-sm font-semibold text-emerald-400">{{ validationMessage }}</p>
        </form>
      </div>
    </section>

    <Transition name="fade-slide" mode="out-in">
      <section
        v-if="phase === 'processing'"
        key="processing"
        class="card-surface mt-8 animate-riseIn p-6 sm:p-8"
      >
        <p class="mb-6 max-w-3xl text-sm text-white/80 sm:text-base">
          Ne ferme pas cet onglet pendant que Clippeak travaille. Tu seras notifie des que tes clips sont prets.
        </p>

        <div class="mb-3 flex items-center justify-between text-sm text-white/80">
          <span>Progression globale</span>
          <span class="font-semibold">{{ globalProgress }}%</span>
        </div>
        <div class="h-3 w-full rounded-full bg-black/40">
          <div
            class="h-3 rounded-full bg-gradient-to-r from-clippeak-violet to-clippeak-violetLight transition-all duration-300"
            :style="{ width: `${globalProgress}%` }"
          />
        </div>
        <p class="mt-3 text-sm text-clippeak-muted">Temps restant estime: {{ remainingTime }}</p>

        <ol class="mt-8 space-y-3">
          <li
            v-for="(step, index) in steps"
            :key="step.label"
            class="rounded-xl border border-white/10 bg-black/20 p-4"
          >
            <div class="flex items-center justify-between gap-3">
              <span class="font-semibold">{{ step.label }}</span>
              <span
                class="text-xs uppercase tracking-wider"
                :class="{
                  'text-clippeak-muted': getStepState(index) === 'pending',
                  'text-amber-300': getStepState(index) === 'running',
                  'text-emerald-400': getStepState(index) === 'done'
                }"
              >
                {{ getStepState(index) === 'pending' ? 'En attente' : getStepState(index) === 'running' ? 'En cours' : 'Termine' }}
              </span>
            </div>
            <p v-if="index === 0 && getStepState(index) !== 'pending'" class="mt-2 text-sm text-clippeak-muted">
              Analyse boostee: {{ analysisProgress }}%
            </p>
          </li>
        </ol>
      </section>

      <section v-else-if="phase === 'done'" key="result" class="mt-8 space-y-6 animate-riseIn">
        <div class="card-surface space-y-5 p-6 sm:p-8">
          <h2 class="font-display text-3xl font-extrabold sm:text-4xl">Clips prets. Mission complete.</h2>
          <p class="text-white/80">
            On a detecte <span class="font-bold text-clippeak-violetLight">{{ clipsDetected }} clips</span> qui peuvent percer sur les plateformes sociales.
          </p>
          <button
            type="button"
            class="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-emerald-950 transition hover:bg-emerald-400"
            @click="downloadZip"
          >
            Telecharger mes clips (.zip)
          </button>
        </div>

        <div class="card-surface p-6 sm:p-8">
          <h3 class="font-display text-2xl font-bold">Aide-nous a construire la suite</h3>

          <div v-if="feedbackSubmitted" class="mt-5 rounded-xl border border-emerald-300/40 bg-emerald-400/10 p-4 text-emerald-300">
            Merci, ton retour est bien enregistre.
          </div>

          <form v-else class="mt-6 grid gap-4" @submit.prevent="submitFeedback">
            <label class="grid gap-2 text-sm">
              <span>Tu es ?</span>
              <select v-model="feedbackForm.profil" class="rounded-xl border border-white/15 bg-black/35 px-3 py-2 outline-none focus:border-clippeak-violet">
                <option value="streamer">Streamer</option>
                <option value="clippeur">Clippeur</option>
                <option value="les deux">Les deux</option>
              </select>
            </label>

            <label class="grid gap-2 text-sm">
              <span>Prefererais-tu recevoir le ZIP par mail ?</span>
              <select v-model="feedbackForm.zipParMail" class="rounded-xl border border-white/15 bg-black/35 px-3 py-2 outline-none focus:border-clippeak-violet">
                <option value="oui">Oui</option>
                <option value="non">Non</option>
              </select>
            </label>

            <label class="grid gap-2 text-sm">
              <span>Prefererais-tu un outil 100% automatise ?</span>
              <select v-model="feedbackForm.outilAutomatise" class="rounded-xl border border-white/15 bg-black/35 px-3 py-2 outline-none focus:border-clippeak-violet">
                <option value="oui">Oui</option>
                <option value="non">Non</option>
                <option value="peut-etre">Peut-etre</option>
              </select>
            </label>

            <label class="grid gap-2 text-sm">
              <span>Sur quelle plateforme voudrais-tu recevoir tes clips ?</span>
              <select v-model="feedbackForm.plateformeReception" class="rounded-xl border border-white/15 bg-black/35 px-3 py-2 outline-none focus:border-clippeak-violet">
                <option value="discord">Discord</option>
                <option value="telegram">Telegram</option>
                <option value="mail">Mail</option>
                <option value="autre">Autre</option>
              </select>
            </label>

            <label v-if="feedbackForm.plateformeReception === 'autre'" class="grid gap-2 text-sm">
              <span>Precise la plateforme</span>
              <input v-model="feedbackForm.plateformeAutre" type="text" class="rounded-xl border border-white/15 bg-black/35 px-3 py-2 outline-none focus:border-clippeak-violet">
            </label>

            <label class="grid gap-2 text-sm">
              <span>Combien de VODs traites-tu par mois environ ?</span>
              <select v-model="feedbackForm.vodsParMois" class="rounded-xl border border-white/15 bg-black/35 px-3 py-2 outline-none focus:border-clippeak-violet">
                <option value="1-2">1-2</option>
                <option value="3-5">3-5</option>
                <option value="6-10">6-10</option>
                <option value="10+">10+</option>
              </select>
            </label>

            <label class="grid gap-2 text-sm">
              <span>Que manque-t-il a cet outil pour que tu l utilises a sa sortie ?</span>
              <select v-model="feedbackForm.manquePreset" class="rounded-xl border border-white/15 bg-black/35 px-3 py-2 outline-none focus:border-clippeak-violet">
                <option value="rien">Rien je suis chaud de l utiliser</option>
                <option value="libre">Champ libre</option>
              </select>
            </label>

            <label v-if="feedbackForm.manquePreset === 'libre'" class="grid gap-2 text-sm">
              <span>Ton retour libre</span>
              <textarea v-model="feedbackForm.manqueLibre" rows="4" class="rounded-xl border border-white/15 bg-black/35 px-3 py-2 outline-none focus:border-clippeak-violet" />
            </label>

            <label class="grid gap-2 text-sm">
              <span>Je veux acceder en avant-premiere quand c est pret</span>
              <input
                v-model="feedbackForm.email"
                type="email"
                placeholder="ton-email@exemple.com"
                class="rounded-xl border border-white/15 bg-black/35 px-3 py-2 outline-none focus:border-clippeak-violet"
              >
            </label>

            <p v-if="feedbackError" class="text-sm font-semibold text-red-400">{{ feedbackError }}</p>

            <button
              type="submit"
              class="mt-2 rounded-xl bg-clippeak-violet px-6 py-3 font-semibold transition hover:bg-clippeak-violetLight disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="feedbackSubmitting"
            >
              {{ feedbackSubmitting ? 'Envoi en cours...' : 'Envoyer mon feedback' }}
            </button>
          </form>
        </div>
      </section>
    </Transition>
  </main>
</template>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 350ms ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
