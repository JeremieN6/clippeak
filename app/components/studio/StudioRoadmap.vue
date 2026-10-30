<script setup lang="ts">
// « Prochainement » : le streamer vote, par blocs de 2 fonctions, celle qui sera developpee en priorite, voit ce qui est en cours
// et ce qui a ete livre grace aux votes, et peut proposer une idee. Les totaux n'apparaissent qu'apres le vote.
const studio = useStudio()

interface Feature { id: string, title: string, description: string, carried?: boolean }
interface RoadmapData {
  canVote: boolean
  block: { id: string, status: string, endsAt: string, features: Feature[], myVote: string | null, totals: Record<string, number> | null, tied: boolean } | null
  inProgress: Array<Feature & { status: string }>
  waiting: Feature[]
  delivered: Feature[]
  ideasLeft: number
  notice: { blockId: string, won: boolean, winnerTitle: string } | null
}

const data = ref<RoadmapData | null>(null)
const idea = ref('')
const asAdmin = computed(() => studio.mode.value === 'admin' ? studio.channelId.value : undefined)

async function load() {
  data.value = await studio.api<RoadmapData>('/api/studio/roadmap', { query: { channel: asAdmin.value } })
  studio.loadRoadmapDot()
}
onMounted(() => studio.run(load))

const daysLeft = computed(() => {
  if (!data.value?.block) return 0
  return Math.max(0, Math.ceil((new Date(data.value.block.endsAt).getTime() - Date.now()) / 86_400_000))
})
const endText = computed(() => daysLeft.value <= 1 ? 'Se termine aujourd’hui ou demain' : `Se termine dans ${daysLeft.value} jours`)

const vote = (featureId: string) => studio.run(async () => {
  await studio.api('/api/studio/roadmap/vote', { method: 'POST', body: { blockId: data.value!.block!.id, featureId, channelId: asAdmin.value } })
  await load()
}, 'Vote enregistré. Tu peux le changer jusqu’à la fin du vote.')

const sendIdea = () => studio.run(async () => {
  await studio.api('/api/studio/roadmap/idea', { method: 'POST', body: { text: idea.value, channelId: asAdmin.value } })
  idea.value = ''
  await load()
}, 'Merci ! Ton idée est arrivée dans notre liste.')

const dismissNotice = () => studio.run(async () => {
  await studio.api('/api/studio/roadmap/seen', { method: 'POST', body: { blockId: data.value!.notice!.blockId, channelId: asAdmin.value } })
  await load()
})

const total = computed(() => {
  const t = data.value?.block?.totals
  return t ? Object.values(t).reduce((a, b) => a + b, 0) : 0
})
const share = (id: string) => {
  const t = data.value?.block?.totals
  return t && total.value ? Math.round((t[id] / total.value) * 100) : 0
}
const statusLabel: Record<string, { text: string, cls: string }> = {
  building: { text: 'En cours', cls: 'st-badge-info' },
  waiting_access: { text: 'En attente d’accès', cls: 'st-badge-warn' }
}
</script>

