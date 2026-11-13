<script setup lang="ts">
// Page « Videos longues » : extraits de live de plusieurs minutes (16:9) pour YouTube. En haut, comment ca marche et l'etat de YouTube ;
// puis le reglage et la demande d'un passage ; puis les videos, par etat (a valider, pretes a publier, publiees, en preparation, refusees, en echec).
const studio = useStudio()

const back = () => { studio.view.value = studio.onboarding.value?.completed || studio.clips.value.length ? 'dashboard' : 'onboarding' }
const youtube = computed(() => studio.connections.value.find(c => c.platform === 'youtube'))
const enabled = ref<boolean | null>(null)

type Group = 'review' | 'approved' | 'published' | 'progress' | 'rejected' | 'failed'
const groupOf = (c: StudioClip): Group => isPublished(c) ? 'published' : c.status === 'queued' || c.status === 'rendering' ? 'progress' : (c.status as Group)
const groups: Array<{ key: Group, title: string, hint: string }> = [
  { key: 'review', title: 'À valider', hint: 'Regarde l’extrait, ajuste le titre, puis approuve-le ou refuse-le.' },
  { key: 'approved', title: 'Prêtes à publier', hint: 'Approuvées : rien n’est publié tant que tu ne le demandes pas.' },
  { key: 'progress', title: 'En préparation', hint: 'Clippeak découpe la vidéo, compte quelques minutes.' },
  { key: 'published', title: 'Publiées', hint: '' },
  { key: 'failed', title: 'En échec', hint: 'Le rendu a échoué : tu peux le refaire depuis la carte.' },
  { key: 'rejected', title: 'Refusées', hint: '' }
]
const longClips = computed(() => studio.clips.value.filter(c => c.format === 'long'))
const sections = computed(() => groups
  .map(g => ({ ...g, list: longClips.value.filter(c => groupOf(c) === g.key).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) }))
  .filter(g => g.list.length))

// Tant qu'un extrait se prepare, la page se rafraichit toute seule.
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { timer = setInterval(() => { if (!studio.busy.value && longClips.value.some(c => groupOf(c) === 'progress')) studio.loadClips() }, 15_000) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <main class="mx-auto flex w-full max-w-[1080px] flex-col gap-7 px-5 pb-16 pt-6 sm:px-8 sm:pt-9">
    <div class="flex max-w-[680px] flex-col gap-2">
      <button type="button" class="-ml-2 inline-flex h-11 items-center gap-1.5 self-start rounded-[10px] border-0 bg-transparent px-2 text-sm font-bold text-st-muted hover:text-st-text" @click="back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        Retour
      </button>
      <h1 class="st-title m-0 text-[34px] font-extrabold leading-10">Vidéos longues</h1>
      <p class="m-0 text-base leading-[26px] st-muted">
        Publie sur YouTube un passage de ton live de plusieurs minutes, au format horizontal 16:9, en plus de tes clips verticaux.
        Tu choisis le début et la fin, Clippeak le coupe, tu le vérifies, puis tu le publies.
      </p>
    </div>

    <section class="st-card flex flex-col gap-3 !p-5" aria-label="Connexion YouTube">
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="st-title m-0 text-lg font-bold">YouTube</h2>
        <span v-if="youtube?.connected" class="st-badge st-badge-ok">Connecté</span>
        <span v-else class="st-badge st-badge-warn">Pas connecté</span>
        <a v-if="youtube?.available && !youtube?.connected" href="/api/auth/youtube" class="st-btn no-underline">Connecter YouTube</a>
      </div>
      <p class="m-0 text-sm leading-relaxed st-muted">
        <template v-if="youtube?.connected">Les vidéos longues sont publiées sur la chaîne YouTube que tu as choisie à la connexion.<template v-if="youtube?.accountName"> Compte : {{ youtube.accountName }}.</template></template>
        <template v-else>Il faut connecter YouTube pour publier. Pour une chaîne secondaire (compte de marque), choisis-la quand Google te demande sur quelle chaîne publier.</template>
        Tant que Google n’a pas validé Clippeak, YouTube garde les vidéos en privé : tu pourras les passer en public depuis YouTube Studio.
      </p>
    </section>

    <StudioLongExtracts @loaded="enabled = $event" />

    <template v-if="sections.length">
      <section v-for="s in sections" :key="s.key" class="flex flex-col gap-4">
        <div class="flex flex-col gap-0.5">
          <h2 class="st-title m-0 text-[22px] font-bold leading-7">{{ s.title }} <span class="text-base font-semibold st-muted">({{ s.list.length }})</span></h2>
          <div v-if="s.hint" class="text-[13px] st-muted">{{ s.hint }}</div>
        </div>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(min(560px,100%),1fr))] items-start gap-4">
          <StudioClipCard v-for="c in s.list" :key="c.id + c.status" :clip="c" />
        </div>
      </section>
    </template>
    <div v-else-if="enabled" class="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-st-borderStrong px-6 py-10 text-center">
      <h2 class="st-title m-0 text-lg font-bold">Pas encore de vidéo longue</h2>
      <p class="m-0 max-w-sm text-sm leading-relaxed st-muted">Prépare ton premier extrait avec le formulaire ci-dessus : il apparaîtra ici dès qu’il est prêt.</p>
    </div>
  </main>
</template>
