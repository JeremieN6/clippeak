<script setup lang="ts">
// « Prochainement » (maquette « Prochainement ») : a gauche le vote en cours (choisir, puis voter) ou la liste, ce qui est en
// preparation et ce qui est livre ; a droite « Propose une idee ». Les totaux n'apparaissent qu'apres le vote.
const studio = useStudio()

interface Feature { id: string, slug: string, title: string, description: string, carried?: boolean }
interface RoadmapData {
  canVote: boolean
  block: { id: string, status: string, endsAt: string, features: Feature[], myVote: string | null, totals: Record<string, number> | null, tied: boolean } | null
  inProgress: Array<Feature & { status: string, wonWith: number | null }>
  waiting: Feature[]
  delivered: Array<Feature & { wonWith: number | null }>
  ideasLeft: number
  notice: { blockId: string, won: boolean, winnerTitle: string } | null
}

const data = ref<RoadmapData | null>(null)
const pick = ref('')
const idea = ref('')
const sent = ref(false)
type Tab = 'vote' | 'doing' | 'done'
const tab = ref<Tab>('vote')
const asAdmin = computed(() => studio.mode.value === 'admin' ? studio.channelId.value : undefined)

async function load() {
  data.value = await studio.api<RoadmapData>('/api/studio/roadmap', { query: { channel: asAdmin.value } })
  pick.value = data.value.block?.myVote ?? ''
  if (!first.done) { first.done = true; if (!data.value.block && data.value.inProgress.length) tab.value = 'doing' }
}
const first = { done: false }
onMounted(() => studio.run(load))

const tabs = computed(() => [
  { id: 'vote' as const, label: 'En vote', count: (data.value?.block ? 1 : 0) + (data.value?.waiting.length ?? 0) },
  { id: 'doing' as const, label: 'En cours', count: data.value?.inProgress.length ?? 0 },
  { id: 'done' as const, label: 'Livré', count: data.value?.delivered.length ?? 0 }
])
const votesText = (n: number | null) => n === null ? '' : n === 0 ? 'Choisie par l’équipe' : `Choisie avec ${n} vote${n > 1 ? 's' : ''}`

const back = () => { studio.view.value = studio.onboarding.value?.completed || studio.clips.value.length ? 'dashboard' : 'onboarding' }

const daysLeft = computed(() => data.value?.block ? Math.max(0, Math.ceil((new Date(data.value.block.endsAt).getTime() - Date.now()) / 86_400_000)) : 0)
const endText = computed(() => daysLeft.value <= 1 ? 'Se termine aujourd’hui ou demain' : `Se termine dans ${daysLeft.value} jours`)

const voted = computed(() => Boolean(data.value?.block?.myVote))
const total = computed(() => Object.values(data.value?.block?.totals ?? {}).reduce((a, b) => a + b, 0))
const pct = (id: string) => total.value ? Math.round(((data.value?.block?.totals?.[id] ?? 0) / total.value) * 100) : 0
const canSubmit = computed(() => Boolean(pick.value) && pick.value !== data.value?.block?.myVote && data.value?.canVote && data.value?.block?.status === 'open')
const voteLabel = computed(() => !voted.value ? 'Voter' : pick.value === data.value?.block?.myVote ? 'Vote enregistré' : 'Changer mon vote')

const vote = () => studio.run(async () => {
  await studio.api('/api/studio/roadmap/vote', { method: 'POST', body: { blockId: data.value!.block!.id, featureId: pick.value, channelId: asAdmin.value } })
  await load()
}, 'Vote enregistré. Tu peux le changer jusqu’à la fin du vote.')

const sendIdea = () => studio.run(async () => {
  await studio.api('/api/studio/roadmap/idea', { method: 'POST', body: { text: idea.value, channelId: asAdmin.value } })
  idea.value = ''
  sent.value = true
  await load()
})

const dismissNotice = () => studio.run(async () => {
  await studio.api('/api/studio/roadmap/seen', { method: 'POST', body: { blockId: data.value!.notice!.blockId, channelId: asAdmin.value } })
  await load()
})

