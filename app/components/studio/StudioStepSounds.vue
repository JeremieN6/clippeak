<script setup lang="ts">
const studio = useStudio()
const detail = studio.detail
const input = ref<HTMLInputElement | null>(null)
const playing = ref('')

const customs = computed(() => studio.assetsOf('sfx'))

// Les sons integres sont fabriques au moment du rendu : seuls les fichiers du streamer s'ecoutent ici.
function listen(asset: any) {
  playing.value = asset.id
  const audio = new Audio(asset.previewUrl)
  audio.addEventListener('ended', () => { playing.value = '' })
  audio.play().catch(() => { playing.value = '' })
}

async function pick(event: Event) {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files ?? [])
  target.value = ''
  if (files.length) await studio.addAssets('sfx', files)
}

async function removeSound(asset: any) {
  // Une situation qui utilisait ce fichier revient au son integre par defaut.
  for (const situation of detail.value.sounds.situations) {
    const rule = detail.value.style.sfx[situation.id]
    if (rule.sound === `asset:${asset.id}`) rule.sound = situation.id === 'illustration' ? 'whoosh' : situation.id === 'avatar' ? 'pop' : 'wind'
  }
  await studio.removeAsset(asset.id)
}

const optionHint: Record<string, string> = { wind: 'Souffle doux', whoosh: 'Passage rapide', pop: 'Petit éclat', ding: 'Clochette', impact: 'Coup sourd' }
const situationTitle: Record<string, string> = { intro: 'Au début du clip', illustration: 'À chaque illustration', avatar: 'À l’arrivée de l’avatar' }
const situationDesc: Record<string, string> = {
  intro: 'Avec le zoom d’ouverture.',
  illustration: 'Quand une illustration apparaît en haut.',
  avatar: 'Quand ton avatar ou GIF apparaît.'
}
</script>

