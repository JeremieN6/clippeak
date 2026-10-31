<script setup lang="ts">
// Petites questions, une a la fois (onboarding en conversation, version 2) : Clippeak pose une question, le streamer repond en un clic,
// la reponse se replie en une ligne (« Modifier » la rouvre) et la question suivante arrive. Le composant ne sait rien du style :
// il affiche les questions recues et signale chaque reponse (`pick`), le parent applique le changement (apercu en direct).
import type { QuickQuestion } from '~~/server/utils/clipping/lookPresets'

// `resume` : retour depuis les reglages detailles, les questions dont la reponse correspond a un choix sont deja repondues.
const props = defineProps<{ questions: QuickQuestion[], doneText: string, resume?: boolean }>()
const emit = defineEmits<{ (e: 'pick', id: string, value: string): void, (e: 'defaults'): void, (e: 'detailed'): void }>()

// On retient les questions DEJA repondues par leur identifiant (la liste peut changer : la question « couleur » n'existe que si les
// sous-titres mettent des mots en valeur) ; la question en cours est celle qu'on modifie, sinon la premiere sans reponse.
const answeredIds = ref<string[]>(props.resume ? props.questions.filter(q => q.current !== null).map(q => q.id) : [])
const editingId = ref<string | null>(null)
const current = computed(() => editingId.value
  ? props.questions.find(q => q.id === editingId.value) ?? null
  : props.questions.find(q => !answeredIds.value.includes(q.id)) ?? null)
const answered = computed(() => props.questions.filter(q => answeredIds.value.includes(q.id) && q.id !== current.value?.id))
const position = computed(() => current.value ? props.questions.indexOf(current.value) + 1 : props.questions.length)
const percent = computed(() => props.questions.length ? Math.round((props.questions.filter(q => answeredIds.value.includes(q.id)).length / props.questions.length) * 100) : 100)

const summary = (q: QuickQuestion) => q.options.find(o => o.value === q.current)?.label ?? 'Personnalisé'

function pick(q: QuickQuestion, value: string) {
  emit('pick', q.id, value)
  if (!answeredIds.value.includes(q.id)) answeredIds.value = [...answeredIds.value, q.id]
  editingId.value = null
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-3">
    <div class="h-1.5 w-full overflow-hidden rounded-[3px] bg-st-border" role="progressbar" aria-label="Avancement des questions" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100">
      <div class="st-bar h-full" :style="{ width: `${percent}%` }" />
    </div>

    <!-- Reponses deja donnees -->
    <div v-for="q in answered" :key="q.id" class="flex min-h-[48px] items-center gap-2.5 rounded-xl border border-st-border bg-st-field py-0 pl-3.5 pr-1.5">
      <span class="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-st-okBg text-st-ok" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </span>
      <span class="min-w-0 flex-1 truncate text-sm">{{ q.label }} · <strong class="font-bold">{{ summary(q) }}</strong></span>
      <button type="button" class="h-11 flex-none rounded-[10px] border-0 bg-transparent px-3 text-sm font-bold text-st-accentLight hover:bg-st-raised" :aria-label="`Modifier : ${q.label}`" @click="editingId = q.id">Modifier</button>
    </div>

    <!-- Question en cours -->
    <div v-if="current" :key="current.id" class="st-bubble-in flex flex-col gap-3">
      <div class="text-xs font-bold st-muted">Question {{ position }} sur {{ questions.length }}</div>
      <div class="flex items-start gap-2.5">
        <span class="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-st-accent text-xs font-extrabold text-white" aria-hidden="true">CP</span>
        <div class="max-w-[520px] rounded-[4px_16px_16px_16px] border border-st-border bg-st-surface px-4 py-3 text-[15px] leading-6">{{ current.text }}</div>
      </div>
      <div class="flex flex-wrap gap-2.5 pl-[42px]" role="radiogroup" :aria-label="current.text">
        <button
          v-for="o in current.options" :key="o.value" type="button" role="radio" :aria-checked="current.current === o.value"
          :aria-label="o.color ? o.label : undefined"
          class="flex min-h-11 flex-col items-start justify-center rounded-xl border px-4 py-1.5 text-left text-[15px] font-bold text-st-text"
          :class="[current.current === o.value ? 'border-st-accentLight bg-st-accentBg' : 'border-st-border bg-st-field hover:bg-st-raised', o.color ? '!min-w-11 !items-center !px-0' : '']"
          @click="pick(current, o.value)"
        >
          <span v-if="o.color" class="block h-7 w-7 rounded-full border border-st-borderStrong" :style="{ background: o.color }" aria-hidden="true" />
          <template v-else>
            <span>{{ o.label }}</span>
            <span v-if="o.hint" class="text-xs font-normal st-muted">{{ o.hint }}</span>
          </template>
        </button>
      </div>
      <p class="m-0 pl-[42px] text-[13px] st-muted">Tu peux changer d’avis : chaque réponse reste modifiable.</p>
    </div>

    <!-- Fin -->
    <div v-else class="st-bubble-in flex items-start gap-2.5">
      <span class="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-st-accent text-xs font-extrabold text-white" aria-hidden="true">CP</span>
      <div class="max-w-[520px] rounded-[4px_16px_16px_16px] border border-st-border bg-st-surface px-4 py-3 text-[15px] leading-6">{{ doneText }}</div>
    </div>

    <div class="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-st-border pt-2">
      <button type="button" class="min-h-11 border-0 bg-transparent p-0 text-sm font-bold text-st-accentLight" @click="emit('defaults')">Garder le style par défaut</button>
      <button type="button" class="min-h-11 border-0 bg-transparent p-0 text-sm font-bold text-st-accentLight" @click="emit('detailed')">Réglages détaillés</button>
    </div>
  </div>
</template>
