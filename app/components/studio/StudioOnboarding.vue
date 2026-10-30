<script setup lang="ts">
// Parcours guide en 8 etapes : seul le clip de reference (1) est necessaire, le reste se passe avec « Plus tard ».
const studio = useStudio()
const step = studio.step
const o = computed(() => studio.onboarding.value)

// Sur telephone la liste des etapes est repliee pour laisser la place au contenu.
const navOpen = ref(false)
const currentLabel = computed(() => STEPS[step.value - 1]?.label ?? '')
const pick = (n: number) => { step.value = n; navOpen.value = false }

const pct = computed(() => Math.round(((step.value - 1) / 8) * 100))
const hasReference = computed(() => (studio.bank.value?.items?.length ?? 0) > 0)
const detectionInvalid = computed(() => step.value === 6 && studio.detail.value?.settings && studio.detail.value.settings.clipMinSec >= studio.detail.value.settings.clipMaxSec)
const canNext = computed(() => !studio.busy.value && !(step.value === 1 && !hasReference.value) && !detectionInvalid.value)

const navSteps = computed(() => STEPS.map((s) => {
  const current = s.n === step.value
  const done = !!o.value?.done.includes(s.n) && !current
  const skipped = !!o.value?.skipped.includes(s.n) && !done && !current
  return {
    ...s, current, done, skipped,
    tag: current ? 'En cours' : done ? 'Fait' : skipped ? 'Passée : à reprendre' : s.tag,
    tagClass: current ? 'text-st-accentLight' : done ? 'text-st-ok' : skipped ? 'text-st-warn' : 'text-st-dim'
  }
}))

const next = () => studio.advance('done')
const later = () => studio.advance('skipped')
const back = () => { if (step.value > 1) step.value-- }

// Le contenu de l'etape se remet en haut a chaque changement.
const main = ref<HTMLElement | null>(null)
watch(step, () => nextTick(() => main.value?.scrollIntoView({ block: 'start' })))
</script>

<template>
  <div class="flex flex-wrap items-stretch">
    <nav aria-label="Étapes de l’onboarding" class="flex w-full flex-none flex-col gap-5 border-st-border p-5 lg:w-[300px] lg:border-r lg:py-7">
      <div class="flex flex-col gap-2.5 px-2.5">
        <div class="flex justify-between text-[13px] font-bold"><span>Étape {{ step }} sur 8</span><span class="st-muted">{{ pct }} %</span></div>
        <div class="h-1.5 overflow-hidden rounded-[3px] bg-st-border"><div class="st-bar" :style="{ width: `${pct}%` }" /></div>
      </div>
      <button type="button" class="st-btn-ghost w-full lg:hidden" :aria-expanded="navOpen" aria-controls="st-steps" @click="navOpen = !navOpen">{{ navOpen ? 'Masquer les étapes' : `Étapes : ${currentLabel}` }}</button>
      <div id="st-steps" class="flex-col gap-0.5 lg:flex" :class="navOpen ? 'flex' : 'hidden'">
        <button v-for="s in navSteps" :key="s.n" type="button" class="st-nav-item" :aria-current="s.current ? 'step' : undefined" @click="pick(s.n)">
          <span class="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[13px] font-extrabold" :class="s.current ? 'bg-st-accent text-white' : s.done ? 'bg-st-okBg text-st-ok' : s.skipped ? 'border border-dashed border-st-borderStrong text-st-muted' : 'border border-st-borderStrong text-st-muted'"><svg v-if="s.done" class="st-pop" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg><template v-else>{{ s.n }}</template></span>
          <span class="flex min-w-0 flex-col">
            <span class="text-[15px] leading-5" :class="s.current ? 'font-bold text-white' : s.done ? 'font-semibold text-st-soft' : 'font-semibold text-st-muted'">{{ s.label }}</span>
            <span class="text-xs font-bold leading-4" :class="s.tagClass">{{ s.tag }}</span>
          </span>
        </button>
      </div>
    </nav>

    <section class="flex min-w-0 flex-[999_1_560px] flex-col">
      <div ref="main" class="flex-1 px-5 py-8 sm:px-10">
        <div v-if="studio.vodAlerts.value.length" class="st-alert st-alert-warn mb-6 flex-wrap items-center justify-between" role="status">
          <span>{{ studio.vodAlerts.value.length }} VOD{{ studio.vodAlerts.value.length > 1 ? 's' : '' }} demande{{ studio.vodAlerts.value.length > 1 ? 'nt' : '' }} ton attention.</span>
          <button type="button" class="st-btn-ghost" @click="studio.view.value = 'dashboard'">Voir</button>
        </div>
        <div v-if="studio.clips.value.length" class="st-alert st-alert-ok mb-6 flex-wrap items-center justify-between" role="status">
          <span>Tes premiers clips sont arrivés ({{ studio.clips.value.length }}). Tu peux les voir sans finir le parcours.</span>
          <button type="button" class="st-btn" @click="studio.view.value = 'dashboard'">Voir mes clips</button>
        </div>
        <StudioConversation />
      </div>

      <div class="sticky bottom-0 z-10 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-st-border bg-st-bg px-4 py-3 sm:px-10 sm:py-3.5">
        <span v-if="step === 1 && !hasReference" class="basis-full text-[13px] st-muted">Ajoute au moins un clip pour continuer.</span>
        <span v-if="detectionInvalid" class="basis-full text-[13px] text-st-error">La durée minimale doit être plus courte que la maximale.</span>
        <button type="button" class="st-btn-ghost !bg-transparent sm:!min-h-[52px] sm:!px-7" :disabled="step === 1" @click="back">Retour</button>
        <template v-if="step < 8">
          <button v-if="step >= 2 && step <= 7" type="button" class="st-btn-quiet sm:ml-auto" :disabled="studio.busy.value" @click="later">Plus tard</button>
          <button type="button" class="st-btn flex-1 sm:!min-h-[52px] sm:flex-none sm:!px-7 sm:text-base" :class="step === 1 ? 'sm:ml-auto' : ''" :disabled="!canNext" @click="next">
            Continuer
          </button>
        </template>
      </div>
    </section>
  </div>
</template>