<template>
  <main class="mx-auto flex w-full max-w-[860px] flex-col gap-8 px-5 py-8 sm:px-10">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-col gap-1.5">
        <h1 class="st-title m-0 text-[28px] font-bold leading-tight sm:text-[32px]">Prochainement</h1>
        <p class="m-0 max-w-xl text-sm leading-relaxed st-muted">C’est toi qui décides de ce que Clippeak fait ensuite. Vote pour ce qui t’aiderait le plus : la fonction la plus votée est développée en priorité.</p>
      </div>
      <button type="button" class="st-btn-ghost" @click="studio.view.value = studio.onboarding.value?.completed || studio.clips.value.length ? 'dashboard' : 'onboarding'">← Retour</button>
    </div>

    <div v-if="data?.notice" class="st-alert flex-wrap items-center" :class="data.notice.won ? 'st-alert-ok' : 'st-alert-info'" role="status">
      <span class="min-w-[220px] flex-1">
        <template v-if="data.notice.won">Ton vote a gagné : « <strong>{{ data.notice.winnerTitle }}</strong> » passe en priorité. Merci !</template>
        <template v-else>« <strong>{{ data.notice.winnerTitle }}</strong> » a gagné ce vote. Ton choix reste dans la liste et compte pour le prochain.</template>
      </span>
      <button type="button" class="st-btn-ghost" :disabled="studio.busy.value" @click="dismissNotice">OK</button>
    </div>

    <section v-if="data?.block" class="flex flex-col gap-4" aria-labelledby="vote-title">
      <div class="flex flex-wrap items-center gap-2">
        <span class="st-badge st-badge-violet">En vote</span>
        <h2 id="vote-title" class="st-title m-0 text-xl font-bold">Que veux-tu en premier ?</h2>
        <span class="text-[13px] st-muted sm:ml-auto">{{ endText }}</span>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <article v-for="f in data.block.features" :key="f.id" class="st-card flex flex-col gap-3 !p-5" :class="data.block.myVote === f.id ? '!border-st-accentLight !bg-st-accentBg' : ''">
          <div class="flex flex-col gap-1.5">
            <h3 class="st-title m-0 text-lg font-bold leading-6">{{ f.title }}</h3>
            <p class="m-0 text-sm leading-relaxed st-muted">{{ f.description }}</p>
            <p v-if="f.carried" class="m-0 text-[13px] text-st-accentLight">Déjà soutenue lors d’un vote précédent.</p>
          </div>
          <div v-if="data.block.totals" class="flex flex-col gap-1.5">
            <div class="flex justify-between text-[13px] font-bold"><span>{{ data.block.totals[f.id] }} vote{{ data.block.totals[f.id] > 1 ? 's' : '' }}</span><span class="st-muted">{{ share(f.id) }} %</span></div>
            <div class="h-1.5 overflow-hidden rounded-[3px] bg-st-border" aria-hidden="true"><div class="st-bar" :style="{ width: `${share(f.id)}%` }" /></div>
          </div>
          <div class="mt-auto">
            <span v-if="data.block.myVote === f.id" class="st-badge st-badge-ok st-pop">Ton vote</span>
            <button v-else-if="data.canVote && data.block.status === 'open'" type="button" class="st-btn w-full" :disabled="studio.busy.value" @click="vote(f.id)">{{ data.block.myVote ? 'Changer pour celle-ci' : 'Voter pour celle-ci' }}</button>
          </div>
        </article>
      </div>

      <p v-if="data.block.tied" class="st-alert st-alert-info m-0" role="status">Égalité : l’équipe tranche, tu verras le résultat ici très vite.</p>
      <p v-else-if="!data.block.myVote && data.canVote" class="m-0 text-[13px] st-muted">Les résultats s’affichent une fois que tu as voté, pour que chacun choisisse librement.</p>
      <p v-else-if="!data.canVote" class="m-0 text-[13px] st-muted">Vue administrateur : ouvre une chaîne pour voter à sa place.</p>
    </section>

    <section v-else-if="data" class="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-st-borderStrong px-6 py-10 text-center">
      <h2 class="st-title m-0 text-lg font-bold">Pas de vote en ce moment</h2>
      <p class="m-0 max-w-sm text-sm st-muted">Un nouveau vote arrive bientôt. En attendant, tu peux proposer une idée ci-dessous.</p>
    </section>

    <section v-if="data?.inProgress.length" class="flex flex-col gap-3" aria-labelledby="progress-title">
      <h2 id="progress-title" class="st-title m-0 text-xl font-bold">En préparation</h2>
      <ul class="m-0 flex list-none flex-col gap-3 p-0">
        <li v-for="f in data.inProgress" :key="f.id" class="st-card flex flex-wrap items-start justify-between gap-x-4 gap-y-2 !p-4">
          <div class="min-w-[220px] flex-1">
            <div class="font-bold">{{ f.title }}</div>
            <div class="text-sm st-muted">{{ f.description }}</div>
          </div>
          <span class="st-badge" :class="statusLabel[f.status]?.cls ?? 'st-badge-neutral'">{{ statusLabel[f.status]?.text ?? f.status }}</span>
        </li>
      </ul>
    </section>

    <section v-if="data?.waiting.length" class="flex flex-col gap-3" aria-labelledby="waiting-title">
      <h2 id="waiting-title" class="st-title m-0 text-xl font-bold">Dans la liste</h2>
      <ul class="m-0 flex list-none flex-col gap-2 p-0">
        <li v-for="f in data.waiting" :key="f.id" class="flex flex-col gap-0.5 rounded-xl border border-st-border px-4 py-3">
          <span class="font-semibold">{{ f.title }}</span>
          <span class="text-[13px] st-muted">{{ f.description }}</span>
        </li>
      </ul>
    </section>

    <section v-if="data?.delivered.length" class="flex flex-col gap-3" aria-labelledby="done-title">
      <h2 id="done-title" class="st-title m-0 text-xl font-bold">Livré grâce à vos votes</h2>
      <ul class="m-0 flex list-none flex-col gap-3 p-0">
        <li v-for="f in data.delivered" :key="f.id" class="st-card flex flex-wrap items-start justify-between gap-x-4 gap-y-2 !border-st-okBorder !bg-st-okBg !p-4">
          <div class="min-w-[220px] flex-1">
            <div class="font-bold">{{ f.title }}</div>
            <div class="text-sm st-muted">{{ f.description }}</div>
          </div>
          <span class="st-badge st-badge-ok">Livré</span>
        </li>
      </ul>
    </section>

    <section class="st-card flex flex-col gap-3" aria-labelledby="idea-title">
      <h2 id="idea-title" class="st-title m-0 text-xl font-bold">Propose une idée</h2>
      <p class="m-0 text-sm st-muted">Une fonction qui te manque ? Dis-le en quelques mots : elle peut entrer dans un prochain vote.</p>
      <form class="flex flex-col gap-3" @submit.prevent="sendIdea">
        <label for="idea" class="sr-only">Ton idée</label>
        <textarea id="idea" v-model="idea" class="st-field !h-auto min-h-28 py-3" maxlength="500" placeholder="Exemple : pouvoir choisir la musique de fond de mes clips" />
        <div class="flex flex-wrap items-center gap-3">
          <button type="submit" class="st-btn" :disabled="studio.busy.value || idea.trim().length < 5 || (data?.ideasLeft ?? 0) < 1 || !data?.canVote">Envoyer mon idée</button>
          <span class="text-[13px] st-muted">{{ idea.length }}/500</span>
        </div>
      </form>
    </section>
  </main>
</template>
