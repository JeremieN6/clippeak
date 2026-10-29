<script setup lang="ts">
// Chaines Twitch invitees : seules celles de la liste peuvent s'inscrire et se connecter avec Twitch. Reserve a l'admin (page /admin).
const props = defineProps<{ admin: Admin }>()
const login = ref('')
const note = ref('')

async function add() {
  await props.admin.addInvite(login.value, note.value)
  if (!props.admin.error.value) { login.value = ''; note.value = '' }
}

const date = (value: string | null) => value ? new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
</script>

<template>
  <div class="flex flex-col gap-6">
    <p class="m-0 text-sm leading-relaxed st-muted">Seules les chaînes de cette liste peuvent s’inscrire et se connecter avec Twitch. Chaque chaîne connectée consomme du temps de calcul sur le serveur.</p>

    <form class="st-card flex flex-col gap-4" @submit.prevent="add">
      <h2 class="m-0 text-[17px] font-bold">Inviter une chaîne</h2>
      <label class="flex flex-col gap-1.5"><span class="st-label">Pseudo Twitch</span>
        <input v-model="login" class="st-field" placeholder="Exemple : jeremfut7" autocomplete="off" aria-label="Pseudo Twitch">
      </label>
      <label class="flex flex-col gap-1.5"><span class="st-label">Note (facultatif)</span>
        <input v-model="note" class="st-field" placeholder="Exemple : ami, test bêta" maxlength="200" aria-label="Note">
      </label>
      <div><button type="submit" class="st-btn" :disabled="admin.busy.value || !login.trim()">Inviter</button></div>
    </form>

    <section class="st-card flex flex-col gap-1 !pb-2">
      <h2 class="m-0 mb-3 text-[17px] font-bold">Chaînes invitées ({{ admin.invites.value.length }})</h2>
      <p v-if="!admin.invites.value.length" class="st-muted m-0 pb-4 text-sm">Personne n’est invité pour l’instant.</p>
      <div v-for="i in admin.invites.value" :key="i.id" class="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-st-border py-3.5">
        <div class="min-w-0 flex-1 basis-44">
          <div class="break-words text-[15px] font-bold">{{ i.login }}</div>
          <div class="text-[13px] st-muted">{{ i.note || 'Sans note' }}<span v-if="i.lastLoginAt"> · dernière connexion le {{ date(i.lastLoginAt) }}</span></div>
        </div>
        <span class="st-badge" :class="i.connected ? 'st-badge-ok' : 'st-badge-neutral'">{{ i.connected ? 'Inscrit' : 'Pas encore inscrit' }}</span>
        <button type="button" class="st-btn-quiet !text-st-error text-sm" :disabled="admin.busy.value" :aria-label="`Retirer l’invitation de ${i.login}`" @click="admin.removeInvite(i.id)">Retirer</button>
      </div>
    </section>
  </div>
</template>