const icons: Record<string, string> = {
  tiktok: 'M14 4v10.5a3.5 3.5 0 11-3.5-3.5M14 4c0 2.2 1.8 4 4 4',
  instagram: 'M5 5h14v14H5zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM16.5 7.5h.01',
  stats: 'M5 20V11M12 20V5M19 20v-7'
}
const icon = (slug: string) => icons[slug] ?? 'M12 3l2.2 5.3L20 10l-4.3 3.8L17 20l-5-3-5 3 1.3-6.2L4 10l5.8-1.7z'
const statusLabel: Record<string, { text: string, cls: string }> = {
  building: { text: 'En cours', cls: 'st-badge-info' },
  waiting_access: { text: 'En attente d’accès', cls: 'st-badge-warn' }
}
</script>

<template>
  <main class="mx-auto flex w-full max-w-[1080px] flex-col gap-7 px-5 pb-16 pt-6 sm:px-8 sm:pt-9">
    <div class="flex max-w-[640px] flex-col gap-2">
      <button type="button" class="-ml-2 inline-flex h-11 items-center gap-1.5 self-start rounded-[10px] border-0 bg-transparent px-2 text-sm font-bold text-st-muted hover:text-st-text" @click="back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        Retour
      </button>
      <h1 class="st-title m-0 text-[34px] font-extrabold leading-10">Prochainement</h1>
      <p class="m-0 text-base leading-[26px] st-muted">C’est toi qui décides de ce que Clippeak fait ensuite. Vote pour ce qui t’aiderait le plus : la fonction la plus votée est développée en priorité.</p>
    </div>

    <div v-if="data?.notice" class="st-alert flex-wrap items-center" :class="data.notice.won ? 'st-alert-ok' : 'st-alert-info'" role="status">
      <span class="min-w-[220px] flex-1">
        <template v-if="data.notice.won">Ton vote a gagné : « <strong>{{ data.notice.winnerTitle }}</strong> » passe en priorité. Merci !</template>
        <template v-else>« <strong>{{ data.notice.winnerTitle }}</strong> » a gagné ce vote. Ton choix reste dans la liste et compte pour le prochain.</template>
      </span>
      <button type="button" class="st-btn-ghost" :disabled="studio.busy.value" @click="dismissNotice">OK</button>
    </div>

    <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
      <div class="flex min-w-0 flex-col gap-6">
        <div role="tablist" aria-label="Où en sont les fonctions" class="flex gap-1 self-start rounded-xl border border-st-border bg-st-surface p-1">
          <button
            v-for="t in tabs" :id="`tab-${t.id}`" :key="t.id" type="button" role="tab" :aria-selected="tab === t.id" :aria-controls="`panel-${t.id}`"
            class="inline-flex h-11 items-center gap-2 rounded-[9px] border-0 px-3.5 text-sm font-bold sm:px-4"
            :class="tab === t.id ? 'bg-st-accentBg text-st-accentText' : 'bg-transparent text-st-muted hover:text-st-text'" @click="tab = t.id"
          >
            {{ t.label }}
            <span class="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-extrabold" :class="tab === t.id ? 'bg-st-accent text-white' : 'bg-st-raised2 text-st-soft'">{{ t.count }}</span>
          </button>
        </div>

        <div v-show="tab === 'vote'" id="panel-vote" role="tabpanel" aria-labelledby="tab-vote" class="flex flex-col gap-6">
        <!-- Vote en cours -->
        <section v-if="data?.block" class="flex flex-col gap-[18px] rounded-2xl border border-st-accentBorder bg-st-surface p-5 sm:p-6" aria-labelledby="vt">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex flex-col gap-1">
              <span class="inline-flex h-[26px] items-center gap-1.5 self-start rounded-full bg-st-accentBg px-2.5 text-xs font-extrabold text-st-accentText"><span class="h-[7px] w-[7px] rounded-full bg-st-accentLight" />En vote</span>
              <h2 id="vt" class="st-title m-0 mt-1.5 text-[22px] font-bold leading-7">Que doit faire Clippeak en premier ?</h2>
            </div>
            <div class="text-[13px] st-muted">{{ endText }}. Un seul choix, modifiable jusqu’à la fin.</div>
          </div>

          <div role="radiogroup" aria-labelledby="vt" class="flex flex-col gap-2.5">
            <button
              v-for="f in data.block.features" :key="f.id" type="button" role="radio" :aria-checked="pick === f.id"
              :disabled="!data.canVote || data.block.status !== 'open'"
              class="flex min-h-[72px] items-center gap-3.5 rounded-xl p-3 px-4 text-left text-st-text"
              :class="pick === f.id ? 'border-[1.5px] border-st-accentLight bg-st-accentBg' : 'border border-st-border bg-st-field hover:bg-st-raised'"
              @click="pick = f.id"
            >
              <span class="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full border-2" :class="pick === f.id ? 'border-st-accentLight' : 'border-st-dim'" aria-hidden="true">
                <span class="h-2.5 w-2.5 rounded-full" :class="pick === f.id ? 'bg-st-accentLight' : 'bg-transparent'" />
              </span>
              <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="text-base font-bold">{{ f.title }}</span>
                <span class="text-[13px] leading-5 st-muted">{{ f.description }}</span>
                <span v-if="f.carried" class="text-[13px] text-st-accentLight">Déjà soutenue lors d’un vote précédent.</span>
              </span>
              <span v-if="voted && data.block.totals" class="st-title text-lg font-bold text-st-accentText">{{ pct(f.id) }}&nbsp;%</span>
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-3.5">
            <button type="button" class="st-btn !min-h-12 !px-6" :disabled="!canSubmit || studio.busy.value" @click="vote">{{ voteLabel }}</button>
            <span class="text-[13px]" :class="voted && pick === data.block.myVote ? 'text-st-ok' : 'st-muted'" role="status">
              <template v-if="data.block.tied">Égalité : l’équipe tranche, tu verras le résultat ici très vite.</template>
              <template v-else-if="voted && pick === data.block.myVote">Merci ! Voici où en sont les votes pour l’instant.</template>
              <template v-else-if="!data.canVote">Vue administrateur : ouvre une chaîne pour voter à sa place.</template>
              <template v-else-if="!pick">Choisis une option pour voter. Les résultats s’affichent après ton vote.</template>
            </span>
          </div>
        </section>

        <!-- Pas de vote -->
        <template v-else-if="data">
          <section class="flex items-center gap-4 rounded-2xl border border-dashed border-st-borderStrong bg-st-surface px-6 py-5">
            <span class="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-st-raised2 text-st-soft" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </span>
            <div>
              <h2 class="st-title m-0 mb-0.5 text-lg font-bold leading-6">Pas de vote en ce moment</h2>
              <div class="text-sm leading-[22px] st-muted">Un nouveau vote arrive bientôt. En attendant, tu peux proposer une idée.</div>
            </div>
          </section>
          <section v-if="data.waiting.length" class="flex flex-col gap-3" aria-labelledby="lt">
            <h2 id="lt" class="st-title m-0 text-xl font-bold leading-[26px]">Dans la liste</h2>
            <div v-for="f in data.waiting" :key="f.id" class="flex min-h-[72px] items-center gap-3.5 rounded-xl border border-st-border bg-st-surface px-4 py-3">
              <span class="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] bg-st-raised2 text-st-soft" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path :d="icon(f.slug)" /></svg>
              </span>
              <span class="flex min-w-0 flex-1 flex-col gap-0.5"><span class="text-base font-bold">{{ f.title }}</span><span class="text-[13px] leading-5 st-muted">{{ f.description }}</span></span>
              <span class="st-badge st-badge-neutral !hidden sm:!inline-flex">Pas encore en vote</span>
            </div>
          </section>
        </template>
        </div>

        <div v-show="tab === 'doing'" id="panel-doing" role="tabpanel" aria-labelledby="tab-doing" class="flex flex-col gap-3">
          <p class="m-0 text-sm leading-[22px] st-muted">Les fonctions que vous avez votées (ou que l’équipe a choisies) et sur lesquelles on travaille maintenant.</p>
          <div v-for="f in data?.inProgress ?? []" :key="f.id" class="flex min-h-[72px] flex-wrap items-center gap-x-3.5 gap-y-2 rounded-xl border border-st-border bg-st-surface px-4 py-3">
            <span class="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] bg-st-raised2 text-st-soft" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path :d="icon(f.slug)" /></svg>
            </span>
            <span class="flex min-w-[200px] flex-1 flex-col gap-0.5"><span class="text-base font-bold">{{ f.title }}</span><span class="text-[13px] leading-5 st-muted">{{ f.description }}</span><span v-if="votesText(f.wonWith)" class="text-[13px] text-st-accentLight">{{ votesText(f.wonWith) }}</span></span>
            <span class="st-badge" :class="statusLabel[f.status]?.cls ?? 'st-badge-neutral'">{{ statusLabel[f.status]?.text ?? f.status }}</span>
          </div>
          <div v-if="data && !data.inProgress.length" class="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-st-borderStrong px-6 py-10 text-center">
            <h2 class="st-title m-0 text-lg font-bold">Rien en cours pour l’instant</h2>
            <p class="m-0 max-w-sm text-sm leading-[22px] st-muted">Dès qu’un vote est terminé, la fonction gagnante apparaît ici pendant qu’on la développe.</p>
          </div>
        </div>

        <div v-show="tab === 'done'" id="panel-done" role="tabpanel" aria-labelledby="tab-done" class="flex flex-col gap-3">
          <p class="m-0 text-sm leading-[22px] st-muted">Ce qui est disponible grâce à vos votes.</p>
          <div v-for="f in data?.delivered ?? []" :key="f.id" class="flex min-h-[72px] flex-wrap items-center gap-x-3.5 gap-y-2 rounded-xl border border-st-okBorder bg-st-okBg px-4 py-3">
            <span class="flex min-w-[200px] flex-1 flex-col gap-0.5"><span class="text-base font-bold">{{ f.title }}</span><span class="text-[13px] leading-5 st-muted">{{ f.description }}</span><span v-if="votesText(f.wonWith)" class="text-[13px] text-st-ok">{{ votesText(f.wonWith) }}</span></span>
            <span class="st-badge st-badge-ok">Livré</span>
          </div>
          <div v-if="data && !data.delivered.length" class="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-st-borderStrong px-6 py-10 text-center">
            <h2 class="st-title m-0 text-lg font-bold">Rien de livré pour l’instant</h2>
            <p class="m-0 max-w-sm text-sm leading-[22px] st-muted">Les fonctions votées apparaissent ici une fois disponibles.</p>
          </div>
        </div>
      </div>

      <!-- Propose une idee -->
      <aside class="flex flex-col gap-3.5 rounded-2xl border border-st-border bg-st-surface p-5 sm:p-6 lg:sticky lg:top-24" aria-labelledby="idea-title">
        <div>
          <h2 id="idea-title" class="st-title m-0 mb-1.5 text-xl font-bold leading-[26px]">Propose une idée</h2>
          <p class="m-0 text-sm leading-[22px] st-muted">Une fonction qui te manque ? Dis-le en quelques mots : elle peut entrer dans un prochain vote.</p>
        </div>
        <template v-if="sent">
          <div class="flex items-start gap-2.5 rounded-xl bg-st-okBg p-3.5 text-st-ok" role="status">
            <svg class="mt-px flex-none" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            <div class="text-sm leading-[21px]"><strong class="font-extrabold">Merci, c’est noté.</strong> Ton idée est dans la file.</div>
          </div>
          <button type="button" class="st-btn-ghost" @click="sent = false">Proposer une autre idée</button>
        </template>
        <form v-else class="flex flex-col gap-3.5" @submit.prevent="sendIdea">
          <label for="idea" class="text-sm font-bold">Ton idée</label>
          <textarea id="idea" v-model="idea" rows="4" maxlength="500" class="st-field !h-auto min-h-[110px] resize-y py-3" placeholder="Exemple : pouvoir choisir la musique de fond de mes clips" />
          <div class="flex items-center justify-between gap-3">
            <button type="submit" class="st-btn !min-h-12" :disabled="studio.busy.value || idea.trim().length < 5 || (data?.ideasLeft ?? 0) < 1 || !data?.canVote">Envoyer mon idée</button>
            <span class="text-[13px] text-st-dim">{{ idea.length }}/500</span>
          </div>
          <p v-if="data && data.ideasLeft < 1" class="m-0 text-[13px] st-muted">Tu as déjà proposé plusieurs idées aujourd’hui. Reviens demain !</p>
        </form>
      </aside>
    </div>
  </main>
</template>
