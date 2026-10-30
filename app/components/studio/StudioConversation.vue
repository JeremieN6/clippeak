<script setup lang="ts">
// Colonne de droite de l'onboarding, en conversation (maquette « Onboarding en conversation ») : les etapes deja faites se replient
// en une ligne (chacune reste modifiable), puis Clippeak « ecrit » ses phrases de l'etape en cours et la zone de reponse (le formulaire
// de l'etape) s'ouvre dessous. Conversation ecrite a l'avance, sans IA.
const studio = useStudio()
const step = studio.step
const o = computed(() => studio.onboarding.value)
const name = computed(() => studio.channels.value.find(c => c.id === studio.channelId.value)?.displayName ?? '')

const LABELS: Record<number, string> = {
  1: 'Tes clips de référence', 2: 'Tes photos', 3: 'Le look de tes clips', 4: 'Les sons',
  5: 'Tes illustrations', 6: 'La détection', 7: 'Tes plateformes', 8: 'Récapitulatif'
}

// Phrases de Clippeak pour chaque etape (un tableau = plusieurs bulles). `**mot**` = en gras.
const lines = computed<string[]>(() => {
  const who = name.value ? ` ${name.value}` : ''
  switch (step.value) {
    case 1: return [`Salut${who} ! Je suis Clippeak. Je repère les meilleurs moments de tes lives et j’en fais des clips verticaux.`, 'Pour commencer, **montre-moi 5 à 10 clips qui ont bien marché chez toi.** Ça m’aide à reconnaître tes meilleurs moments.']
    case 2: return ['Pour te garder bien cadré, **envoie-moi 3 à 5 photos de toi, de face.** Je te reconnais ensuite dans tes lives.']
    case 3: return ['Voyons le look de tes clips. **Tu le règles une fois, il s’applique à tous.** L’aperçu bouge pendant que tu règles.']
    case 4: return ['Tu veux des **bruitages** sur tes clips ? Choisis un petit son pour chaque moment, ou coupe-les.']
    case 5: return ['Si tu as de courtes vidéos à glisser dans tes clips, **dépose-les ici.** C’est facultatif : mes clips fonctionnent très bien sans.']
    case 6: return ['**Quels mots écrit ton chat quand il réagit ?** Et quelle durée pour tes clips ?']
    case 7: return ['**Où veux-tu publier tes clips ?** Rien n’est jamais publié sans ton accord.']
    default: return [`On a fait le tour${who ? `,${who}` : ''}. Voilà ce que j’ai retenu.`]
  }
})

// Etapes deja traitees avant celle-ci : une ligne chacune.
const folded = computed(() => Array.from({ length: step.value - 1 }, (_, i) => i + 1)
  .filter(n => o.value?.done.includes(n) || o.value?.skipped.includes(n))
  .map((n) => {
    const skipped = !!o.value?.skipped.includes(n) && !o.value?.done.includes(n)
    return { n, label: LABELS[n], skipped, text: skipped ? 'Passée' : studio.stepStatus(n).text }
  }))

// « Clippeak ecrit… » : un court delai avant les bulles (400 a 700 ms), supprime si l'utilisateur prefere moins d'animations.
const typing = ref(false)
const shown = ref(0)
let timers: ReturnType<typeof setTimeout>[] = []
function play() {
  timers.forEach(clearTimeout)
  timers = []
  const reduce = import.meta.client && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduce) { typing.value = false; shown.value = lines.value.length; return }
  shown.value = 0
  typing.value = true
  lines.value.forEach((_, i) => {
    timers.push(setTimeout(() => { shown.value = i + 1; typing.value = i + 1 < lines.value.length }, 520 * (i + 1)))
  })
}
watch(step, play)
onMounted(play)
onBeforeUnmount(() => timers.forEach(clearTimeout))

// **gras** -> <strong> sans jamais injecter de HTML : on decoupe le texte.
const parts = (text: string) => text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(t => t.startsWith('**') ? { b: true, t: t.slice(2, -2) } : { b: false, t })
</script>

