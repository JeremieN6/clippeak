<script setup lang="ts">
// Cloche de la barre du haut : pastille quand il y a du nouveau, petite fenetre avec les notifications (vote lance, resultat,
// fonction livree). L'ouverture les marque comme lues ; on garde l'aspect « non lu » le temps que la fenetre reste ouverte.
const studio = useStudio()

interface Item { id: string, kind: string, title: string, body: string, createdAt: string, read: boolean }
const items = ref<Item[]>([])
const unread = ref(0)
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const asAdmin = computed(() => studio.mode.value === 'admin' ? studio.channelId.value : undefined)

async function load() {
  try {
    const r = await $fetch<{ items: Item[], unread: number }>('/api/studio/notifications', { query: { channel: asAdmin.value } })
    if (!open.value) items.value = r.items
    unread.value = r.unread
  } catch { /* la cloche ne doit jamais gener le studio */ }
}

async function toggle() {
  open.value = !open.value
  if (!open.value) return
  await load()
  items.value = items.value.map(i => ({ ...i }))
  if (unread.value) {
    try {
      await $fetch('/api/studio/notifications/read', { method: 'POST', body: { channelId: asAdmin.value } })
      unread.value = 0
    } catch { /* reessaye a la prochaine ouverture */ }
  }
}

function go(n: Item) {
  if (n.kind.startsWith('roadmap')) studio.view.value = 'roadmap'
  else if (n.kind === 'batch_ready') studio.view.value = 'dashboard'
  open.value = false
}

const ago = (value: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000))
  if (min < 1) return 'à l’instant'
  if (min < 60) return `il y a ${min} min`
  if (min < 1440) return `il y a ${Math.round(min / 60)} h`
  return `il y a ${Math.round(min / 1440)} j`
}

const away = (e: MouseEvent) => { if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false }
const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') open.value = false }
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  load()
  timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, 60_000)
  document.addEventListener('click', away)
  document.addEventListener('keydown', esc)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  document.removeEventListener('click', away)
  document.removeEventListener('keydown', esc)
})
watch(() => studio.channelId.value, load)
</script>

<template>
  <div ref="root" class="relative">
    <button type="button" class="relative flex h-11 w-11 items-center justify-center rounded-[10px] border border-st-border bg-st-surface text-st-soft hover:bg-st-raised" aria-haspopup="dialog" :aria-expanded="open" :aria-label="unread ? `Notifications, ${unread} non lue${unread > 1 ? 's' : ''}` : 'Notifications'" @click="toggle">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.3 20a1.9 1.9 0 0 0 3.4 0" /></svg>
      <span v-if="unread" class="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-st-accent ring-2 ring-st-bg" aria-hidden="true" />
    </button>

    <div v-if="open" role="dialog" aria-label="Notifications" class="absolute right-0 top-[52px] z-40 flex max-h-[70vh] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-st-borderStrong bg-st-surface shadow-[0_12px_32px_rgba(0,0,0,.45)]">
      <div class="border-b border-st-border px-4 py-3 text-sm font-bold">Notifications</div>
      <p v-if="!items.length" class="m-0 px-4 py-8 text-center text-sm st-muted">Rien de nouveau pour le moment.</p>
      <ul v-else class="m-0 flex list-none flex-col overflow-y-auto p-0">
        <li v-for="n in items" :key="n.id" class="border-b border-st-border last:border-b-0">
          <button type="button" class="flex min-h-11 w-full gap-3 bg-transparent px-4 py-3 text-left text-st-text hover:bg-st-raised" @click="go(n)">
            <span class="mt-1.5 h-2 w-2 flex-none rounded-full" :class="n.read ? 'bg-transparent' : 'bg-st-accent'" aria-hidden="true" />
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="text-sm font-bold">{{ n.title }}<span v-if="!n.read" class="sr-only"> (nouveau)</span></span>
              <span class="text-[13px] leading-5 st-muted">{{ n.body }}</span>
              <span class="text-xs text-st-dim">{{ ago(n.createdAt) }}</span>
            </span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
