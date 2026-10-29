<script setup lang="ts">
// Liste de mots saisis un par un (Entree ou virgule), affiches en pastilles retirables.
const props = defineProps<{ modelValue: string[], inputId: string, placeholder?: string, max?: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const draft = ref('')

function add() {
  const word = draft.value.trim().replace(/,+$/, '').trim()
  draft.value = ''
  if (!word || word.length > 40 || props.modelValue.length >= (props.max ?? 50)) return
  if (props.modelValue.some(w => w.toLowerCase() === word.toLowerCase())) return
  emit('update:modelValue', [...props.modelValue, word])
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault()
    add()
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 rounded-[10px] border border-st-border bg-st-field p-2.5">
    <span v-for="word in modelValue" :key="word" class="st-chip">
      {{ word }}
      <button type="button" :aria-label="`Retirer ${word}`" @click="emit('update:modelValue', modelValue.filter(w => w !== word))">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </span>
    <input :id="inputId" v-model="draft" :placeholder="placeholder ?? 'Ajouter un mot, puis Entrée'" class="h-11 min-w-[140px] flex-1 basis-40 border-0 bg-transparent text-[15px] font-medium outline-none" @keydown="onKey" @blur="add">
  </div>
</template>
