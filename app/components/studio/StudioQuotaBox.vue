<script setup lang="ts">
// Boîte « Lives / Clips ce mois-ci » de la colonne de gauche (maquette « Boîte de quota ») : c'est ici que vit l'offre au quotidien.
// Violet normalement, ambre à partir de 80 %, rouge à 100 %. Plus aucune bannière d'abonnement en haut de page.
import { quotaLevel } from '~~/server/utils/clipping/quota'

const studio = useStudio()
const q = computed(() => studio.quota.value)
const b = computed(() => studio.billing.value)
const level = computed(() => q.value ? quotaLevel(q.value) : 'ok')
const creator = computed(() => b.value?.plan === 'creator')
const lives = computed(() => q.value?.unit === 'lives')
const title = computed(() => lives.value ? 'Lives ce mois-ci' : 'Clips ce mois-ci')
const pct = computed(() => q.value && q.value.limit ? Math.min(100, Math.round(q.value.used / Math.max(1, q.value.limit) * 100)) : 0)
const tone = computed(() => level.value === 'reached' ? 'var(--st-error)' : level.value === 'near' ? 'var(--st-warn)' : '')
const border = computed(() => level.value === 'reached' ? 'border-st-errorBorder' : level.value === 'near' ? 'border-st-warnBorder' : 'border-st-border')
const resetDate = computed(() => {
  if (!q.value) return ''
  const d = new Date(q.value.resetsAt)
  return `${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${d.toLocaleDateString('fr-FR', { month: 'long', timeZone: 'UTC' })}`
})
const planLine = computed(() => {
  if (!b.value?.available || !b.value.planName) return ''
  const renews = b.value.renewsAt ? new Date(b.value.renewsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : ''
  return creator.value ? `Offre ${b.value.planName}${(b.value.packs ?? 1) > 1 ? ` · ${b.value.packs} packs` : ''}${renews ? ` · renouvelée le ${renews}` : ''}` : `Offre ${b.value.planName}`
})
const cta = computed(() => !b.value?.available || level.value !== 'reached' ? '' : creator.value ? 'Ajouter un pack' : 'Passer à Creator')
const act = () => {
  if (creator.value) studio.openPortal()
  else studio.view.value = 'offer'
}
</script>

<template>
  <section v-if="q && q.limit !== null" class="flex flex-col gap-3 rounded-xl border bg-st-surface p-3.5" :class="border" :aria-label="title">
    <div class="flex items-baseline justify-between gap-2"><span class="text-[13px] font-bold">{{ title }}</span><span class="text-[13px] st-muted"><strong class="font-extrabold text-st-text">{{ q.used }}</strong> / {{ q.limit }}</span></div>
    <div class="h-1.5 overflow-hidden rounded-[3px] bg-st-raised2" role="progressbar" :aria-label="title" aria-valuemin="0" :aria-valuemax="q.limit" :aria-valuenow="q.used"><div class="st-bar h-full" :style="{ width: `${pct}%`, ...(tone ? { background: tone } : {}) }" /></div>
    <div v-if="level === 'near' && !lives" class="flex items-start gap-2 text-[13px] font-bold leading-[19px]" style="color: var(--st-warn)"><span class="mt-[5px] h-2 w-2 flex-none rounded-full bg-current" aria-hidden="true" />Plus que {{ q.remaining }} clip{{ (q.remaining ?? 0) > 1 ? 's' : '' }} ce mois-ci.</div>
    <div v-if="level === 'reached'" class="flex items-start gap-2 text-[13px] font-bold leading-[19px]" style="color: var(--st-error)"><span class="mt-[5px] h-2 w-2 flex-none rounded-full bg-current" aria-hidden="true" />Limite atteinte jusqu’au {{ resetDate }}.</div>
    <button v-if="cta" type="button" class="st-btn w-full !min-h-11" :disabled="studio.busy.value" @click="act">{{ cta }}</button>
    <button v-if="level === 'reached' && !creator" type="button" class="flex min-h-11 items-center bg-transparent p-0 text-left text-[13px] font-bold leading-[18px] text-st-accentLight underline underline-offset-[3px]" @click="studio.view.value = 'referral'">Inviter un streamer pour gagner un live</button>
    <div v-if="planLine" class="-mt-0.5 flex items-center justify-between gap-2 border-t border-st-border pt-1.5">
      <span class="text-xs leading-[18px] text-st-dim">{{ planLine }}</span>
      <button type="button" class="inline-flex min-h-11 flex-none items-center bg-transparent p-0 text-[13px] font-bold text-st-accentLight" @click="studio.view.value = 'offer'">Mon offre</button>
    </div>
  </section>
</template>
