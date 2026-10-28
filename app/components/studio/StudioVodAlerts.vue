<script setup lang="ts">
// VODs reservees aux abonnes : Clippeak ne peut les lire que si le streamer les rend publiques le temps de l'analyse. Trois cartes, selon
// l'avancement : « Action requise » (a rendre publique), « Clippeak travaille » (laisser publique), « Tu peux la remettre comme avant ».
const studio = useStudio()
const alerts = computed(() => studio.vodAlerts.value)

// Tant qu'une carte est affichee, l'etat se rafraichit tout seul (le worker reverifie toutes les 3 minutes).
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { timer = setInterval(() => { if (alerts.value.length && !studio.busy.value) studio.loadVodAlerts() }, 45_000) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <div v-if="alerts.length" class="flex flex-col gap-3 px-5 pt-4 sm:px-8" aria-label="VODs à surveiller">
    <section v-for="a in alerts" :key="a.id" class="st-card st-rise flex flex-col gap-3 !p-5" :class="a.state === 'blocked' ? '!border-[#6B5420] !bg-[#1F1A0E]' : a.state === 'restore' ? '!border-[#1F5A47] !bg-[#0F1D19]' : ''" :role="a.state === 'blocked' ? 'alert' : 'status'">
      <template v-if="a.state === 'blocked'">
        <div class="flex flex-wrap items-center gap-2"><span class="st-badge st-badge-warn">Action requise</span><h2 class="m-0 text-base font-bold">Passe ta VOD en public</h2></div>
        <p class="m-0 text-sm leading-relaxed">
          Ta VOD « <strong>{{ a.title }}</strong> » est réservée aux abonnés, et Twitch empêche Clippeak de la lire. Rends-la <strong>publique</strong> le temps qu’il récupère des extraits (environ 15 à 20 minutes). Clippeak te dira ici quand la remettre comme avant.
        </p>
        <p class="st-hint m-0">Rien d’autre n’est modifié sur ta chaîne. Clippeak vérifie tout seul toutes les 3 minutes.</p>
        <div><button type="button" class="st-btn" :disabled="studio.busy.value" @click="studio.recheckVod(a.id)">C’est fait, vérifier maintenant</button></div>
      </template>
      <template v-else-if="a.state === 'working'">
        <div class="flex flex-wrap items-center gap-2"><span class="st-badge st-badge-info">En cours</span><h2 class="m-0 text-base font-bold">Clippeak récupère tes extraits</h2></div>
        <p class="m-0 text-sm leading-relaxed">
          « <strong>{{ a.title }}</strong> » est lisible : Clippeak analyse ton live et enregistre les moments forts. <strong>Garde-la publique encore un peu.</strong> Cette carte te dira quand tu pourras la remettre comme avant.
        </p>
        <div class="h-1.5 overflow-hidden rounded-[3px] bg-[#2C2837]" role="progressbar" aria-label="Récupération des extraits"><div class="st-bar st-bar-live" style="width: 60%" /></div>
      </template>
      <template v-else>
        <div class="flex flex-wrap items-center gap-2"><span class="st-badge st-badge-ok st-pop">Terminé</span><h2 class="m-0 text-base font-bold">Tu peux remettre ta VOD comme avant</h2></div>
        <p class="m-0 text-sm leading-relaxed">
          Clippeak a récupéré tout ce dont il avait besoin dans « <strong>{{ a.title }}</strong> ». Tu peux la repasser en <strong>réservée aux abonnés</strong> : tes clips, et même « Refaire », ne dépendent plus d’elle.
        </p>
        <div><button type="button" class="st-btn" :disabled="studio.busy.value" @click="studio.ackVod(a.id)">C’est fait, je l’ai remise</button></div>
      </template>
    </section>
  </div>
</template>
