<script setup lang="ts">
// Etape 1, volontairement courte : deposer ou coller des clips, voir l'objectif avancer, puis ce que Clippeak en retient.
// Les statistiques (facultatives) sont derriere « Plus d'options ».
const studio = useStudio()
const GOAL = 5
const urls = ref('')
const picked = ref<File[]>([])
const over = ref(false)

const statusLook: Record<string, { label: string, cls: string }> = {
  done: { label: 'Analysé', cls: 'st-badge-ok' },
  processing: { label: 'Analyse…', cls: 'st-badge-info' },
  pending: { label: 'En attente', cls: 'st-badge-neutral' },
  failed: { label: 'Échec', cls: 'st-badge-error' }
}

const items = computed(() => studio.bank.value?.items ?? [])
const profile = computed(() => studio.bank.value?.profile)
const analyzed = computed(() => profile.value?.analyzedCount ?? 0)
const analyzing = computed(() => items.value.length > 0 && analyzed.value < items.value.length && items.value.some((i: any) => i.status === 'pending' || i.status === 'processing'))
const analysisPct = computed(() => items.value.length ? Math.round((analyzed.value / items.value.length) * 100) : 0)

const goalText = computed(() => {
  const n = items.value.length
  if (!n) return `Objectif : ${GOAL} clips.`
  if (n < GOAL) return `${n} sur ${GOAL} : encore ${GOAL - n} pour de meilleurs résultats.`
  return 'Parfait, c’est largement assez.'
})

const retained = computed(() => !profile.value ? [] : [
  ...(profile.value.topics ?? []).slice(0, 6).map((t: any) => t.word),
  ...(profile.value.formats ?? []).slice(0, 4).map((f: any) => f.name)
])

const pickedLabel = computed(() => picked.value.length === 1 ? picked.value[0].name : `${picked.value.length} vidéos prêtes`)
const addLabel = computed(() => {
  const count = picked.value.length + urls.value.split(/\s+/).filter(Boolean).length
  return count > 1 ? `Ajouter ces ${count} clips` : 'Ajouter ce clip'
})

function onPick(event: Event) {
  picked.value = Array.from((event.target as HTMLInputElement).files ?? [])
}

function onDrop(event: DragEvent) {
  over.value = false
  picked.value = Array.from(event.dataTransfer?.files ?? [])
}

async function add() {
  await studio.addReferences(picked.value, urls.value)
  picked.value = []
  urls.value = ''
}

const stats = [['viewCount', 'Vues'], ['likeCount', 'Likes'], ['commentCount', 'Commentaires'], ['shareCount', 'Partages']] as const
const withStats = computed(() => items.value.filter((i: any) => i.status === 'done' && i.kind === 'clip'))
</script>