<template>
  <div v-if="detail" class="flex max-w-[820px] flex-col gap-6">
    <StudioStepHeader :n="4" tag="Facultatif" title="Les sons de tes clips">
      De petits sons pour rythmer chaque moment de tes clips.
    </StudioStepHeader>

    <section class="st-card flex flex-col gap-4 !py-3">
      <div class="flex min-h-16 items-center justify-between gap-4">
        <div><h2 class="m-0 text-[17px] font-bold">Ajouter des bruitages</h2><div class="st-hint">Interrupteur général : coupé, aucun son n’est ajouté.</div></div>
        <StudioSwitch v-model="detail.style.sfx.enabled" label="Ajouter des bruitages" />
      </div>
      <label v-if="detail.style.sfx.enabled" class="flex flex-col gap-1.5 border-t border-st-border pt-5 pb-2">
        <span class="flex items-center justify-between"><span class="st-label">Volume des bruitages</span><span class="st-badge st-badge-violet">{{ Math.round(detail.style.sfx.volume * 100) }} %</span></span>
        <input v-model.number="detail.style.sfx.volume" type="range" step="0.05" min="0" max="1" class="st-range">
        <span class="flex justify-between text-xs text-st-dim"><span>Discret</span><span>Fort</span></span>
      </label>
    </section>

    <div class="st-alert st-alert-info">
      <div><strong class="font-extrabold">À savoir.</strong> <span class="text-st-info">Les sons ne s’entendent pas dans l’aperçu de l’étape 3 : ils sont ajoutés quand le clip est fabriqué. Tes propres sons s’écoutent ici avec le bouton haut-parleur.</span></div>
    </div>

    <template v-if="detail.style.sfx.enabled">
      <section v-for="situation in detail.sounds.situations" :key="situation.id" class="st-card flex flex-col gap-4 !py-3">
        <div class="flex min-h-16 items-center justify-between gap-4">
          <div><h2 class="m-0 text-[17px] font-bold">{{ situationTitle[situation.id] ?? situation.label }}</h2><div class="st-hint">{{ situationDesc[situation.id] ?? '' }}</div></div>
          <StudioSwitch v-model="detail.style.sfx[situation.id].enabled" :label="situationTitle[situation.id] ?? situation.label" />
        </div>
        <div v-if="detail.style.sfx[situation.id].enabled" class="grid gap-2 border-t border-st-border pt-4 pb-2 sm:grid-cols-2" role="radiogroup" :aria-label="`Son : ${situationTitle[situation.id] ?? situation.label}`">
          <div v-for="s in detail.sounds.builtin" :key="s.id" class="flex items-center rounded-xl border pr-1.5" :class="detail.style.sfx[situation.id].sound === s.id ? 'border-st-accentLight bg-st-accentBg' : 'border-st-border bg-st-field'">
            <button type="button" role="radio" :aria-checked="detail.style.sfx[situation.id].sound === s.id" class="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 border-0 bg-transparent px-3.5 text-left" @click="detail.style.sfx[situation.id].sound = s.id">
              <span class="flex h-5 w-5 flex-none items-center justify-center rounded-full border-2" :class="detail.style.sfx[situation.id].sound === s.id ? 'border-st-accentLight bg-st-accentLight' : 'border-st-borderStrong'" />
              <span class="flex min-w-0 flex-col"><span class="truncate text-[15px] font-bold">{{ s.label }}</span><span class="text-xs st-muted">{{ optionHint[s.id] ?? '' }}</span></span>
            </button>
          </div>
          <div v-for="a in customs" :key="a.id" class="flex items-center rounded-xl border pr-1.5" :class="detail.style.sfx[situation.id].sound === `asset:${a.id}` ? 'border-st-accentLight bg-st-accentBg' : 'border-st-border bg-st-field'">
            <button type="button" role="radio" :aria-checked="detail.style.sfx[situation.id].sound === `asset:${a.id}`" class="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 border-0 bg-transparent px-3.5 text-left" @click="detail.style.sfx[situation.id].sound = `asset:${a.id}`">
              <span class="flex h-5 w-5 flex-none items-center justify-center rounded-full border-2" :class="detail.style.sfx[situation.id].sound === `asset:${a.id}` ? 'border-st-accentLight bg-st-accentLight' : 'border-st-borderStrong'" />
              <span class="flex min-w-0 flex-col"><span class="truncate text-[15px] font-bold">{{ a.filename }}</span><span class="text-xs st-muted">Mon son</span></span>
            </button>
          </div>
        </div>
      </section>
    </template>

    <section class="st-card flex flex-col gap-3.5">
      <div><h2 class="m-0 text-[17px] font-bold">Mes sons</h2><div class="st-hint">Tes propres sons, 5 Mo maximum chacun. Ils s’ajoutent aux 5 sons proposés et se choisissent ci-dessus.</div></div>
      <div v-for="a in customs" :key="a.id" class="flex min-h-14 items-center gap-3 rounded-xl border border-st-border bg-st-field py-1.5 pl-3.5 pr-1.5">
        <div class="min-w-0 flex-1 truncate text-sm font-bold">{{ a.filename }}</div>
        <button type="button" class="flex h-11 w-11 items-center justify-center rounded-[10px] border-0" :class="playing === a.id ? 'bg-st-accent text-white' : 'bg-st-raised text-st-accentText'" :aria-label="`Écouter ${a.filename}`" @click="listen(a)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10zM16.5 9a4 4 0 010 6M19 7a7 7 0 010 10" /></svg>
        </button>
        <button type="button" class="flex h-11 w-11 items-center justify-center rounded-[10px] border-0 bg-transparent text-st-muted" :aria-label="`Supprimer ${a.filename}`" :disabled="studio.busy.value" @click="removeSound(a)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
        </button>
      </div>
      <div>
        <button type="button" class="st-btn-ghost border-dashed" :disabled="studio.busy.value" @click="input?.click()">Ajouter un son</button>
        <input ref="input" type="file" multiple accept=".mp3,.wav,.ogg,.m4a" class="hidden" aria-label="Ajouter des sons" @change="pick">
      </div>
    </section>
  </div>
</template>
