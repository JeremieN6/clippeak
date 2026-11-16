<script setup lang="ts">
// Ecran de publication Instagram (Reels) : le compte qui recevra la video est affiche, la legende est modifiable, et rien ne part sans le
// clic sur « Publier sur Instagram ». Pas de programmation : la publication part tout de suite.
const props = defineProps<{ clip: StudioClip }>()
const studio = useStudio()

const account = computed(() => studio.connections.value.find(c => c.platform === 'instagram'))
const needsReconnect = computed(() => !!account.value?.needsReconnect)
// La legende du clip contient deja le titre puis les hashtags : on part d'elle seule (sinon le titre apparait deux fois).
const caption = ref((props.clip.caption || props.clip.title || '').slice(0, 2200))
const ready = computed(() => !needsReconnect.value && !studio.busy.value)

// Comptes que Meta a assignes a Clippeak : si plusieurs, le streamer choisit celui qui recevra les Reels (Meta garde les comptes deja partages).
const accounts = ref<InstagramAccounts | null>(null)
const selected = ref('')
const switching = ref(false)
onMounted(async () => {
  if (needsReconnect.value) return
  try {
    accounts.value = await studio.loadInstagramAccounts()
    selected.value = accounts.value.selectedId ?? ''
  } catch { /* liste indisponible : on garde le compte deja choisi */ }
})
async function choose() {
  if (!selected.value || switching.value) return
  switching.value = true
  try { await studio.chooseInstagramAccount(selected.value) } finally { switching.value = false }
}

async function publish() {
  if (!ready.value) return
  await studio.publishClip(props.clip, 'instagram', null, { caption: caption.value.trim(), consent: true })
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div v-if="needsReconnect" class="st-alert st-alert-warn flex-wrap items-center">
      <div>L’accès à ton compte Instagram a expiré.</div>
      <a href="/api/auth/instagram" class="st-btn no-underline">Reconnecter Instagram</a>
    </div>
    <template v-else>
      <div class="min-w-0 text-[13px]"><div class="st-muted">Le Reel sera publié sur le compte Instagram</div><div class="truncate text-sm font-bold">@{{ account?.accountName }}</div></div>
      <label v-if="accounts && accounts.accounts.length > 1" class="flex flex-col gap-1.5">
        <span class="st-label !text-[13px]">Choisir un autre compte Instagram</span>
        <select v-model="selected" class="st-field" :disabled="switching || studio.busy.value" @change="choose">
          <option v-for="a in accounts.accounts" :key="a.id" :value="a.id">@{{ a.username || a.id }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="st-label !text-[13px]">Légende et hashtags sur Instagram</span>
        <textarea v-model="caption" rows="4" maxlength="2200" class="st-field" />
      </label>
      <div><button type="button" class="st-btn" :disabled="!ready" @click="publish">Publier sur Instagram</button></div>
      <p class="m-0 text-[12px] leading-4 st-muted">Clippeak n’ajoute aucun filigrane. Le Reel peut mettre quelques minutes à apparaître sur ton profil. Ton compte doit être professionnel (Pro ou Créateur).</p>
    </template>
  </div>
</template>
