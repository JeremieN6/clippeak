<script setup lang="ts">
// Ecran de publication TikTok. Il suit les regles de TikTok pour la publication directe : pseudo du compte affiche, visibilite choisie
// a la main (aucune valeur par defaut), commentaires / duo / stitch decoches au depart et grises si le compte les interdit,
// divulgation de contenu commercial desactivee au depart, phrase d'accord avant le bouton, aucun filigrane ajoute, aucun envoi sans clic.
const props = defineProps<{ clip: StudioClip }>()
const studio = useStudio()

const creator = ref<TiktokCreator | null>(null)
const loadError = ref('')
const loading = ref(true)

// La legende du clip contient deja le titre puis les hashtags : on part d'elle seule (sinon le titre apparait deux fois).
const title = ref((props.clip.caption || props.clip.title || '').slice(0, 2200))
const privacy = ref('')
const allowComment = ref(false)
const allowDuet = ref(false)
const allowStitch = ref(false)
const disclosure = ref(false)
const brandOrganic = ref(false)
const brandContent = ref(false)

const privacyLabel: Record<string, string> = {
  PUBLIC_TO_EVERYONE: 'Tout le monde',
  MUTUAL_FOLLOW_FRIENDS: 'Amis (abonnements mutuels)',
  FOLLOWER_OF_CREATOR: 'Mes abonnés',
  SELF_ONLY: 'Moi uniquement'
}

onMounted(async () => {
  try {
    creator.value = await studio.loadTiktokCreator()
  } catch (error: any) {
    loadError.value = error?.data?.statusMessage || 'TikTok ne répond pas pour le moment. Réessaie dans quelques minutes.'
  } finally {
    loading.value = false
  }
})

// Un contenu de marque ne peut pas etre prive : on desactive l'option (et on le dit) plutot que de changer la visibilite en silence.
const brandBlocked = computed(() => privacy.value === 'SELF_ONLY')
watch(privacy, () => { if (brandBlocked.value) brandContent.value = false })
watch(disclosure, (on) => { if (!on) { brandOrganic.value = false; brandContent.value = false } })

const disclosureMissing = computed(() => disclosure.value && !brandOrganic.value && !brandContent.value)
const tooLong = computed(() => !!props.clip.durationSec && !!creator.value?.maxVideoDurationSec && props.clip.durationSec > creator.value.maxVideoDurationSec)
const ready = computed(() => !!creator.value && !!privacy.value && !!title.value.trim() && !disclosureMissing.value && !tooLong.value && !studio.busy.value)

// Phrase d'accord (texte de TikTok) : selon la divulgation commerciale.
const consentKind = computed<'music' | 'brand'>(() => (disclosure.value && brandContent.value ? 'brand' : 'music'))