<template>
  <div class="mx-auto flex w-full flex-col gap-3" :class="step === 3 ? 'max-w-[1040px]' : 'max-w-[720px]'" role="log" aria-live="polite" aria-label="Conversation avec Clippeak">
    <!-- Etapes deja faites, repliees -->
    <div v-for="f in folded" :key="f.n" class="flex min-h-[52px] items-center gap-2.5 rounded-xl border border-st-border bg-st-surface py-0 pl-3.5 pr-1.5">
      <span class="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full" :class="f.skipped ? 'bg-st-raised2 text-st-soft' : 'bg-st-okBg text-st-ok'" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path v-if="!f.skipped" d="M5 12.5l4.5 4.5L19 7.5" /><path v-else d="M6 12h12" /></svg>
      </span>
      <span class="min-w-0 flex-1 truncate text-sm">Étape {{ f.n }} · <strong class="font-bold">{{ f.skipped ? f.label : f.text }}</strong><span v-if="f.skipped" class="st-muted"> · {{ f.text }}</span></span>
      <button type="button" class="h-11 flex-none rounded-[10px] border-0 bg-transparent px-3 text-sm font-bold text-st-accentLight hover:bg-st-raised" :aria-label="`Modifier l’étape ${f.n}, ${f.label}`" @click="step = f.n">Modifier</button>
    </div>

    <!-- Separateur d'etape -->
    <div class="my-1 flex items-center gap-3" :key="`sep-${step}`">
      <span class="h-px flex-1 bg-st-border" />
      <span class="whitespace-nowrap text-xs font-extrabold uppercase tracking-[.08em] text-st-accentLight">Étape {{ step }} · {{ LABELS[step] }}</span>
      <span class="h-px flex-1 bg-st-border" />
    </div>

    <!-- Bulles de Clippeak -->
    <div v-for="(line, i) in lines.slice(0, shown)" :key="`${step}-${i}`" class="st-bubble-in flex items-start gap-2.5">
      <span v-if="i === 0" class="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-st-accent text-xs font-extrabold text-white" aria-hidden="true">CP</span>
      <span v-else class="w-8 flex-none" />
      <div class="max-w-[520px] border border-st-border bg-st-surface px-4 py-3 text-[15px] leading-6" :class="i === 0 ? 'rounded-[4px_16px_16px_16px]' : 'rounded-2xl'">
        <template v-for="(p, k) in parts(line)" :key="k"><strong v-if="p.b" class="font-extrabold">{{ p.t }}</strong><template v-else>{{ p.t }}</template></template>
      </div>
    </div>

    <!-- Clippeak ecrit… -->
    <div v-if="typing" class="flex items-start gap-2.5" role="status" aria-label="Clippeak écrit">
      <span v-if="shown === 0" class="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-st-accent text-xs font-extrabold text-white" aria-hidden="true">CP</span>
      <span v-else class="w-8 flex-none" />
      <div class="inline-flex h-11 items-center gap-1.5 rounded-2xl border border-st-border bg-st-surface px-4" aria-hidden="true">
        <span class="st-typing-dot h-2 w-2 rounded-full bg-st-dim" /><span class="st-typing-dot h-2 w-2 rounded-full bg-st-dim" /><span class="st-typing-dot h-2 w-2 rounded-full bg-st-dim" />
      </div>
    </div>

    <!-- Zone de reponse : le formulaire de l'etape -->
    <section v-if="!typing" class="st-conv-zone st-bubble-in flex flex-col gap-3.5 rounded-2xl border-[1.5px] border-st-accentBorder bg-st-surface p-4 sm:p-5" aria-label="Ta réponse">
      <div class="text-xs font-extrabold uppercase tracking-widest text-st-accentLight">Ta réponse</div>
      <Transition name="st-step" mode="out-in">
        <div :key="step">
          <StudioStepReference v-if="step === 1" />
          <StudioStepPhotos v-else-if="step === 2" />
          <StudioStepLook v-else-if="step === 3" />
          <StudioStepSounds v-else-if="step === 4" />
          <StudioStepIllustrations v-else-if="step === 5" />
          <StudioStepDetection v-else-if="step === 6" />
          <StudioStepPlatforms v-else-if="step === 7" />
          <StudioStepRecap v-else />
        </div>
      </Transition>
    </section>
  </div>
</template>
