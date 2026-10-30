<script setup lang="ts">
// « Prochainement » cote admin : lancer un bloc de vote (2 fonctions de la liste), le clore ou trancher une egalite,
// suivre les statuts des fonctions et lire les idees des streamers. L'admin voit toujours les totaux.
const props = defineProps<{ admin: Admin }>()
const r = computed(() => props.admin.roadmap.value)
onMounted(() => props.admin.loadRoadmap())

const a = ref('')
const b = ref('')
const days = ref(14)
const newTitle = ref('')
const newDesc = ref('')

const backlog = computed(() => r.value?.features.filter(f => f.status === 'backlog') ?? [])
const openBlock = computed(() => r.value?.blocks.find(x => x.status !== 'closed') ?? null)
const closedBlocks = computed(() => r.value?.blocks.filter(x => x.status === 'closed') ?? [])
const statuses = [['backlog', 'Dans la liste'], ['building', 'En cours'], ['waiting_access', 'En attente d’accès'], ['delivered', 'Livré']] as const
const date = (v: string) => new Date(v).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

const launch = () => props.admin.roadmapAction('POST', '/api/admin/roadmap/blocks', { featureAId: a.value, featureBId: b.value, days: days.value }, 'Vote lancé.')
const close = (id: string, featureId?: string) => props.admin.roadmapAction('POST', `/api/admin/roadmap/blocks/${id}/close`, featureId ? { featureId } : {}, 'Vote clos.')
const setStatus = (id: string, status: string) => props.admin.roadmapAction('PATCH', `/api/admin/roadmap/features/${id}`, { status }, 'Statut mis à jour.')
const addFeature = async () => {
  await props.admin.roadmapAction('POST', '/api/admin/roadmap/features', { title: newTitle.value, description: newDesc.value }, 'Fonction ajoutée à la liste.')
  if (!props.admin.error.value) { newTitle.value = ''; newDesc.value = '' }
}
const archive = (id: string, status: 'new' | 'archived') => props.admin.roadmapAction('PATCH', `/api/admin/roadmap/ideas/${id}`, { status }, status === 'archived' ? 'Idée rangée.' : 'Idée remise à traiter.')
</script>

