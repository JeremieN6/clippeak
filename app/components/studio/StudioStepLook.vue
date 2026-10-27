<script setup lang="ts">
// Etape 3 : titre, sous-titres, zoom d'ouverture, cadrage, avatar et illustrations, avec un apercu en direct du rendu 1080x1920 (echelle 1/4).
const studio = useStudio()
const detail = studio.detail
const avatarInput = ref<HTMLInputElement | null>(null)

const PREVIEW_W = 270
const PREVIEW_H = 480
const SCALE = PREVIEW_W / 1080
const showIllustration = ref(false)
const introScale = ref(1)
const introAnimating = ref(false)
const subtitleSample = ['on a tout', 'vu']
const titleSample = 'Il a vraiment dit ça en direct devant tout le monde et personne n\'a rien compris du tout'

// Les polices proposees sont chargees dans la page depuis les memes fichiers que ceux du rendu (apercu fidele).
const fontFaces = computed(() => (detail.value?.fonts ?? [])
  .filter((f: any) => f.file)
  .map((f: any) => `@font-face{font-family:"${f.family}";src:url("/fonts/${f.file}") format("truetype");font-weight:100 900;font-display:swap}`)
  .join('\n'))
useHead(() => ({ style: fontFaces.value ? [{ key: 'studio-fonts', innerHTML: fontFaces.value }] : [] }))

const sceneStyle = computed(() => {
  const f = detail.value?.style.framing
  if (!f) return {}
  // Meme calcul que le rendu : la source 16:9 est agrandie par le zoom, puis recadree sur le point choisi sans sortir de l'image.
  const h = PREVIEW_H * Math.max(1, f.zoom)
  const w = (h * 16) / 9
  const left = Math.min(0, Math.max(PREVIEW_W - w, PREVIEW_W / 2 - f.centerX * w))
  const top = Math.min(0, Math.max(PREVIEW_H - h, PREVIEW_H / 2 - f.centerY * h))
  return { position: 'absolute', width: `${w}px`, height: `${h}px`, left: `${left}px`, top: `${top}px`, background: 'linear-gradient(135deg,#312e81,#0f172a 55%,#064e3b)' }
})
const figureStyle = {
  position: 'absolute', left: '50%', top: '28%', height: '56%', aspectRatio: '0.8', transform: 'translateX(-50%)',
  borderRadius: '45% 45% 8% 8%', background: 'linear-gradient(#fbbf24 0 34%, #475569 34%)', opacity: '0.9'
}
const introStyle = computed(() => ({
  position: 'absolute', inset: '0', transformOrigin: 'center', transform: `scale(${introScale.value})`,
  transition: introAnimating.value ? `transform ${detail.value?.style.zoomIntro.durationSec ?? 0.6}s ease-out` : 'none'
}))
function replayIntro() {
  introAnimating.value = false
  introScale.value = 1 + (detail.value?.style.zoomIntro.amount ?? 0)
  requestAnimationFrame(() => requestAnimationFrame(() => {
    introAnimating.value = true
    introScale.value = 1
  }))
}
const illustrationStyle = {
  position: 'absolute', left: '0', width: '100%', top: `${300 * SCALE}px`, height: `${800 * SCALE}px`,
  background: 'repeating-linear-gradient(45deg,#334155,#334155 10px,#1e293b 10px,#1e293b 20px)', color: '#e2e8f0',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px'
}
const bandStyle = {
  position: 'absolute', left: '0', top: '0', width: '100%', height: `${300 * SCALE}px`, background: '#000',
  display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: `${40 * SCALE}px`, boxSizing: 'border-box'
}

