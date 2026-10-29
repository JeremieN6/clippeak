<script setup lang="ts">
const studio = useStudio()
const input = ref<HTMLInputElement | null>(null)
const MIN = 3
const MAX = 5

const photos = computed(() => studio.assetsOf('photo'))
const count = computed(() => photos.value.length)
const enough = computed(() => count.value >= MIN)

async function pick(event: Event) {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files ?? []).slice(0, Math.max(0, MAX - count.value))
  target.value = ''
  if (files.length) await studio.addAssets('photo', files)
}
</script>

<template>
  <div class="flex max-w-[820px] flex-col gap-7">
    <StudioStepHeader :n="2" tag="Conseillé" title="Tes photos">
      Trois photos de face suffisent pour que Clippeak te garde bien cadré.
    </StudioStepHeader>

    <section class="st-card flex flex-col gap-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="m-0 text-[17px] font-bold">{{ count }} sur {{ MIN }} minimum</h2>
          <div class="st-hint">{{ enough ? `Tu peux en ajouter jusqu’à ${MAX}.` : 'Ajoute-en encore pour activer le cadrage automatique.' }}</div>
        </div>
        <span class="st-badge" :class="enough ? 'st-badge-ok' : 'st-badge-warn'">{{ enough ? 'Prêt' : 'Il en manque' }}</span>
      </div>

      <div class="flex gap-1" aria-hidden="true">
        <span v-for="i in MAX" :key="i" class="h-1.5 flex-1 rounded-[3px]" :style="{ background: i <= count ? (enough ? 'var(--st-ok)' : 'var(--st-warn)') : 'var(--st-border)' }" />
      </div>

      <div class="grid grid-cols-[repeat(auto-fill,minmax(min(140px,100%),1fr))] gap-3">
        <div v-for="(p, i) in photos" :key="p.id" class="relative aspect-[3/4] overflow-hidden rounded-xl border border-st-border bg-st-field">
          <img :src="p.previewUrl" :alt="`Photo ${i + 1} : ${p.filename}`" class="h-full w-full object-cover">
          <button type="button" :aria-label="`Supprimer la photo ${i + 1}`" class="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-[10px] border-0 bg-[#0E0D12]/80 text-st-text" :disabled="studio.busy.value" @click="studio.removeAsset(p.id)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
          </button>
          <div class="absolute bottom-2 left-2 rounded-full bg-[#0E0D12]/80 px-2.5 py-0.5 text-xs font-bold">Photo {{ i + 1 }}</div>
        </div>
        <button v-if="count < MAX" type="button" class="flex aspect-[3/4] min-h-[132px] flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-st-borderStrong bg-st-field p-2 text-sm font-bold text-st-accentText" :disabled="studio.busy.value" @click="input?.click()">
          <span class="flex h-10 w-10 items-center justify-center rounded-full bg-st-accentBg"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></span>
          Ajouter une photo
        </button>
        <input ref="input" type="file" multiple accept=".jpg,.jpeg,.png" class="hidden" aria-label="Ajouter des photos" @change="pick">
      </div>

      <div v-if="!enough" class="st-alert st-alert-warn">
        <div><strong class="font-extrabold">Encore {{ MIN - count }} photo(s).</strong> <span class="text-st-warn">Sans elles, le cadrage automatique reste coupé : tu pourras cadrer à la main à l’étape suivante.</span></div>
      </div>
      <div v-else class="st-alert st-alert-ok">
        <div><strong class="font-extrabold">C’est bon.</strong> <span class="text-st-ok">Tu peux activer le cadrage automatique à l’étape 3.</span></div>
      </div>
    </section>

    <section class="st-card flex flex-col gap-3">
      <h2 class="m-0 text-[17px] font-bold">Pour de bonnes photos</h2>
      <ul class="m-0 grid list-none gap-x-6 gap-y-3 p-0 text-sm leading-relaxed st-muted sm:grid-cols-3">
        <li>Visage de face, bien éclairé</li>
        <li>Une expression différente par photo</li>
        <li>Photo prise comme sur ton stream</li>
      </ul>
    </section>
  </div>
</template>