<template>
  <div v-if="r" class="flex flex-col gap-6">
    <p class="m-0 text-sm leading-relaxed st-muted">Les streamers votent entre deux fonctions ; la plus votée passe « en cours », l’autre revient dans la liste avec ses votes. En cas d’égalité (ou zéro vote) à l’échéance, c’est toi qui tranches.</p>

    <section class="st-card flex flex-col gap-4">
      <h2 class="m-0 text-[17px] font-bold">Vote en cours</h2>
      <template v-if="openBlock">
        <div class="flex flex-wrap items-center gap-2">
          <span class="st-badge" :class="openBlock.status === 'needs_admin' ? 'st-badge-warn' : 'st-badge-violet'">{{ openBlock.status === 'needs_admin' ? 'À trancher' : 'Ouvert' }}</span>
          <span class="text-[13px] st-muted">{{ openBlock.status === 'needs_admin' ? 'Échéance passée' : `Jusqu’au ${date(openBlock.endsAt)}` }} · {{ openBlock.votes }} vote(s)</span>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div v-for="f in [openBlock.a, openBlock.b]" :key="f.id" class="flex flex-col gap-2 rounded-xl border border-st-border p-4">
            <div class="font-bold">{{ f.title }}</div>
            <div class="st-title text-3xl font-bold">{{ f.total }}</div>
            <button type="button" class="st-btn-ghost" :disabled="admin.busy.value" @click="close(openBlock.id, f.id)">Choisir celle-ci</button>
          </div>
        </div>
        <div><button type="button" class="st-btn-quiet" :disabled="admin.busy.value" @click="close(openBlock.id)">Clore maintenant (la plus votée gagne)</button></div>
      </template>
      <form v-else class="flex flex-col gap-3" @submit.prevent="launch">
        <p class="m-0 text-sm st-muted">Aucun vote en cours. Choisis deux fonctions « dans la liste ».</p>
        <div class="grid gap-3 sm:grid-cols-[1fr_1fr_120px]">
          <select v-model="a" class="st-field" aria-label="Première fonction"><option value="">Fonction A</option><option v-for="f in backlog" :key="f.id" :value="f.id">{{ f.title }}{{ f.carriedVotes ? ` (+${f.carriedVotes})` : '' }}</option></select>
          <select v-model="b" class="st-field" aria-label="Deuxième fonction"><option value="">Fonction B</option><option v-for="f in backlog" :key="f.id" :value="f.id">{{ f.title }}{{ f.carriedVotes ? ` (+${f.carriedVotes})` : '' }}</option></select>
          <label class="flex items-center gap-2 text-sm st-muted">Jours <input v-model.number="days" type="number" min="1" max="60" class="st-field !w-20" aria-label="Durée en jours"></label>
        </div>
        <div><button type="submit" class="st-btn" :disabled="admin.busy.value || !a || !b || a === b">Lancer le vote</button></div>
      </form>
    </section>

    <section class="st-card flex flex-col gap-1 !pb-2">
      <h2 class="m-0 mb-3 text-[17px] font-bold">Fonctions ({{ r.features.length }})</h2>
      <div v-for="f in r.features" :key="f.id" class="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-st-border py-3.5">
        <div class="min-w-0 flex-1 basis-56">
          <div class="text-[15px] font-bold">{{ f.title }}<span v-if="f.carriedVotes" class="ml-2 text-[13px] font-semibold text-st-accentLight">+{{ f.carriedVotes }} vote(s) conservés</span></div>
          <div class="text-[13px] st-muted">{{ f.description }}</div>
        </div>
        <span v-if="f.status === 'voting'" class="st-badge st-badge-violet">En vote</span>
        <select v-else :value="f.status" class="st-field !w-auto" :aria-label="`Statut de ${f.title}`" :disabled="admin.busy.value" @change="setStatus(f.id, ($event.target as HTMLSelectElement).value)">
          <option v-for="s in statuses" :key="s[0]" :value="s[0]">{{ s[1] }}</option>
        </select>
      </div>
      <form class="flex flex-col gap-3 border-t border-st-border py-4" @submit.prevent="addFeature">
        <h3 class="m-0 text-sm font-bold">Ajouter une fonction à la liste</h3>
        <input v-model="newTitle" class="st-field" maxlength="80" placeholder="Titre" aria-label="Titre de la fonction">
        <input v-model="newDesc" class="st-field" maxlength="400" placeholder="Description pour les streamers" aria-label="Description de la fonction">
        <div><button type="submit" class="st-btn-ghost" :disabled="admin.busy.value || newTitle.trim().length < 3 || newDesc.trim().length < 5">Ajouter</button></div>
      </form>
    </section>

    <section v-if="closedBlocks.length" class="st-card flex flex-col gap-1 !pb-2">
      <h2 class="m-0 mb-3 text-[17px] font-bold">Votes terminés</h2>
      <div v-for="x in closedBlocks" :key="x.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-st-border py-3 text-sm">
        <span class="font-semibold">{{ x.a.title }} ({{ x.a.total }}) contre {{ x.b.title }} ({{ x.b.total }})</span>
        <span class="st-muted">→ {{ x.winnerId === x.a.id ? x.a.title : x.b.title }} {{ x.decidedBy === 'admin' ? '(tranché par toi)' : '(par les votes)' }}</span>
      </div>
    </section>

    <section class="st-card flex flex-col gap-1 !pb-2">
      <h2 class="m-0 mb-3 text-[17px] font-bold">Idées des streamers ({{ r.ideas.filter(i => i.status === 'new').length }} à lire)</h2>
      <p v-if="!r.ideas.length" class="st-muted m-0 pb-4 text-sm">Aucune idée pour l’instant.</p>
      <div v-for="i in r.ideas" :key="i.id" class="flex flex-wrap items-start gap-x-3.5 gap-y-2 border-t border-st-border py-3.5" :class="i.status === 'archived' ? 'opacity-60' : ''">
        <div class="min-w-0 flex-1 basis-56">
          <div class="break-words text-[15px]">{{ i.text }}</div>
          <div class="text-[13px] st-muted">{{ i.channel }} · {{ date(i.createdAt) }}</div>
        </div>
        <button type="button" class="st-btn-quiet text-sm" :disabled="admin.busy.value" @click="archive(i.id, i.status === 'new' ? 'archived' : 'new')">{{ i.status === 'new' ? 'Ranger' : 'Remettre à traiter' }}</button>
      </div>
    </section>
  </div>
</template>