// Memes regles que le rendu (titleLayout) : la place du titre depend de la taille de police.
const titleFit = computed(() => {
  const t = detail.value?.style.title
  const size = t?.fontSize ?? 68
  return {
    maxCharsPerLine: Math.max(6, Math.min(40, Math.floor(980 / (size * 0.6)))),
    maxLines: Math.max(1, Math.min(t?.maxLines ?? 3, Math.floor(250 / (size * 1.2))))
  }
})
const titleLines = computed(() => {
  const { maxCharsPerLine, maxLines } = titleFit.value
  const lines: string[] = []
  let current = ''
  for (const word of titleSample.split(' ')) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxCharsPerLine || !current) current = candidate
    else { lines.push(current); current = word }
  }
  if (current) lines.push(current)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[.,;:!?…-]+$/, '')}…`
  return kept
})
const titleTextStyle = computed(() => {
  const t = detail.value?.style.title
  if (!t) return {}
  return {
    fontFamily: `"${t.fontName}", sans-serif`, fontWeight: '700', fontSize: `${t.fontSize * SCALE}px`, lineHeight: '1.2',
    color: detail.value?.settings?.accentColor || t.color || '#fff', textAlign: 'center', whiteSpace: 'nowrap'
  }
})
const subtitleBoxStyle = { position: 'absolute', left: '0', width: '100%', bottom: `${420 * SCALE}px`, textAlign: 'center' }
const subtitleTextStyle = computed(() => {
  const s = detail.value?.style.subtitles
  if (!s) return {}
  return {
    fontFamily: `"${s.fontName}", sans-serif`, fontWeight: '800', fontSize: `${s.fontSize * SCALE}px`, color: s.color,
    textTransform: s.uppercase ? 'uppercase' : 'none', textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000'
  }
})
const avatarStyle = computed(() => {
  const o = detail.value?.style.overlay
  if (!o) return {}
  return {
    position: 'absolute', left: `${o.x * SCALE}px`, top: `${o.y * SCALE}px`, width: `${o.width * SCALE}px`, height: `${o.width * SCALE}px`,
    border: '1px dashed #fff', background: 'rgba(255,255,255,.2)', color: '#fff', fontSize: '10px',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  }
})

const avatars = computed(() => studio.assetsOf('avatar'))
async function pickAvatar(event: Event) {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files ?? [])
  target.value = ''
  if (!files.length) return
  await studio.addAssets('avatar', files)
  const newest = studio.assetsOf('avatar')[0]
  if (newest) detail.value.style.overlay.assetId = newest.id
}
</script>

<template>
  <div v-if="detail" class="grid max-w-[1100px] gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
    <div class="flex min-w-0 flex-col gap-6">
      <StudioStepHeader :n="3" tag="Facultatif" title="Le look de tes clips">
        Choisis comment s’affichent le titre, les sous-titres et le cadrage. L’aperçu se met à jour à chaque réglage.
      </StudioStepHeader>

      <!-- Titre -->
      <section class="st-card flex flex-col gap-4">
        <div class="flex items-center justify-between gap-4">
          <div><h2 class="m-0 text-[17px] font-bold">Titre en haut du clip</h2><div class="st-hint">La bande noire au-dessus de la vidéo.</div></div>
          <StudioSwitch v-model="detail.style.title.enabled" label="Afficher le titre" />
        </div>
        <template v-if="detail.style.title.enabled">
          <label class="flex flex-col gap-1.5"><span class="st-label">Police du titre</span>
            <select v-model="detail.style.title.fontName" class="st-field" aria-label="Police du titre">
              <option v-for="f in detail.fonts" :key="f.family" :value="f.family">{{ f.label }} — {{ f.note }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="flex items-center justify-between"><span class="st-label">Taille</span><span class="st-badge st-badge-violet">{{ detail.style.title.fontSize }}</span></span>
            <input v-model.number="detail.style.title.fontSize" type="range" min="30" max="120" class="st-range">
          </label>
          <div class="grid gap-4 sm:grid-cols-2">
            <label v-if="detail.settings" class="flex flex-col gap-1.5"><span class="st-label">Couleur du titre</span><input v-model="detail.settings.accentColor" type="color" class="st-field !p-1"></label>
            <label class="flex flex-col gap-1.5"><span class="st-label">Lignes maximum</span><input v-model.number="detail.style.title.maxLines" type="number" min="1" max="3" class="st-field"></label>
          </div>
          <p class="st-hint m-0">À cette taille, le titre tient sur {{ titleFit.maxLines }} ligne(s) de {{ titleFit.maxCharsPerLine }} caractères maximum ; au-delà il est raccourci avec « … ».</p>
        </template>
      </section>

      <!-- Sous-titres -->
      <section class="st-card flex flex-col gap-4">
        <div class="flex items-center justify-between gap-4">
          <div><h2 class="m-0 text-[17px] font-bold">Sous-titres</h2><div class="st-hint">Les mots s’affichent un par un, au rythme de ta voix.</div></div>
          <StudioSwitch v-model="detail.style.subtitles.enabled" label="Afficher les sous-titres" />
        </div>
        <template v-if="detail.style.subtitles.enabled">
          <div class="flex items-center justify-between gap-4"><span class="st-label">En majuscules</span><StudioSwitch v-model="detail.style.subtitles.uppercase" label="Sous-titres en majuscules" /></div>
          <label class="flex flex-col gap-1.5"><span class="st-label">Police des sous-titres</span>
            <select v-model="detail.style.subtitles.fontName" class="st-field" aria-label="Police des sous-titres">
              <option v-for="f in detail.fonts" :key="f.family" :value="f.family">{{ f.label }} — {{ f.note }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="flex items-center justify-between"><span class="st-label">Taille</span><span class="st-badge st-badge-violet">{{ detail.style.subtitles.fontSize }}</span></span>
            <input v-model.number="detail.style.subtitles.fontSize" type="range" min="40" max="160" class="st-range">
          </label>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="flex flex-col gap-1.5"><span class="st-label">Couleur des sous-titres</span><input v-model="detail.style.subtitles.color" type="color" class="st-field !p-1"></label>
            <label v-if="detail.settings" class="flex flex-col gap-1.5"><span class="st-label">Couleur du mot mis en valeur</span><input v-model="detail.settings.highlightColor" type="color" class="st-field !p-1"></label>
          </div>
          <label class="flex flex-col gap-1.5"><span class="st-label">Mettre en valeur les mots importants</span>
            <select v-model="detail.style.subtitles.autoEmphasis" class="st-field" aria-label="Mettre en valeur les mots importants">
              <option value="off">Désactivé</option>
              <option value="low">Léger : 1 mot par phrase, les plus marqués</option>
              <option value="normal">Normal</option>
              <option value="high">Fort : jusqu’à 2 ou 3 mots par phrase</option>
            </select>
            <span class="st-hint">Clippeak choisit seul, clip par clip, les mots que tu appuies à l’oral et les mots forts (chiffres, « jamais », « incroyable »…). Tu n’as rien à saisir.</span>
          </label>
          <div class="flex flex-col gap-1.5">
            <label for="st-always" class="st-label">Mots toujours mis en valeur (facultatif)</label>
            <span class="st-hint">Pour une expression fétiche ou le nom de ta chaîne : ces mots seront toujours en couleur.</span>
            <StudioChips v-model="detail.style.subtitles.keywords" input-id="st-always" />
          </div>
        </template>
        <div class="flex flex-col gap-1.5 border-t border-[#2C2837] pt-4">
          <label for="st-names" class="st-label">Noms à écrire exactement (facultatif)</label>
          <span class="st-hint">Ton pseudo, celui de tes amis, un jeu : Clippeak prévient si un nom est mal écrit dans un clip.</span>
          <StudioChips v-model="detail.style.names" input-id="st-names" placeholder="Ajouter un nom, puis Entrée" />
        </div>
      </section>

      <!-- Zoom -->
      <section class="st-card flex flex-col gap-4">
        <div class="flex items-center justify-between gap-4">
          <div><h2 class="m-0 text-[17px] font-bold">Zoom d’ouverture</h2><div class="st-hint">Un léger zoom arrière au tout début du clip.</div></div>
          <StudioSwitch v-model="detail.style.zoomIntro.enabled" label="Zoom d’ouverture" />
        </div>
        <label v-if="detail.style.zoomIntro.enabled" class="flex flex-col gap-1.5">
          <span class="flex items-center justify-between"><span class="st-label">Force du zoom</span><span class="st-badge st-badge-violet">{{ Math.round(detail.style.zoomIntro.amount * 100) }} %</span></span>
          <input v-model.number="detail.style.zoomIntro.amount" type="range" step="0.01" min="0" max="0.4" class="st-range">
        </label>
      </section>

      <!-- Cadrage -->
      <section class="st-card flex flex-col gap-4">
        <div class="flex items-center justify-between gap-4">
          <div><h2 class="m-0 text-[17px] font-bold">Cadrage de toi</h2><div class="st-hint">{{ detail.style.framing.auto ? 'Clippeak te reconnaît avec tes photos.' : 'Tu choisis la position à la main.' }}</div></div>
          <StudioSwitch v-model="detail.style.framing.auto" label="Cadrage automatique" />
        </div>
        <p v-if="detail.style.framing.auto" class="st-hint m-0">
          {{ studio.assetsOf('photo').length >= 3 ? 'Tes photos suffisent.' : `Il te faut 3 photos (tu en as ${studio.assetsOf('photo').length}) : retourne à l’étape 2.` }}
          Si tu n’es pas reconnu dans un clip, la position ci-dessous est utilisée et un avertissement apparaît.
        </p>
        <label class="flex flex-col gap-1.5"><span class="flex items-center justify-between"><span class="st-label">{{ detail.style.framing.auto ? 'Repli : ' : '' }}Gauche ou droite</span><span class="st-badge st-badge-violet">{{ detail.style.framing.centerX }}</span></span><input v-model.number="detail.style.framing.centerX" type="range" step="0.05" min="0" max="1" class="st-range"></label>
        <label class="flex flex-col gap-1.5"><span class="flex items-center justify-between"><span class="st-label">Haut ou bas</span><span class="st-badge st-badge-violet">{{ detail.style.framing.centerY }}</span></span><input v-model.number="detail.style.framing.centerY" type="range" step="0.05" min="0" max="1" class="st-range"></label>
        <label class="flex flex-col gap-1.5"><span class="flex items-center justify-between"><span class="st-label">Zoom</span><span class="st-badge st-badge-violet">{{ detail.style.framing.zoom }}</span></span><input v-model.number="detail.style.framing.zoom" type="range" step="0.1" min="1" max="3" class="st-range"></label>
      </section>

      <!-- Avatar -->
      <section class="st-card flex flex-col gap-4">
        <div class="flex items-center justify-between gap-4">
          <div><h2 class="m-0 text-[17px] font-bold">Avatar ou GIF</h2><div class="st-hint">Une image qui reste par-dessus le clip.</div></div>
          <StudioSwitch v-model="detail.style.overlay.enabled" label="Afficher l’avatar" />
        </div>
        <template v-if="detail.style.overlay.enabled">
          <div v-if="avatars.length" class="flex flex-wrap gap-3" role="radiogroup" aria-label="Fichier d’avatar">
            <button v-for="a in avatars" :key="a.id" type="button" role="radio" :aria-checked="detail.style.overlay.assetId === a.id" class="overflow-hidden rounded-xl border-2 bg-[#100F15] p-0" :class="detail.style.overlay.assetId === a.id ? 'border-[#B9A0FF]' : 'border-[#2C2837]'" @click="detail.style.overlay.assetId = a.id">
              <img :src="a.previewUrl" :alt="a.filename" class="h-20 w-20 object-cover">
            </button>
          </div>
          <div>
            <button type="button" class="st-btn-ghost" :disabled="studio.busy.value" @click="avatarInput?.click()">{{ avatars.length ? 'Ajouter un autre avatar' : 'Choisir un avatar ou un GIF' }}</button>
            <input ref="avatarInput" type="file" accept=".gif,.png,.webp" class="hidden" aria-label="Choisir un avatar" @change="pickAvatar">
          </div>
          <label class="flex flex-col gap-1.5"><span class="st-label">Moment d’apparition</span>
            <select v-model="detail.style.overlay.appear" class="st-field" aria-label="Moment d’apparition">
              <option value="always">Tout le clip</option>
              <option value="intro">Les 3 premières secondes</option>
              <option value="outro">Les 3 dernières secondes</option>
            </select>
          </label>
          <label class="flex flex-col gap-1.5"><span class="flex items-center justify-between"><span class="st-label">Gauche ou droite</span><span class="st-badge st-badge-violet">{{ detail.style.overlay.x }}</span></span><input v-model.number="detail.style.overlay.x" type="range" step="10" min="0" max="1080" class="st-range"></label>
          <label class="flex flex-col gap-1.5"><span class="flex items-center justify-between"><span class="st-label">Haut ou bas</span><span class="st-badge st-badge-violet">{{ detail.style.overlay.y }}</span></span><input v-model.number="detail.style.overlay.y" type="range" step="10" min="0" max="1920" class="st-range"></label>
          <label class="flex flex-col gap-1.5"><span class="flex items-center justify-between"><span class="st-label">Largeur</span><span class="st-badge st-badge-violet">{{ detail.style.overlay.width }}</span></span><input v-model.number="detail.style.overlay.width" type="range" step="10" min="40" max="600" class="st-range"></label>
        </template>
      </section>

      <!-- Illustrations -->
      <section class="st-card flex flex-col gap-4">
        <div class="flex items-center justify-between gap-4">
          <div><h2 class="m-0 text-[17px] font-bold">Illustrations</h2><div class="st-hint">Courtes vidéos en haut de l’écran. Tu les ajoutes à l’étape 5.</div></div>
          <StudioSwitch v-model="detail.style.illustrations.enabled" label="Activer les illustrations" />
        </div>
        <label v-if="detail.style.illustrations.enabled" class="flex flex-col gap-1.5">
          <span class="flex items-center justify-between"><span class="st-label">Illustrations par clip, au maximum</span><span class="st-badge st-badge-violet">{{ detail.style.illustrations.maxPerClip }}</span></span>
          <input v-model.number="detail.style.illustrations.maxPerClip" type="range" min="0" max="4" class="st-range">
        </label>
      </section>
    </div>

    <!-- Apercu en direct -->
    <aside class="lg:sticky lg:top-6 lg:self-start">
      <div class="st-card flex flex-col gap-3 !p-4">
        <h3 class="m-0 text-base font-bold">Aperçu en direct</h3>
        <div class="relative mx-auto overflow-hidden rounded-xl bg-black" :style="{ width: PREVIEW_W + 'px', height: PREVIEW_H + 'px' }" role="img" aria-label="Aperçu du rendu du clip">
          <div :style="introStyle"><div :style="sceneStyle"><div :style="figureStyle" /></div></div>
          <div v-if="showIllustration && detail.style.illustrations.enabled" :style="illustrationStyle">Illustration</div>
          <div v-if="detail.style.title.enabled" :style="bandStyle"><div :style="titleTextStyle"><div v-for="(line, i) in titleLines" :key="i">{{ line }}</div></div></div>
          <div v-else :style="{ position: 'absolute', left: 0, top: 0, width: '100%', height: 300 * SCALE + 'px', background: '#000' }" />
          <div v-if="detail.style.subtitles.enabled" :style="subtitleBoxStyle">
            <span :style="subtitleTextStyle">{{ subtitleSample[0] }} <span :style="{ color: detail.settings?.highlightColor || '#FFD400' }">{{ subtitleSample[1] }}</span></span>
          </div>
          <div v-if="detail.style.overlay.enabled" :style="avatarStyle">Avatar</div>
        </div>
        <label class="flex min-h-[44px] items-center gap-2 text-sm"><input v-model="showIllustration" type="checkbox" class="h-5 w-5 accent-[#7C3AED]"> Montrer une illustration</label>
        <button v-if="detail.style.zoomIntro.enabled" type="button" class="st-btn-ghost" @click="replayIntro">Rejouer le zoom d’ouverture</button>
        <p class="st-hint m-0">Aperçu fidèle pour les positions, tailles, couleurs et lignes. L’image est un décor type : le rendu utilise ta vraie vidéo.</p>
      </div>
    </aside>
  </div>
</template>
