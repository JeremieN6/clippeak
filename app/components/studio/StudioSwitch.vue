<script setup lang="ts">
defineProps<{ modelValue: boolean, label: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <button type="button" role="switch" class="st-switch" :aria-checked="modelValue" :aria-label="label" @click="emit('update:modelValue', !modelValue)">
    <span />
  </button>
</template>
