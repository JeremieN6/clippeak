<script setup lang="ts">
const studio = useStudio()
const input = ref<HTMLInputElement | null>(null)

// Mots declencheurs et credit sont modifies ici puis enregistres par illustration.
const edits = reactive<Record<string, { tags: string[], source: string }>>({})
const items = computed(() => studio.assetsOf('illustration'))
watch(items, (list) => {
  for (const a of list) edits[a.id] ??= { tags: [...a.tags], source: a.source ?? '' }
}, { immediate: true })

const dirty = (a: any) => {
  const e = edits[a.id]
  return !!e && (e.source !== (a.source ?? '') || e.tags.join('|') !== a.tags.join('|'))
}

async function pick(event: Event) {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files ?? [])
  target.value = ''
  if (files.length) await studio.addAssets('illustration', files)
}
</script>

<template>
  <div class="flex max-w-[820px] flex-col gap-6">
    <StudioStepHeader :n="5" tag="Facultatif" title="Tes illustrations">
      De courtes vidéos qui apparaissent quand tu dis un mot choisi.
    </StudioStepHeader>

    <div class="st-dropzone !rounded-2xl">
      <div class="text-base font-bold">Dépose de courtes vidéos</div>
      <div class="st-hint">MP4, MOV ou WebM, 60 Mo maximum. Quelques secondes suffisent. Tu peux en déposer plusieurs à la fois.</div>
      <button type="button" class="st-btn-ghost" :disabled="studio.busy.value" @click="input?.click()">Choisir des vidéos</button>
      <input ref="input" type="file" multiple accept=".mp4,.mov,.webm" class="hidden" aria-label="Choisir des vidéos d’illustration" @change="pick">
    </div>

    <div v-if="items.length" class="flex flex-col gap-4">
      <h2 class="m-0 text-[17px] font-bold">{{ items.length }} illustration(s)</h2>
      <section v-for="a in items" :key="a.id" class="st-card flex flex-col gap-4">
        <div class="flex flex-wrap items-center gap-3.5">
          <video :src="a.previewUrl" controls muted playsinline preload="metadata" class="aspect-video w-48 flex-none rounded-[10px] bg-black" />
          <div class="min-w-0 flex-1 basis-40 break-words text-[15px] font-bold">{{ a.filename }}</div>
          <button type="button" class="st-btn-quiet !text-[#ABA5BA] text-sm" :disabled="studio.busy.value" @click="studio.removeAsset(a.id)">Retirer</button>
        </div>
        <div v-if="edits[a.id]" class="flex flex-col gap-1.5">
          <label :for="`ill-w-${a.id}`" class="st-label">Mots qui déclenchent cette illustration</label>
          <div class="st-hint">Elle apparaît quand tu dis l’un de ces mots. Exemple : marche, légumes. Vide, ce sont les mots du nom du fichier qui servent.</div>
          <StudioChips v-model="edits[a.id].tags" :input-id="`ill-w-${a.id}`" />
        </div>
        <div v-if="edits[a.id]" class="flex flex-col gap-1.5">
          <label :for="`ill-c-${a.id}`" class="st-label">Crédit</label>
          <div class="st-hint">L’auteur ou le lien d’origine. Il est conservé avec chaque clip pour savoir d’où vient la vidéo.</div>
          <input :id="`ill-c-${a.id}`" v-model="edits[a.id].source" class="st-field" placeholder="Exemple : Léa M. ou https://…" :style="!edits[a.id].source.trim() ? { borderColor: '#F6C260' } : {}">
          <div v-if="!edits[a.id].source.trim()" class="flex gap-2 text-[13px] font-semibold leading-5 text-[#F6C260]">Il manque le crédit. Tu pourras quand même l’utiliser, mais tu ne sauras plus d’où vient la vidéo.</div>
        </div>
        <div v-if="edits[a.id] && dirty(a)">
          <button type="button" class="st-btn" :disabled="studio.busy.value" @click="studio.saveAsset(a.id, edits[a.id].tags, edits[a.id].source)">Enregistrer cette illustration</button>
        </div>
      </section>
    </div>
    <div v-else class="st-card text-sm leading-relaxed st-muted">Aucune illustration pour l’instant. Tes clips fonctionnent très bien sans : tu peux passer cette étape.</div>
  </div>
</template>
