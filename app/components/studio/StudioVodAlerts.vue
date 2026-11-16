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
  <div v-if="alerts.length" class="flex flex-col gap-3" aria-label="VODs à surveiller">
    <section v-for="a in alerts" :key="a.id" class="st-card st-rise flex flex-col gap-3 !p-5" :class="a.state === 'blocked' ? '!border-st-warnBorder' : a.state === 'restore' ? '!border-st-okBorder !bg-st-okBg' : ''" :role="a.state === 'blocked' ? 'alert' : 'status'">
      <template v-if="a.state === 'blocked'">
        <div class="text-[13px] font-bold text-st-dim">{{ a.title }}</div>
        <div class="flex items-start gap-3">
          <span class="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-st-warnBg text-st-warn" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11h14v9H5zM8 11V8a4 4 0 018 0v3" /></svg></span>
          <div class="flex min-w-0 flex-col gap-1">
            <h2 class="st-title m-0 text-[17px] font-bold leading-6">VOD réservée aux abonnés, impossible de la lire</h2>
            <div class="text-sm leading-[22px] text-st-soft">Cette rediffusion est réservée aux abonnés de ta chaîne : Clippeak ne peut pas la lire.</div>
            <div class="text-sm leading-[22px] st-muted">Rends-la <strong>publique</strong> sur Twitch le temps de l’analyse (15 à 20 minutes), puis réessaie. Clippeak vérifie aussi tout seul toutes les 3 minutes, et te dira ici quand la remettre comme avant.</div>
          </div>
        </div>
        <div><button type="button" class="st-btn !min-h-12" :disabled="studio.busy.value" @click="studio.recheckVod(a.id)">Réessayer</button></div>
      </template>      <template v-else-if="a.state === 'working'">
        <div class="flex flex-wrap items-center gap-2"><span class="st-badge st-badge-info">En cours</span><h2 class="m-0 text-base font-bold">Clippeak récupère tes extraits</h2></div>
        <p class="m-0 text-sm leading-relaxed">
          « <strong>{{ a.title }}</strong> » est lisible : Clippeak analyse ton live et enregistre les moments forts. <strong>Garde-la publique encore un peu.</strong> Cette carte te dira quand tu pourras la remettre comme avant.
        </p>
        <div class="h-1.5 overflow-hidden rounded-[3px] bg-st-border" role="progressbar" aria-label="Récupération des extraits"><div class="st-bar st-bar-live" style="width: 60%" /></div>
      </template>
      <template v-else>
        <div class="flex flex-wrap items-center gap-2"><span class="st-badge st-badge-ok st-pop">Terminé</span><h2 class="m-0 text-base font-bold">Tu peux remettre ta VOD comme avant</h2></div>
        <p class="m-0 text-sm leading-relaxed">
          Clippeak a récupéré tout ce dont il avait besoin dans « <strong>{{ a.title }}</strong> ». Tu peux la remettre <strong>comme elle était</strong> (réservée aux abonnés ou non publiée) : tes clips, et même « Refaire », ne dépendent plus d’elle.
        </p>
        <div><button type="button" class="st-btn" :disabled="studio.busy.value" @click="studio.ackVod(a.id)">C’est fait, je l’ai remise</button></div>
      </template>
    </section>
  </div>
</template>
