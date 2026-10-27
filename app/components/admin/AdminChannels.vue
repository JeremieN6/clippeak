<script setup lang="ts">
// Studio de l'admin : la chaine de demonstration (pour voir et essayer sans toucher a un vrai compte) puis les chaines inscrites.
defineProps<{ admin: Admin }>()
</script>

<template>
  <div class="flex flex-col gap-6">
    <section v-for="c in admin.channels.value.filter(x => x.demo)" :key="c.id" class="st-card flex flex-col gap-4">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="m-0 text-[17px] font-bold">{{ c.displayName }}</h2>
          <span class="st-badge st-badge-violet">Démonstration</span>
        </div>
        <p class="m-0 mt-2 text-sm leading-relaxed st-muted">
          Le studio tel que le voit un streamer, sur un compte fictif : tu peux tout modifier et refaire le parcours d’inscription sans abîmer un vrai compte.
          Les clips d’exemple n’ont pas de vidéo.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <NuxtLink :to="`/studio?channel=${c.id}`" class="st-btn no-underline">Ouvrir le studio de démonstration</NuxtLink>
        <button type="button" class="st-btn-ghost" :disabled="admin.busy.value" @click="admin.resetDemo()">Remettre à zéro</button>
      </div>
    </section>

    <section class="st-card flex flex-col gap-1 !pb-2">
      <h2 class="m-0 mb-1 text-[17px] font-bold">Chaînes inscrites ({{ admin.channels.value.filter(x => !x.demo).length }})</h2>
      <p class="m-0 mb-3 text-[13px] leading-5 st-muted">Ouvrir le studio d’une vraie chaîne affiche ses vraies données : ce que tu modifies là-bas est modifié pour de vrai.</p>
      <p v-if="!admin.channels.value.some(x => !x.demo)" class="st-muted m-0 pb-4 text-sm">Aucune chaîne inscrite pour l’instant.</p>
      <div v-for="c in admin.channels.value.filter(x => !x.demo)" :key="c.id" class="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-[#2C2837] py-3.5">
        <div class="min-w-0 flex-1 basis-44 break-words text-[15px] font-bold">{{ c.displayName }}</div>
        <NuxtLink :to="`/studio?channel=${c.id}`" class="st-btn-ghost no-underline">Ouvrir son studio</NuxtLink>
      </div>
    </section>
  </div>
</template>
