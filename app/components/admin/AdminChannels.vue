<script setup lang="ts">
// Studio de l'admin : la chaine de demonstration (pour voir et essayer sans toucher a un vrai compte) puis les chaines inscrites.
defineProps<{ admin: Admin }>()
const testName = ref('')
const confirming = ref('')

async function addTest(admin: Admin) {
  const name = testName.value.trim()
  if (!name) return
  await admin.addTestChannel(name)
  if (!admin.error.value) testName.value = ''
}

async function removeTest(admin: Admin, id: string) {
  if (confirming.value !== id) { confirming.value = id; return }
  confirming.value = ''
  await admin.removeTestChannel(id)
}
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

    <section class="st-card flex flex-col gap-3">
      <div>
        <h2 class="m-0 text-[17px] font-bold">Chaînes de test ({{ admin.channels.value.filter(x => x.test).length }})</h2>
        <p class="m-0 mt-2 text-sm leading-relaxed st-muted">
          Une chaîne par ami dont tu essaies les VODs (par exemple « jeremfut7 - bmsjoel ») : photos, style et hashtags séparés, rien ne se mélange.
          Elles n’écoutent aucun live ; seules les VODs que tu ajoutes dans l’onglet VODs sont analysées. Ne publie jamais les clips d’un ami, et supprime la chaîne (avec ses photos) quand l’essai est fini.
        </p>
      </div>
      <form class="flex flex-wrap items-end gap-3" @submit.prevent="addTest(admin)">
        <label class="flex min-w-0 flex-1 basis-56 flex-col gap-1.5"><span class="st-label">Nom de la chaîne de test</span>
          <input v-model="testName" class="st-field" placeholder="jeremfut7 - bmsjoel" maxlength="60" autocomplete="off">
        </label>
        <button type="submit" class="st-btn" :disabled="admin.busy.value || testName.trim().length < 2">Créer</button>
      </form>
      <div v-for="c in admin.channels.value.filter(x => x.test)" :key="c.id" class="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-st-border pt-3.5">
        <div class="min-w-0 flex-1 basis-44 break-words text-[15px] font-bold">{{ c.displayName }} <span class="st-badge st-badge-info ml-1">Test</span></div>
        <NuxtLink :to="`/studio?channel=${c.id}`" class="st-btn-ghost no-underline">Ouvrir son studio</NuxtLink>
        <button type="button" class="st-btn-quiet" :disabled="admin.busy.value" @click="removeTest(admin, c.id)">{{ confirming === c.id ? 'Confirmer la suppression' : 'Supprimer' }}</button>
      </div>
    </section>

    <section class="st-card flex flex-col gap-1 !pb-2">
      <h2 class="m-0 mb-1 text-[17px] font-bold">Chaînes inscrites ({{ admin.channels.value.filter(x => !x.demo && !x.test).length }})</h2>
      <p class="m-0 mb-3 text-[13px] leading-5 st-muted">Ouvrir le studio d’une vraie chaîne affiche ses vraies données : ce que tu modifies là-bas est modifié pour de vrai.</p>
      <p v-if="!admin.channels.value.some(x => !x.demo && !x.test)" class="st-muted m-0 pb-4 text-sm">Aucune chaîne inscrite pour l’instant.</p>
      <div v-for="c in admin.channels.value.filter(x => !x.demo && !x.test)" :key="c.id" class="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-st-border py-3.5">
        <div class="min-w-0 flex-1 basis-44 break-words text-[15px] font-bold">{{ c.displayName }}</div>
        <NuxtLink :to="`/studio?channel=${c.id}`" class="st-btn-ghost no-underline">Ouvrir son studio</NuxtLink>
      </div>
    </section>
  </div>
</template>