async function publish() {
  if (!ready.value) return
  await studio.publishClip(props.clip, 'tiktok', null, {
    title: title.value.trim(),
    privacyLevel: privacy.value,
    disableComment: !allowComment.value,
    disableDuet: !allowDuet.value,
    disableStitch: !allowStitch.value,
    brandOrganic: disclosure.value && brandOrganic.value,
    brandContent: disclosure.value && brandContent.value,
    consent: true
  })
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <p v-if="loading" class="m-0 text-[13px] st-muted">Lecture des informations de ton compte TikTok…</p>
    <div v-else-if="loadError" class="st-alert st-alert-warn"><div>{{ loadError }}</div></div>

    <template v-else-if="creator">
      <div class="flex items-center gap-3">
        <img v-if="creator.avatarUrl" :src="creator.avatarUrl" alt="" class="h-10 w-10 rounded-full object-cover" referrerpolicy="no-referrer">
        <div class="min-w-0 text-[13px]"><div class="st-muted">La vidéo sera publiée sur le compte TikTok</div><div class="truncate text-sm font-bold">{{ creator.nickname || creator.username }}</div></div>
      </div>

      <div v-if="tooLong" class="st-alert st-alert-warn"><div>Ce clip dure plus que ce que ton compte TikTok permet ({{ creator.maxVideoDurationSec }} s).</div></div>

      <label class="flex flex-col gap-1.5">
        <span class="st-label !text-[13px]">Titre et hashtags sur TikTok</span>
        <textarea v-model="title" rows="4" maxlength="2200" class="st-field" />
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="st-label !text-[13px]">Qui peut voir cette vidéo</span>
        <select v-model="privacy" class="st-field !min-h-10" required>
          <option value="" disabled>Choisis la visibilité…</option>
          <option v-for="o in creator.privacyOptions" :key="o" :value="o">{{ privacyLabel[o] ?? o }}</option>
        </select>
      </label>

      <fieldset class="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
        <legend class="st-label mb-1 p-0 !text-[13px]">Autoriser les autres à</legend>
        <label class="flex min-h-11 items-center gap-3" :class="creator.commentDisabled ? 'opacity-50' : ''"><input v-model="allowComment" type="checkbox" class="m-0 h-5 w-5 accent-st-accent" :disabled="creator.commentDisabled"><span class="text-sm">Commenter<template v-if="creator.commentDisabled"> (désactivé sur ton compte)</template></span></label>
        <label class="flex min-h-11 items-center gap-3" :class="creator.duetDisabled ? 'opacity-50' : ''"><input v-model="allowDuet" type="checkbox" class="m-0 h-5 w-5 accent-st-accent" :disabled="creator.duetDisabled"><span class="text-sm">Faire un duo<template v-if="creator.duetDisabled"> (désactivé sur ton compte)</template></span></label>
        <label class="flex min-h-11 items-center gap-3" :class="creator.stitchDisabled ? 'opacity-50' : ''"><input v-model="allowStitch" type="checkbox" class="m-0 h-5 w-5 accent-st-accent" :disabled="creator.stitchDisabled"><span class="text-sm">Faire un stitch<template v-if="creator.stitchDisabled"> (désactivé sur ton compte)</template></span></label>
      </fieldset>

      <div class="flex flex-col gap-1">
        <label class="flex min-h-11 items-center gap-3"><input v-model="disclosure" type="checkbox" class="m-0 h-5 w-5 accent-st-accent"><span class="text-sm font-semibold">Divulguer un contenu commercial</span></label>
        <div v-if="disclosure" class="flex flex-col gap-1 pl-8">
          <p class="m-0 text-[13px] leading-5 st-muted">Indique si ta vidéo promeut toi-même, un tiers, ou les deux.</p>
          <label class="flex min-h-11 items-center gap-3"><input v-model="brandOrganic" type="checkbox" class="m-0 h-5 w-5 accent-st-accent"><span class="text-sm">Ma marque <span class="st-muted">(la vidéo sera marquée « Contenu promotionnel »)</span></span></label>
          <label class="flex min-h-11 items-center gap-3" :class="brandBlocked ? 'opacity-50' : ''"><input v-model="brandContent" type="checkbox" class="m-0 h-5 w-5 accent-st-accent" :disabled="brandBlocked"><span class="text-sm">Contenu de marque <span class="st-muted">(la vidéo sera marquée « Partenariat payant »)</span></span></label>
          <p v-if="brandBlocked" class="m-0 text-[13px] st-muted">Un contenu de marque ne peut pas être privé : choisis une autre visibilité pour l’activer.</p>
          <p v-if="disclosureMissing" class="m-0 text-[13px] text-st-error">Coche au moins une option.</p>
        </div>
      </div>

      <p class="m-0 text-[13px] leading-5 st-muted">
        <template v-if="consentKind === 'brand'">En publiant, tu acceptes la <a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noopener" class="text-st-accentLight">Politique de contenu de marque</a> et la <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener" class="text-st-accentLight">Confirmation d’utilisation de la musique</a> de TikTok.</template>
        <template v-else>En publiant, tu acceptes la <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener" class="text-st-accentLight">Confirmation d’utilisation de la musique</a> de TikTok.</template>
      </p>

      <div><button type="button" class="st-btn" :disabled="!ready" @click="publish">Publier sur TikTok</button></div>
      <p class="m-0 text-[12px] leading-4 st-muted">Clippeak n’ajoute aucun filigrane. La vidéo peut mettre quelques minutes à apparaître sur ton profil. Tant que TikTok n’a pas validé Clippeak, elle reste visible de toi seul.</p>
    </template>
  </div>
</template>
