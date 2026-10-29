<script setup lang="ts">
// Etape 7 : choix des plateformes. La connexion de chaque compte et la publication directe ne sont pas encore disponibles
// (chaque plateforme doit d'abord valider Clippeak) : le choix est enregistre, et le telechargement des clips reste la voie sure.
const studio = useStudio()
const chosen = computed<string[]>(() => studio.onboarding.value?.platforms ?? [])
const conn = (id: string) => studio.connections.value.find(c => c.platform === id)

const tags = computed<string[]>(() => studio.detail.value?.style.caption?.tags ?? [])

function toggle(id: string) {
  studio.setPlatforms(chosen.value.includes(id) ? chosen.value.filter(p => p !== id) : [...chosen.value, id])
}
</script>

<template>
  <div class="flex max-w-[820px] flex-col gap-6">
    <StudioStepHeader :n="7" tag="Tu peux la passer" title="Tes plateformes">
      Choisis où partiront tes clips. Rien n’est publié sans ton accord.
    </StudioStepHeader>

    <fieldset class="m-0 flex min-w-0 flex-col gap-3.5 border-0 p-0">
      <legend class="st-title mb-3.5 p-0 text-xl font-bold leading-7">Vers quelles plateformes veux-tu publier tes clips ?</legend>
      <div v-for="p in PLATFORM_LIST" :key="p.id" class="rounded-2xl bg-st-surface px-6" :class="chosen.includes(p.id) ? 'border border-st-accentBorder' : 'border border-st-border'">
        <label class="flex min-h-[76px] cursor-pointer items-center gap-3.5">
          <span class="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-[#252130]" aria-hidden="true"><StudioPlatformLogo :id="p.id" /></span>
          <span class="flex min-w-0 flex-1 flex-col gap-0.5"><span class="text-base font-bold">{{ p.name }}</span><span class="text-[13px] st-muted">{{ p.sub }}</span></span>
          <input type="checkbox" :checked="chosen.includes(p.id)" :disabled="studio.busy.value" :aria-label="`Publier sur ${p.name}`" class="m-0 h-6 w-6 flex-none accent-st-accent" @change="toggle(p.id)">
        </label>
        <div v-if="chosen.includes(p.id)" class="flex flex-col gap-3 border-t border-st-border pb-5 pt-4">
          <template v-if="conn(p.id)?.available">
            <div v-if="conn(p.id)?.connected" class="flex flex-wrap items-center gap-3">
              <span class="st-badge st-badge-ok st-pop">Connecté</span>
              <button type="button" class="st-btn-quiet" :disabled="studio.busy.value" @click="studio.disconnectPlatform(p.id)">Déconnecter</button>
            </div>
            <div v-else><a href="/api/auth/youtube" class="st-btn no-underline">Connecter {{ p.name }}</a></div>
            <div class="text-sm leading-relaxed st-muted">Clippeak publie seulement un clip que tu as approuvé, quand tu le demandes. Tant que Google n’a pas validé Clippeak, YouTube garde ces vidéos en privé.</div>
          </template>
          <template v-else>
            <div><span class="st-badge st-badge-neutral">Connexion bientôt disponible</span></div>
            <div class="text-sm leading-relaxed st-muted">Ton choix est enregistré. En attendant, tu peux télécharger tes clips approuvés et les publier toi-même.</div>
          </template>
        </div>
      </div>
    </fieldset>

    <div class="st-card flex flex-col gap-3">
      <div><div class="text-base font-bold">Tes hashtags</div><div class="st-hint">1 ou 2 hashtags à toi, placés en premier dans la légende de chaque clip (par exemple le nom de ta communauté). Clippeak ajoute ensuite 2 ou 3 hashtags liés au clip, jamais ton pseudo.</div></div>
      <StudioChips :model-value="tags" input-id="st-caption-tags" placeholder="Ajouter un hashtag, puis Entrée" :max="2" @update:model-value="studio.setCaptionTags" />
    </div>

    <div class="st-alert st-alert-info">
      <div><strong class="font-extrabold">La publication automatique dépend de chaque plateforme.</strong> <span class="text-[#B9D2FF]">Chacune doit d’abord accepter Clippeak, ce qui peut prendre du temps. En attendant, tu peux toujours télécharger tes clips et les publier toi-même.</span></div>
    </div>

    <div class="st-card flex flex-wrap items-center gap-3.5">
      <div class="min-w-0 flex-1 basis-56"><div class="text-base font-bold">Je publie à la main</div><div class="st-hint">Toujours possible : télécharge n’importe quel clip approuvé, prêt pour TikTok, Reels et Shorts.</div></div>
      <span class="st-badge st-badge-ok">Disponible</span>
    </div>
  </div>
</template>