<template>
  <div class="flex max-w-[720px] flex-col gap-6">
    <StudioStepHeader :n="1" tag="Obligatoire" title="Tes clips de référence">
      Montre à Clippeak 5 à 10 clips qui ont bien marché chez toi.
    </StudioStepHeader>

    <section class="st-card st-rise flex flex-col gap-4" style="--d: .08s">
      <label class="st-dropzone" :class="{ 'is-over': over }" @dragover.prevent="over = true" @dragleave="over = false" @drop.prevent="onDrop">
        <span class="st-dz-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
        </span>
        <span class="text-base font-bold">{{ picked.length ? pickedLabel : 'Dépose tes vidéos ici' }}</span>
        <span class="st-hint">{{ picked.length ? 'Prêt à être ajouté.' : 'ou clique pour choisir · MP4, MOV, WebM · 80 Mo max' }}</span>
        <input type="file" multiple accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" aria-label="Choisir des vidéos" class="sr-only" @change="onPick">
      </label>

      <textarea v-model="urls" rows="2" class="st-field" aria-label="Liens de clips ou de comptes" placeholder="…ou colle des liens : clips ou comptes YouTube, TikTok, Instagram" />

      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" class="st-btn" :disabled="studio.busy.value || !(picked.length || urls.trim())" @click="add">{{ addLabel }}</button>
        <span class="st-hint">Un compte collé = ses derniers clips.</span>
      </div>
    </section>

    <div class="st-rise flex items-center gap-3" style="--d: .16s" role="status">
      <div class="flex gap-1.5" aria-hidden="true"><span v-for="i in GOAL" :key="i" class="st-dot" :class="{ on: i <= items.length }" /></div>
      <span class="text-sm font-semibold">{{ goalText }}</span>
    </div>

    <section v-if="items.length" class="st-card st-rise flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="m-0 text-[17px] font-bold">Ce que Clippeak retient</h2>
        <button type="button" class="st-btn-quiet" :disabled="studio.busy.value" @click="studio.run(studio.loadBank)">Actualiser</button>
      </div>
      <template v-if="analyzing">
        <p class="st-pulse m-0 text-sm st-muted">Analyse en cours : {{ analyzed }} clip(s) sur {{ items.length }}. Tu peux continuer, ça se fait en arrière-plan.</p>
        <div class="h-1.5 overflow-hidden rounded-[3px] bg-[#2C2837]" role="progressbar" aria-label="Analyse des clips" :aria-valuenow="analysisPct" aria-valuemin="0" aria-valuemax="100">
          <div class="st-bar st-bar-live" :style="{ width: `${Math.max(analysisPct, 6)}%` }" />
        </div>
      </template>
      <div v-else-if="retained.length" class="flex flex-wrap gap-1.5">
        <span v-for="(w, i) in retained" :key="w" class="st-badge st-badge-violet st-pop" :style="{ '--d': `${i * 0.05}s` }">{{ w }}</span>
      </div>
      <p v-else class="st-muted m-0 text-sm">Dès qu’un clip est analysé, ce que Clippeak en retient apparaît ici.</p>

      <TransitionGroup name="st-list" tag="ul" class="m-0 flex list-none flex-col p-0">
        <li v-for="item in items" :key="item.id" class="flex items-center gap-3 border-t border-[#2C2837] py-2.5">
          <span class="min-w-0 flex-1 truncate text-sm font-semibold" :title="item.title || item.url">{{ item.kind === 'account' ? 'Compte : ' : '' }}{{ item.title || item.url || 'sans titre' }}</span>
          <span class="st-badge" :class="(statusLook[item.status] ?? statusLook.pending).cls" :title="item.status === 'failed' ? item.error || 'Impossible de lire cette vidéo.' : undefined">{{ (statusLook[item.status] ?? statusLook.pending).label }}</span>
          <button type="button" class="st-btn-quiet !min-h-9 !px-2 !text-[#ABA5BA]" :disabled="studio.busy.value" :aria-label="`Retirer ${item.title || item.url || 'ce clip'}`" @click="studio.removeReference(item.id)">✕</button>
        </li>
      </TransitionGroup>
    </section>

    <details v-if="withStats.length" class="st-card">
      <summary class="cursor-pointer text-[15px] font-bold">Plus d’options : tes statistiques (facultatif)</summary>
      <p class="st-hint mt-2">Si tu les connais, Clippeak donne plus de poids aux clips qui ont le mieux marché. Sinon, ils comptent tous pareil.</p>
      <div v-for="item in withStats" :key="item.id" class="mt-4 flex flex-col gap-2">
        <div class="truncate text-sm font-semibold">{{ item.title || item.url }}</div>
        <div class="grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
          <label v-for="s in stats" :key="s[0]" class="flex flex-col gap-1 text-[13px] st-muted">
            {{ s[1] }}
            <input :value="item[s[0]] ?? ''" inputmode="numeric" class="st-field" placeholder="12000" @change="studio.saveStat(item.id, s[0], ($event.target as HTMLInputElement).value)">
          </label>
        </div>
      </div>
    </details>
  </div>
</template>
