<script setup lang="ts">
const studio = useStudio()
const detail = studio.detail
const invalid = computed(() => detail.value?.settings && detail.value.settings.clipMinSec >= detail.value.settings.clipMaxSec)
const lo = computed(() => Math.min(detail.value?.settings.clipMinSec ?? 0, detail.value?.settings.clipMaxSec ?? 0))
const hi = computed(() => Math.max(detail.value?.settings.clipMinSec ?? 0, detail.value?.settings.clipMaxSec ?? 0))
defineExpose({ invalid })
</script>

<template>
  <div v-if="detail?.settings" class="flex max-w-[820px] flex-col gap-6">
    <StudioStepHeader :n="6" tag="Tu peux la passer" title="Repérer tes bons moments">
      Clippeak cherche d’abord ce qui ressemble à tes clips, puis les moments où ton chat s’emballe.
    </StudioStepHeader>

    <section class="st-card flex flex-col gap-3">
      <h2 class="m-0 text-[17px] font-bold"><label for="st-chatwords">Mots que ton chat écrit quand il réagit</label></h2>
      <div class="st-hint">Quand beaucoup de ces mots arrivent d’un coup, ou beaucoup de messages en MAJUSCULES, Clippeak regarde ce moment. Exemple : mdr, omg, kekw.</div>
      <StudioChips v-model="detail.settings.keywords" input-id="st-chatwords" />
    </section>

    <section class="st-card flex flex-col gap-5">
      <div>
        <h2 class="m-0 text-[17px] font-bold">Durée d’un clip</h2>
        <div class="st-hint">Un clip durera entre <strong class="text-[#F3F1F7]">{{ detail.settings.clipMinSec }} s</strong> et <strong class="text-[#F3F1F7]">{{ detail.settings.clipMaxSec }} s</strong>.</div>
      </div>
      <div class="relative h-9" aria-hidden="true">
        <div class="absolute inset-x-0 top-3.5 h-2 rounded bg-[#2C2837]" />
        <div class="absolute top-3.5 h-2 rounded bg-[#7C3AED]" :style="{ left: `${(lo / 180) * 100}%`, width: `${((hi - lo) / 180) * 100}%` }" />
        <div class="absolute left-0 top-[26px] text-[11px] text-[#928BA2]">0 s</div>
        <div class="absolute right-0 top-[26px] text-[11px] text-[#928BA2]">180 s</div>
      </div>
      <div class="grid gap-x-7 gap-y-5 sm:grid-cols-2">
        <label class="flex flex-col gap-1.5">
          <span class="flex items-center justify-between"><span class="st-label">Durée minimale</span><span class="st-badge st-badge-violet">{{ detail.settings.clipMinSec }} s</span></span>
          <input v-model.number="detail.settings.clipMinSec" type="range" min="10" max="120" step="1" class="st-range">
          <span class="text-xs text-[#928BA2]">Plus court, le moment n’a pas le temps de se raconter.</span>
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="flex items-center justify-between"><span class="st-label">Durée maximale</span><span class="st-badge st-badge-violet">{{ detail.settings.clipMaxSec }} s</span></span>
          <input v-model.number="detail.settings.clipMaxSec" type="range" min="15" max="180" step="1" class="st-range">
          <span class="text-xs text-[#928BA2]">Plus long, le clip risque de perdre du rythme.</span>
        </label>
      </div>
      <div v-if="invalid" role="alert" class="st-alert st-alert-error">La durée minimale doit être plus courte que la durée maximale.</div>
    </section>

    <div class="st-alert st-alert-info">
      <div><strong class="font-extrabold">À savoir.</strong> <span class="text-[#B9D2FF]">Ces réglages décident quels moments sont repérés et la longueur des clips. Ils ne changent pas leur apparence : pour ça, c’est l’étape 3.</span></div>
    </div>
  </div>
</template>
