<script setup lang="ts">
// Parcours guide en 8 etapes : seul le clip de reference (1) est necessaire, le reste se passe avec « Plus tard ».
const studio = useStudio()
const step = studio.step
const o = computed(() => studio.onboarding.value)

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
    tagClass: current ? 'text-[#B9A0FF]' : done ? 'text-[#6EDDB8]' : skipped ? 'text-[#F6C260]' : 'text-[#928BA2]'
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
    <nav aria-label="Étapes de l’onboarding" class="flex w-full flex-none flex-col gap-5 border-[#2C2837] p-5 lg:w-[300px] lg:border-r lg:py-7">
      <div class="flex flex-col gap-2.5 px-2.5">
        <div class="flex justify-between text-[13px] font-bold"><span>Étape {{ step }} sur 8</span><span class="st-muted">{{ pct }} %</span></div>
        <div class="h-1.5 overflow-hidden rounded-[3px] bg-[#2C2837]"><div class="h-full bg-[#7C3AED]" :style="{ width: `${pct}%` }" /></div>
      </div>
      <div class="flex flex-col gap-0.5">
        <button v-for="s in navSteps" :key="s.n" type="button" class="st-nav-item" :aria-current="s.current ? 'step' : undefined" @click="step = s.n">
          <span class="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[13px] font-extrabold" :class="s.current ? 'bg-[#7C3AED] text-white' : s.done ? 'bg-[#12302A] text-[#6EDDB8]' : s.skipped ? 'border border-dashed border-[#6A6280] text-[#ABA5BA]' : 'border border-[#4B4560] text-[#ABA5BA]'">{{ s.done ? '✓' : s.n }}</span>
          <span class="flex min-w-0 flex-col">
            <span class="text-[15px] leading-5" :class="s.current ? 'font-bold text-white' : s.done ? 'font-semibold text-[#C9C3D6]' : 'font-semibold text-[#ABA5BA]'">{{ s.label }}</span>
            <span class="text-xs font-bold leading-4" :class="s.tagClass">{{ s.tag }}</span>
          </span>
        </button>
      </div>
    </nav>

    <section class="flex min-w-0 flex-[999_1_560px] flex-col">
      <div ref="main" class="flex-1 px-5 py-8 sm:px-10">
        <StudioStepReference v-if="step === 1" />
        <StudioStepPhotos v-else-if="step === 2" />
        <StudioStepLook v-else-if="step === 3" />
        <StudioStepSounds v-else-if="step === 4" />
        <StudioStepIllustrations v-else-if="step === 5" />
        <StudioStepDetection v-else-if="step === 6" />
        <StudioStepPlatforms v-else-if="step === 7" />
        <StudioStepRecap v-else />
      </div>

      <div class="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-[#2C2837] bg-[#0E0D12] px-5 py-3.5 sm:px-10">
        <button type="button" class="st-btn-ghost st-btn-lg !bg-transparent" :disabled="step === 1" @click="back">Retour</button>
        <div v-if="step < 8" class="flex flex-wrap items-center justify-end gap-2">
          <button v-if="step >= 2 && step <= 7" type="button" class="st-btn-quiet" :disabled="studio.busy.value" @click="later">Plus tard</button>
          <span v-if="step === 1 && !hasReference" class="max-w-[220px] text-right text-[13px] st-muted">Ajoute au moins un clip pour continuer.</span>
          <span v-if="detectionInvalid" class="max-w-[220px] text-right text-[13px] text-[#FF9B8D]">La durée minimale doit être plus courte que la maximale.</span>
          <button type="button" class="st-btn st-btn-lg" :disabled="!canNext" @click="next">Enregistrer et continuer</button>
        </div>
      </div>
    </section>
  </div>
</template>
