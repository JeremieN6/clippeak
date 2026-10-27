<script setup lang="ts">
const studio = useStudio()
const urls = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const openStats = reactive<Record<string, boolean>>({})

const statusLook: Record<string, { label: string, cls: string }> = {
  done: { label: 'Analysé', cls: 'st-badge-ok' },
  processing: { label: 'Analyse en cours', cls: 'st-badge-info' },
  pending: { label: 'En attente', cls: 'st-badge-neutral' },
  failed: { label: 'Échec', cls: 'st-badge-error' }
}
const sourceLabel: Record<string, string> = { youtube: 'YouTube Shorts', tiktok: 'TikTok', instagram: 'Instagram', upload: 'Vidéo déposée' }

const items = computed(() => studio.bank.value?.items ?? [])
const profile = computed(() => studio.bank.value?.profile)
const groups = computed(() => !profile.value ? [] : [
  { label: 'Sujets', items: (profile.value.topics ?? []).map((t: any) => t.word) },
  { label: 'Formats', items: (profile.value.formats ?? []).map((f: any) => f.name) },
  { label: 'Émotions', items: (profile.value.emotions ?? []).map((f: any) => f.name) },
  { label: 'Accroches', items: (profile.value.hooks ?? []).map((h: any) => `« ${h.hook} »`) }
].filter(g => g.items.length))

async function add() {
  const files = Array.from(fileInput.value?.files ?? [])
  await studio.addReferences(files, urls.value)
  if (!studio.error.value || files.length || urls.value) {
    urls.value = ''
    if (fileInput.value) fileInput.value.value = ''
  }
}

const stats = [['viewCount', 'Vues'], ['likeCount', 'Likes'], ['commentCount', 'Commentaires'], ['shareCount', 'Partages']] as const
</script>

<template>
  <div class="flex max-w-[820px] flex-col gap-7">
    <StudioStepHeader :n="1" tag="Obligatoire" title="Tes clips de référence">
      Montre à Clippeak des clips qui ont déjà bien marché chez toi. Il en tire ce qui les rend forts, puis repère dans tes lives les moments qui leur ressemblent.
    </StudioStepHeader>

    <section class="st-card flex flex-col gap-5">
      <div>
        <h2 class="m-0 text-[17px] font-bold">Ajouter des clips</h2>
        <p class="st-hint m-0">Dépose des vidéos ou colle des liens. Tu peux faire les deux.</p>
      </div>
      <div class="st-dropzone">
        <div class="text-base font-bold">Dépose tes vidéos ici</div>
        <div class="st-hint">MP4, MOV ou WebM, 80 Mo maximum chacune. Tu peux en déposer plusieurs à la fois.</div>
        <input ref="fileInput" type="file" multiple accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" aria-label="Choisir des vidéos" class="max-w-full text-sm">
      </div>
      <div class="flex flex-col gap-2">
        <label for="st-ref-links" class="st-label">Liens de clips ou de comptes</label>
        <div class="st-hint">Si tu colles un compte, Clippeak récupère ses derniers clips. 20 liens maximum à la fois.</div>
        <textarea id="st-ref-links" v-model="urls" rows="4" class="st-field" placeholder="Un lien par ligne : un clip ou un compte YouTube, TikTok ou Instagram" />
        <div class="text-[13px] text-[#928BA2]">Exemple : https://www.tiktok.com/@toncompte</div>
      </div>
      <div>
        <button type="button" class="st-btn" :disabled="studio.busy.value" @click="add">Ajouter à ma banque</button>
      </div>
    </section>

    <section class="st-card flex flex-col gap-4">
      <div>
        <h2 class="m-0 text-[17px] font-bold">Ce que Clippeak a retenu</h2>
        <p class="st-hint m-0">{{ profile?.analyzedCount ?? 0 }} clip(s) analysé(s) sur {{ items.length }}.</p>
      </div>
      <div class="h-1.5 overflow-hidden rounded-[3px] bg-[#2C2837]" role="progressbar" aria-label="Analyse des clips" :aria-valuenow="items.length ? Math.round(((profile?.analyzedCount ?? 0) / items.length) * 100) : 0" aria-valuemin="0" aria-valuemax="100">
        <div class="h-full bg-[#7C3AED]" :style="{ width: items.length ? `${Math.round(((profile?.analyzedCount ?? 0) / items.length) * 100)}%` : '0%' }" />
      </div>
      <div v-if="groups.length" class="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div v-for="g in groups" :key="g.label" class="flex flex-col gap-2">
          <div class="text-xs font-extrabold uppercase tracking-wider text-[#928BA2]">{{ g.label }}</div>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="w in g.items" :key="w" class="st-badge st-badge-violet !h-auto min-h-[30px] !whitespace-normal py-1">{{ w }}</span>
          </div>
        </div>
      </div>
      <p v-else class="st-muted m-0 text-sm">Dès qu’un clip est analysé, ce que Clippeak en retient apparaît ici.</p>
      <div>
        <button type="button" class="st-btn-quiet" :disabled="studio.busy.value" @click="studio.run(studio.loadBank)">Actualiser{{ studio.bank.value?.pending ? ` (${studio.bank.value.pending} en cours)` : '' }}</button>
      </div>
    </section>

    <section class="st-card flex flex-col gap-1 !pb-2">
      <h2 class="m-0 mb-3 text-[17px] font-bold">Tes clips de référence ({{ items.length }})</h2>
      <p v-if="!items.length" class="st-muted m-0 pb-4 text-sm">Aucun clip de référence pour l’instant.</p>
      <div v-for="item in items" :key="item.id" class="flex flex-col gap-3 border-t border-[#2C2837] py-3.5">
        <div class="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
          <div class="min-w-0 flex-1 basis-44">
            <div class="break-words text-[15px] font-bold leading-snug">{{ item.kind === 'account' ? 'Compte : ' : '' }}{{ item.title || item.url || 'sans titre' }}</div>
            <div class="text-[13px] st-muted">{{ sourceLabel[item.source] ?? item.source }}</div>
            <div v-if="item.status === 'failed'" class="mt-1 text-[13px] font-semibold text-[#FF9B8D]">{{ item.error || 'Impossible de lire cette vidéo. Essaie avec un autre fichier ou un lien.' }}</div>
            <div v-if="item.analysis?.summary" class="mt-1 text-[13px] st-muted">{{ item.analysis.summary }}</div>
          </div>
          <span class="st-badge" :class="(statusLook[item.status] ?? statusLook.pending).cls">{{ (statusLook[item.status] ?? statusLook.pending).label }}</span>
        </div>
        <div class="flex flex-wrap items-center gap-x-2">
          <button v-if="item.status === 'done' && item.kind === 'clip'" type="button" class="st-btn-quiet text-sm" :aria-expanded="!!openStats[item.id]" @click="openStats[item.id] = !openStats[item.id]">Ajouter mes statistiques (facultatif)</button>
          <button type="button" class="st-btn-quiet !text-[#ABA5BA] text-sm" :disabled="studio.busy.value" @click="studio.removeReference(item.id)">Retirer</button>
        </div>
        <div v-if="openStats[item.id]" class="grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
          <label v-for="s in stats" :key="s[0]" class="flex flex-col gap-1 text-[13px] st-muted">
            {{ s[1] }}
            <input :value="item[s[0]] ?? ''" inputmode="numeric" class="st-field" placeholder="Exemple : 12000" @change="studio.saveStat(item.id, s[0], ($event.target as HTMLInputElement).value)">
          </label>
        </div>
      </div>
    </section>
  </div>
</template>
