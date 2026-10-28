<script setup lang="ts">
const studio = useStudio()

const rows = computed(() => STEPS.filter(s => s.n < 8).map(s => ({ ...s, ...studio.stepStatus(s.n) })))
const count = (status: string) => rows.value.filter(r => r.status === status).length
const look = {
  ok: { cls: 'bg-[#12302A] text-[#6EDDB8]', tag: 'RÉGLÉE', go: 'Modifier' },
  warn: { cls: 'bg-[#33280F] text-[#F6C260]', tag: 'À COMPLÉTER', go: 'Compléter' },
  skip: { cls: 'bg-[#25212F] text-[#C9C3D6]', tag: 'PASSÉE', go: 'Reprendre' },
  todo: { cls: 'bg-[#25212F] text-[#C9C3D6]', tag: 'PAS FAITE', go: 'Faire' }
} as const
const started = computed(() => !!studio.onboarding.value?.completed)
const blocking = computed(() => !(studio.bank.value?.items?.length))
</script>

<template>
  <div class="flex max-w-[820px] flex-col gap-6">
    <StudioStepHeader :n="8" tag="Dernière étape" title="Tout est prêt, ou presque">
      Voici l’essentiel. Tout reste modifiable plus tard.
    </StudioStepHeader>

    <div class="flex flex-wrap gap-2.5">
      <span class="st-badge st-badge-ok !h-8 !px-3.5">{{ count('ok') }} réglées</span>
      <span class="st-badge st-badge-warn !h-8 !px-3.5">{{ count('warn') }} à compléter</span>
      <span class="st-badge st-badge-neutral !h-8 !px-3.5">{{ count('skip') + count('todo') }} passée(s)</span>
    </div>

    <section class="st-card !py-0">
      <div v-for="(r, i) in rows" :key="r.n" class="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 py-3.5" :class="i ? 'border-t border-[#2C2837]' : ''">
        <span class="flex h-8 w-8 flex-none items-center justify-center rounded-full text-sm font-extrabold" :class="look[r.status].cls">
          {{ r.status === 'ok' ? '✓' : r.status === 'warn' ? '!' : '–' }}
        </span>
        <div class="min-w-0 flex-1 basis-56">
          <div class="text-[15px] font-bold leading-snug">{{ r.n }}. {{ r.label }} <span class="ml-1.5 text-xs font-extrabold tracking-wide" :class="look[r.status].cls.split(' ')[1]">{{ look[r.status].tag }}</span></div>
          <div class="text-[13px] leading-5 st-muted">{{ r.text }}</div>
        </div>
        <button type="button" class="st-btn-quiet text-sm" :aria-label="`${look[r.status].go} : ${r.label}`" @click="studio.goToStep(r.n)">{{ look[r.status].go }}</button>
      </div>
    </section>

    <section class="st-card flex flex-col gap-4">
      <template v-if="!started">
        <div>
          <h2 class="m-0 text-[17px] font-bold">{{ blocking ? 'Il te faut au moins un clip de référence' : 'Tu peux démarrer maintenant' }}</h2>
          <p class="m-0 mt-1.5 text-sm leading-relaxed st-muted">
            {{ blocking
              ? 'Sans clip de référence, Clippeak ne sait pas quoi chercher. Retourne à l’étape 1.'
              : 'Ce qui est passé utilise les réglages par défaut. Les plateformes à connecter n’empêchent pas de valider tes clips : tu les téléchargeras en attendant.' }}
          </p>
        </div>
        <div>
          <button v-if="blocking" type="button" class="st-btn st-btn-lg" @click="studio.goToStep(1)">Ajouter un clip de référence</button>
          <button v-else type="button" class="st-btn st-btn-lg" :disabled="studio.busy.value" @click="studio.finishOnboarding">Clippeak surveille mon prochain live</button>
        </div>
      </template>
      <template v-else>
        <div class="st-alert st-alert-ok"><div><strong class="font-extrabold">Clippeak surveille ton prochain live.</strong> <span class="text-[#A5EBD2]">Tes premiers clips arriveront par lots de 4, à valider dans ton tableau de bord.</span></div></div>
        <div><button type="button" class="st-btn-ghost" @click="studio.view.value = 'dashboard'">Aller au tableau de bord</button></div>
      </template>
    </section>
  </div>
</template>
